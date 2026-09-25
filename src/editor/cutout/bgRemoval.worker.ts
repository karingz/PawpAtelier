/// <reference lib="webworker" />
// Background removal ("누끼") off the main thread.
//
// Two models:
// - RMBG finds the salient subject and gives soft, fur-friendly edges.
// - SlimSAM (Apache-2.0) segments "the thing you pointed at", from lasso/taps.
// A lasso cutout blends them (see lassoMasks): SAM decides which objects stay, RMBG supplies
// the edge detail, and anything outside the user's loop is dropped.
//
// ⚠️ NON-COMMERCIAL MODEL: BRIA RMBG-1.4 is only licensed for non-commercial use. It is listed in
// src/config/non-commercial.json and must be replaced (BiRefNet on a server, or a paid BRIA
// license) before the shop goes live. Swapping it only touches `rmbgMask` below.

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  SamModel,
  Tensor,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers'
import type { CutoutPrompt, CutoutRequest, CutoutResponse, Tap } from './protocol'

const RMBG_ID = 'briaai/RMBG-1.4'
const SAM_ID = 'Xenova/slimsam-77-uniform'
/** Working size for SAM, previews and mask morphology (long edge, px). */
const SMALL = 1024

env.allowLocalModels = false

const post = (msg: CutoutResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)

// ---------------------------------------------------------------------------------------------
// Model loading (once per worker), with summed download progress for the current request.

let currentRequest = ''
const downloads = new Map<string, { loaded: number; total: number }>()
function progress_callback(p: { status: string; file?: string; name?: string; loaded?: number; total?: number }) {
  if (p.status !== 'progress' || !p.file) return
  downloads.set(`${p.name}/${p.file}`, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
  let loaded = 0
  let total = 0
  for (const f of downloads.values()) {
    loaded += f.loaded
    total += f.total
  }
  if (total > 0) post({ id: currentRequest, type: 'progress', phase: 'download', percent: (loaded / total) * 100 })
}

let device: 'webgpu' | 'wasm' | null = null
async function pickDevice() {
  if (!device) {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
    device = gpu && (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'
  }
  return device
}

type Rmbg = { model: PreTrainedModel; processor: Processor; dtype: string }
let rmbgLoading: Promise<Rmbg> | null = null
function loadRmbg() {
  rmbgLoading ??= (async () => {
    const dev = await pickDevice()
    // fp16 keeps soft fur edges; the 8-bit model is smaller but bands the alpha a little.
    const dtype = dev === 'webgpu' ? 'fp16' : 'q8'
    const model = await AutoModel.from_pretrained(RMBG_ID, {
      // RMBG is a custom architecture; load it as a plain ONNX model.
      config: { model_type: 'custom' } as never,
      device: dev,
      dtype,
      progress_callback,
    })
    const processor = await AutoProcessor.from_pretrained(RMBG_ID, { progress_callback })
    return { model, processor, dtype }
  })()
  rmbgLoading.catch(() => (rmbgLoading = null))
  return rmbgLoading
}

type Sam = { model: SamModel; processor: Processor }
let samLoading: Promise<Sam> | null = null
function loadSam() {
  samLoading ??= (async () => {
    const dev = await pickDevice()
    const model = (await SamModel.from_pretrained(SAM_ID, {
      device: dev,
      dtype: dev === 'webgpu' ? 'fp16' : 'q8',
      progress_callback,
    })) as SamModel
    const processor = await AutoProcessor.from_pretrained(SAM_ID, { progress_callback })
    return { model, processor }
  })()
  samLoading.catch(() => (samLoading = null))
  return samLoading
}

// ---------------------------------------------------------------------------------------------
// Per-photo caches (the most recent photo only; users work on one photo at a time).

type Mask = { data: Uint8Array | Uint8ClampedArray; width: number; height: number }

let rmbgCache: { src: string; mask: RawImage } | null = null
/** RMBG's raw 1024x1024 foreground mask for a photo. */
async function rmbgMask(src: string, image: RawImage): Promise<RawImage> {
  if (rmbgCache?.src === src) return rmbgCache.mask
  const { model, processor } = await loadRmbg()
  post({ id: currentRequest, type: 'progress', phase: 'running', percent: 0 })
  const { pixel_values } = await processor(image)
  const { output } = await model({ input: pixel_values })
  const mask = RawImage.fromTensor(output[0].mul(255).to('uint8'))
  rmbgCache = { src, mask }
  return mask
}

type SamState = { src: string; embeddings: Record<string, Tensor>; reshaped: [number, number] }
let samCache: SamState | null = null
async function samEmbeddings(src: string, small: RawImage): Promise<SamState> {
  if (samCache?.src === src) return samCache
  const { model, processor } = await loadSam()
  post({ id: currentRequest, type: 'progress', phase: 'running', percent: 0 })
  const inputs = await processor(small)
  const embeddings = await model.get_image_embeddings(inputs)
  samCache = { src, embeddings, reshaped: inputs.reshaped_input_sizes[0] as [number, number] }
  return samCache
}

let imageCache: { src: string; full: RawImage; small: RawImage } | null = null
async function images(src: string) {
  if (imageCache?.src === src) return imageCache
  const full = await RawImage.fromURL(src)
  const scale = Math.min(1, SMALL / Math.max(full.width, full.height))
  const small = scale < 1 ? await full.resize(Math.round(full.width * scale), Math.round(full.height * scale)) : full
  imageCache = { src, full, small }
  return imageCache
}

// ---------------------------------------------------------------------------------------------
// Mask helpers (all on the small working size).

async function resizeMask(mask: Mask | RawImage, width: number, height: number): Promise<Uint8ClampedArray> {
  const img = mask instanceof RawImage ? mask : new RawImage(new Uint8ClampedArray(mask.data), mask.width, mask.height, 1)
  const out = img.width === width && img.height === height ? img : await img.resize(width, height)
  return new Uint8ClampedArray(out.data)
}

/** Max (dilate) or min (erode) filter with a square window, separable, on a 0..255 mask. */
function morph(src: Uint8ClampedArray, w: number, h: number, r: number, op: 'dilate' | 'erode') {
  const pick = op === 'dilate' ? Math.max : Math.min
  const tmp = new Uint8ClampedArray(src.length)
  const out = new Uint8ClampedArray(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = src[y * w + x]
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k])
      tmp[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x]
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x])
      out[y * w + x] = v
    }
  }
  return out
}

/** The lasso polygon rasterized at w x h (255 inside), softened a touch at the edge. */
function polygonMask(poly: [number, number][], w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.filter = `blur(${Math.max(1, Math.round(Math.max(w, h) / 400))}px)`
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)))
  ctx.closePath()
  ctx.fill()
  const rgba = ctx.getImageData(0, 0, w, h).data
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3]
  return out
}

/**
 * Where to point SAM when the user only drew a loop: confident RMBG foreground well inside the
 * loop, spread out (farthest-point picking), at most `n` points.
 */
function autoPoints(rmbg: Uint8ClampedArray, inside: Uint8ClampedArray, w: number, h: number, n = 4) {
  const core = morph(inside, w, h, Math.round(Math.max(w, h) * 0.02), 'erode')
  const candidates: [number, number][] = []
  const step = Math.max(4, Math.round(Math.max(w, h) / 64))
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x
      if (rmbg[i] > 200 && core[i] > 200) candidates.push([x, y])
    }
  }
  if (!candidates.length) return []
  // Start near the middle of the candidates, then keep adding the farthest one.
  const mx = candidates.reduce((s, c) => s + c[0], 0) / candidates.length
  const my = candidates.reduce((s, c) => s + c[1], 0) / candidates.length
  const picked = [candidates.reduce((best, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best))]
  while (picked.length < n && picked.length < candidates.length) {
    let far = candidates[0]
    let farD = -1
    for (const c of candidates) {
      const d = Math.min(...picked.map((p) => Math.hypot(c[0] - p[0], c[1] - p[1])))
      if (d > farD) {
        farD = d
        far = c
      }
    }
    picked.push(far)
  }
  return picked.map(([x, y]) => ({ x: x / w, y: y / h, label: 1 as const }))
}

/**
 * SAM's mask for some points, at the small working size (0/255). SAM proposes three (part,
 * object, whole). With a `reference` mask we take the one that overlaps it best. Otherwise SAM's
 * own pick, unless that is a speck (a tap on a pet means the pet, not its ear): then the next
 * bigger confident one. (Always taking the biggest can grab two cats lying together.)
 */
async function samMask(sam: SamState, points: Tap[], w: number, h: number, reference: Uint8ClampedArray | null = null) {
  const { model, processor } = await loadSam()
  const [rh, rw] = sam.reshaped
  const outputs = await model({
    ...sam.embeddings,
    input_points: new Tensor('float32', points.flatMap((p) => [p.x * rw, p.y * rh]), [1, 1, points.length, 2]),
    input_labels: new Tensor('int64', BigInt64Array.from(points.map((p) => BigInt(p.label))), [1, 1, points.length]),
  })
  const [masks] = await (processor as unknown as {
    post_process_masks: (m: Tensor, o: number[][], r: number[][]) => Promise<Tensor[]>
  }).post_process_masks(outputs.pred_masks, [[h, w]], [sam.reshaped])
  const scores = outputs.iou_scores.data as Float32Array
  const plane = w * h
  const all = masks.data as Uint8Array
  const top = Math.max(...scores)
  let best = scores.indexOf(top)
  if (!reference) {
    const areas = Array.from(scores, (_, m) => {
      let area = 0
      for (let i = 0; i < plane; i++) if (all[m * plane + i]) area++
      return area
    })
    const speck = plane * 0.02
    if (areas[best] < speck) {
      const bigger = areas
        .map((area, m) => ({ area, m }))
        .filter(({ area, m }) => area >= speck && scores[m] >= top - 0.15)
        .sort((a, b) => a.area - b.area)[0]
      if (bigger) best = bigger.m
    }
  } else {
    let bestIou = -1
    for (let m = 0; m < scores.length; m++) {
      let inter = 0
      let union = 0
      for (let i = 0; i < plane; i++) {
        const a = all[m * plane + i] !== 0
        const b = reference[i] > 127
        if (a && b) inter++
        if (a || b) union++
      }
      const iou = union ? inter / union : 0
      if (iou > bestIou) {
        bestIou = iou
        best = m
      }
    }
  }
  const bits = all.subarray(best * plane, (best + 1) * plane)
  const out = new Uint8ClampedArray(plane)
  for (let i = 0; i < plane; i++) out[i] = bits[i] ? 255 : 0
  return { mask: out, score: scores[best] }
}

/**
 * The blend, at the small working size. Two masks come out:
 *   keep  – where RMBG's soft edges may show   solid – definitely kept, even if RMBG missed it
 * and the result is alpha = max(RMBG · keep, solid).
 *
 * 1. Base: RMBG everywhere. With a loop, SAM (steered by points on RMBG's foreground inside the
 *    loop) decides which object it is; its core may only fill holes near RMBG's foreground, so a
 *    blanket can't sneak in.
 * 2. "+ Keep" taps: SAM segments the tapped object and it is added.
 * 3. "− Remove" taps: SAM segments the tapped object and it is cut out.
 * 4. The loop is a hard boundary for everything.
 */
async function lassoMasks(src: string, prompt: CutoutPrompt) {
  const { full, small } = await images(src)
  const w = small.width
  const h = small.height
  const n = w * h
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.012))
  const rmbgRaw = await rmbgMask(src, full)
  const rmbg = await resizeMask(rmbgRaw, w, h)
  const inside = prompt.lasso && prompt.lasso.length >= 3 ? polygonMask(prompt.lasso, w, h) : null
  const sam = await samEmbeddings(src, small)

  const keep = new Uint8ClampedArray(n).fill(255)
  const solid = new Uint8ClampedArray(n)
  const scores: number[] = []

  // 1. Base object inside the loop.
  const auto = inside ? autoPoints(rmbg, inside, w, h) : []
  if (auto.length) {
    const reference = rmbg.map((v, i) => (v * inside![i]) / 255)
    const base = await samMask(sam, auto, w, h, reference)
    scores.push(base.score)
    const near = morph(rmbg.map((v) => (v > 127 ? 255 : 0)), w, h, r * 2, 'dilate')
    const grown = morph(base.mask, w, h, r, 'dilate')
    const core = morph(base.mask, w, h, r, 'erode')
    for (let i = 0; i < n; i++) {
      keep[i] = grown[i]
      solid[i] = Math.min(core[i], near[i])
    }
  }

  // 2 + 3. Each tap points at one object.
  for (const tap of prompt.taps) {
    const { mask, score } = await samMask(sam, [{ ...tap, label: 1 }], w, h)
    scores.push(score)
    if (tap.label === 1) {
      const grown = morph(mask, w, h, r, 'dilate')
      const core = morph(mask, w, h, r, 'erode')
      for (let i = 0; i < n; i++) {
        keep[i] = Math.max(keep[i], grown[i])
        solid[i] = Math.max(solid[i], core[i])
      }
    } else {
      const grown = morph(mask, w, h, r, 'dilate')
      for (let i = 0; i < n; i++) {
        keep[i] = Math.min(keep[i], 255 - grown[i])
        solid[i] = Math.min(solid[i], 255 - grown[i])
      }
    }
  }

  // 4. Nothing outside the loop.
  if (inside) {
    for (let i = 0; i < n; i++) {
      keep[i] = (keep[i] * inside[i]) / 255
      solid[i] = (solid[i] * inside[i]) / 255
    }
  }
  const samScore = scores.length ? +Math.min(...scores).toFixed(3) : 'none'
  return { full, w, h, rmbgRaw, rmbg, keep, solid, samScore, autoPoints: auto.length }
}

function blend(rmbg: Uint8ClampedArray, keep: Uint8ClampedArray, solid: Uint8ClampedArray) {
  const out = new Uint8ClampedArray(rmbg.length)
  for (let i = 0; i < out.length; i++) out[i] = Math.max((rmbg[i] * keep[i]) / 255, solid[i])
  return out
}

// ---------------------------------------------------------------------------------------------

// Jobs run one at a time (model sessions aren't re-entrant). While the user keeps drawing,
// only the newest preview is worth computing.
let queue = Promise.resolve()
let latestPreview = ''
self.onmessage = ({ data }: MessageEvent<CutoutRequest>) => {
  if (data.type === 'preview') latestPreview = data.id
  queue = queue.then(() => (data.type === 'preview' && data.id !== latestPreview ? undefined : handle(data)))
}

async function handle(data: CutoutRequest) {
  const { id, src } = data
  currentRequest = id
  const started = performance.now()
  try {
    if (data.type === 'auto') {
      const { full } = await images(src)
      const rmbgRaw = await rmbgMask(src, full)
      const alpha = await resizeMask(rmbgRaw, full.width, full.height)
      const { dtype } = await loadRmbg()
      post(
        { id, type: 'mask', alpha, width: full.width, height: full.height, info: { mode: 'auto', model: RMBG_ID, device: device!, dtype, ms: Math.round(performance.now() - started) } },
        [alpha.buffer],
      )
      return
    }

    const m = await lassoMasks(src, data.prompt)
    const info = {
      mode: data.type,
      device: device!,
      samScore: m.samScore,
      taps: data.prompt.taps.length,
      autoPoints: m.autoPoints,
    }
    if (data.type === 'preview') {
      const alpha = blend(m.rmbg, m.keep, m.solid)
      post({ id, type: 'mask', alpha, width: m.w, height: m.h, info: { ...info, ms: Math.round(performance.now() - started) } }, [alpha.buffer])
      return
    }

    // Final: RMBG at full resolution for the edges, the small keep/solid masks upscaled.
    const W = m.full.width
    const H = m.full.height
    const rmbg = await resizeMask(m.rmbgRaw, W, H)
    const keep = await resizeMask({ data: m.keep, width: m.w, height: m.h }, W, H)
    const solid = await resizeMask({ data: m.solid, width: m.w, height: m.h }, W, H)
    const alpha = blend(rmbg, keep, solid)
    post({ id, type: 'mask', alpha, width: W, height: H, info: { ...info, ms: Math.round(performance.now() - started) } }, [alpha.buffer])
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) })
  }
}

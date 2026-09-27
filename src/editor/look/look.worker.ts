/// <reference lib="webworker" />
// Renders a photo's look (adjustments + effect) off the main thread. Works on RGBA and keeps
// alpha, so background-removed cutouts stay transparent.

import { withDefaults, type PhotoLook } from './look'

export type LookRequest = { id: string; bitmap: ImageBitmap; look: Partial<PhotoLook> }
export type LookResponse = { id: string; bitmap?: ImageBitmap; error?: string }

self.onmessage = ({ data }: MessageEvent<LookRequest>) => {
  try {
    const bitmap = render(data.bitmap, withDefaults(data.look))
    data.bitmap.close()
    self.postMessage({ id: data.id, bitmap } satisfies LookResponse, [bitmap])
  } catch (err) {
    self.postMessage({ id: data.id, error: err instanceof Error ? err.message : String(err) } satisfies LookResponse)
  }
}

type Ctx = OffscreenCanvasRenderingContext2D

function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(w, h)
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! as Ctx }
}

/** Canvas `filter` isn't everywhere (older Safari); feature-detect once. */
const hasCanvasFilter = (() => {
  const { ctx } = canvas(1, 1)
  ctx.filter = 'blur(1px)'
  return ctx.filter === 'blur(1px)'
})()

function render(src: ImageBitmap, look: PhotoLook): ImageBitmap {
  const W = src.width
  const H = src.height
  /** 1 "look unit" = 1/1000 of the long side: sizes scale with the image. */
  const unit = Math.max(W, H) / 1000
  const s = look.strength / 100

  // 1. Tone + blur in one hardware-accelerated pass where possible.
  const tone = {
    brightness: 1 + look.brightness / 100,
    contrast: 1 + look.contrast / 100,
    saturate: 1 + look.saturation / 100,
    grayscale: 0,
    sepia: 0,
  }
  if (look.effect === 'bw') tone.grayscale = s
  if (look.effect === 'vintage') {
    tone.sepia = 0.7 * s
    tone.contrast *= 1 - 0.12 * s
    tone.brightness *= 1 + 0.06 * s
  }
  if (look.effect === 'pop') {
    tone.saturate *= 1 + 0.9 * s
    tone.contrast *= 1 + 0.25 * s
  }
  const blurPx = (look.blur / 100) * 12 * unit

  const { c, ctx } = canvas(W, H)
  if (hasCanvasFilter) {
    ctx.filter = [
      `brightness(${tone.brightness})`,
      `contrast(${tone.contrast})`,
      `saturate(${tone.saturate})`,
      tone.grayscale ? `grayscale(${tone.grayscale})` : '',
      tone.sepia ? `sepia(${tone.sepia})` : '',
      blurPx > 0.3 ? `blur(${blurPx}px)` : '',
    ].join(' ')
    ctx.drawImage(src, 0, 0)
    ctx.filter = 'none'
  } else {
    ctx.drawImage(src, 0, 0)
    toneManually(ctx, W, H, tone)
    if (blurPx > 0.3) boxBlurFallback(ctx, W, H, blurPx)
  }

  // 2. Pixel passes.
  if (look.warmth) warm(ctx, W, H, look.warmth / 100)
  if (look.sharpen) sharpen(ctx, W, H, look.sharpen / 100, unit)
  if (look.effect === 'posterize') posterize(ctx, W, H, Math.round(8 - 6 * s))
  if (look.effect === 'pixel') pixelate(ctx, W, H, Math.max(2, Math.round((4 + 36 * s) * unit)))
  if (look.effect === 'emboss') emboss(ctx, W, H, s)
  if (look.effect === 'cartoon') cartoon(ctx, W, H, s, unit)

  return c.transferToImageBitmap()
}

// ---------------------------------------------------------------------------------------------

function toneManually(ctx: Ctx, W: number, H: number, t: { brightness: number; contrast: number; saturate: number; grayscale: number; sepia: number }) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * t.brightness
    let g = d[i + 1] * t.brightness
    let b = d[i + 2] * t.brightness
    r = (r - 128) * t.contrast + 128
    g = (g - 128) * t.contrast + 128
    b = (b - 128) * t.contrast + 128
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const sat = t.saturate * (1 - t.grayscale)
    r = l + (r - l) * sat
    g = l + (g - l) * sat
    b = l + (b - l) * sat
    if (t.sepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b
      const sg = 0.349 * r + 0.686 * g + 0.168 * b
      const sb = 0.272 * r + 0.534 * g + 0.131 * b
      r += (sr - r) * t.sepia
      g += (sg - g) * t.sepia
      b += (sb - b) * t.sepia
    }
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  ctx.putImageData(img, 0, 0)
}

/** Fallback blur: shrink then stretch back with smoothing. */
function boxBlurFallback(ctx: Ctx, W: number, H: number, px: number) {
  const f = Math.max(1, px)
  const { c: small, ctx: sctx } = canvas(Math.max(1, Math.round(W / f)), Math.max(1, Math.round(H / f)))
  sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height)
  ctx.clearRect(0, 0, W, H)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, W, H)
}

/** Warm = more red/yellow, less blue; cool the other way. */
function warm(ctx: Ctx, W: number, H: number, amount: number) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const k = 28 * amount
  for (let i = 0; i < d.length; i += 4) {
    d[i] += k
    d[i + 1] += k * 0.35
    d[i + 2] -= k
  }
  ctx.putImageData(img, 0, 0)
}

/** Unsharp mask: original + amount × (original − blurred). */
function sharpen(ctx: Ctx, W: number, H: number, amount: number, unit: number) {
  const { ctx: bctx } = canvas(W, H)
  if (hasCanvasFilter) {
    bctx.filter = `blur(${Math.max(1, 1.2 * unit)}px)`
    bctx.drawImage(ctx.canvas, 0, 0)
  } else {
    bctx.drawImage(ctx.canvas, 0, 0)
    boxBlurFallback(bctx, W, H, Math.max(1.5, 1.2 * unit))
  }
  const img = ctx.getImageData(0, 0, W, H)
  const blurred = bctx.getImageData(0, 0, W, H).data
  const d = img.data
  const k = 1.6 * amount
  for (let i = 0; i < d.length; i += 4) {
    d[i] += (d[i] - blurred[i]) * k
    d[i + 1] += (d[i + 1] - blurred[i + 1]) * k
    d[i + 2] += (d[i + 2] - blurred[i + 2]) * k
  }
  ctx.putImageData(img, 0, 0)
}

function posterize(ctx: Ctx, W: number, H: number, levels: number) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const step = 255 / (levels - 1)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step
    d[i + 1] = Math.round(d[i + 1] / step) * step
    d[i + 2] = Math.round(d[i + 2] / step) * step
  }
  ctx.putImageData(img, 0, 0)
}

/** Big square pixels: shrink without smoothing, stretch back without smoothing. */
function pixelate(ctx: Ctx, W: number, H: number, block: number) {
  const { c: small, ctx: sctx } = canvas(Math.max(1, Math.round(W / block)), Math.max(1, Math.round(H / block)))
  sctx.imageSmoothingEnabled = true
  sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height)
  // Snap alpha so cutout edges become crisp pixel edges too.
  const si = sctx.getImageData(0, 0, small.width, small.height)
  for (let i = 3; i < si.data.length; i += 4) si.data[i] = si.data[i] > 110 ? 255 : 0
  sctx.putImageData(si, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, W, H)
  ctx.imageSmoothingEnabled = true
}

function luminance(d: Uint8ClampedArray, W: number, H: number) {
  const out = new Float32Array(W * H)
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return out
}

/** Raised-relief look: 3×3 emboss kernel on brightness, blended with the colors. */
function emboss(ctx: Ctx, W: number, H: number, s: number) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const l = luminance(d, W, H)
  const k = [-2, -1, 0, -1, 1, 1, 0, 1, 2]
  const mix = 0.35 + 0.65 * s
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(H - 1, Math.max(0, y + j))
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(W - 1, Math.max(0, x + i))
          v += l[yy * W + xx] * k[(j + 1) * 3 + (i + 1)]
        }
      }
      const g = Math.min(255, Math.max(0, v * 0.5 + 128 * 0.5 + l[y * W + x] * 0.25))
      const o = (y * W + x) * 4
      d[o] += (g - d[o]) * mix
      d[o + 1] += (g - d[o + 1]) * mix
      d[o + 2] += (g - d[o + 2]) * mix
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Cartoon: smooth, flatten colors to a small k-means palette, then draw ink outlines from
 * the edges of the smoothed image. Strength = fewer colors and bolder lines.
 */
function cartoon(ctx: Ctx, W: number, H: number, s: number, unit: number) {
  // Smooth + livelier color first, so flat regions come out clean and not muddy.
  const { ctx: sm } = canvas(W, H)
  if (hasCanvasFilter) {
    sm.filter = `blur(${Math.max(1.5, 3 * unit)}px) saturate(1.45) contrast(1.08) brightness(1.04)`
    sm.drawImage(ctx.canvas, 0, 0)
  } else {
    sm.drawImage(ctx.canvas, 0, 0)
    boxBlurFallback(sm, W, H, Math.max(2, 3 * unit))
  }
  const smooth = sm.getImageData(0, 0, W, H).data
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data

  // Palette from a sample of opaque pixels (k-means, a few rounds).
  const colors = Math.round(18 - 10 * s)
  const samples: number[][] = []
  const stride = Math.max(1, Math.floor((W * H) / 6000))
  for (let p = 0; p < W * H; p += stride) {
    const i = p * 4
    if (smooth[i + 3] > 128) samples.push([smooth[i], smooth[i + 1], smooth[i + 2]])
  }
  const palette = kmeans(samples, colors)

  // Edges on an extra-smoothed brightness (Sobel), thresholded into ink lines: only strong
  // edges (outline, eyes, nose), not fur texture.
  const { ctx: soft } = canvas(W, H)
  if (hasCanvasFilter) {
    soft.filter = `blur(${Math.max(1.5, 3.5 * unit)}px)`
    soft.drawImage(ctx.canvas, 0, 0)
  } else {
    soft.drawImage(ctx.canvas, 0, 0)
    boxBlurFallback(soft, W, H, Math.max(2, 3.5 * unit))
  }
  const l = luminance(soft.getImageData(0, 0, W, H).data, W, H)
  const edge = new Uint8Array(W * H)
  const threshold = 150 - 70 * s
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x
      const gx = -l[p - W - 1] - 2 * l[p - 1] - l[p + W - 1] + l[p - W + 1] + 2 * l[p + 1] + l[p + W + 1]
      const gy = -l[p - W - 1] - 2 * l[p - W] - l[p - W + 1] + l[p + W - 1] + 2 * l[p + W] + l[p + W + 1]
      if (Math.hypot(gx, gy) > threshold) edge[p] = 1
    }
  }
  const thick = Math.round((0.5 + 1.2 * s) * unit)
  const lines = thick > 0 ? dilate(edge, W, H, thick) : edge

  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (d[i + 3] === 0) continue
    if (lines[p]) {
      d[i] = 43
      d[i + 1] = 35
      d[i + 2] = 32
      continue
    }
    let best = palette[0]
    let bestD = Infinity
    for (const c of palette) {
      const dr = smooth[i] - c[0]
      const dg = smooth[i + 1] - c[1]
      const db = smooth[i + 2] - c[2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestD) {
        bestD = dist
        best = c
      }
    }
    d[i] = best[0]
    d[i + 1] = best[1]
    d[i + 2] = best[2]
  }
  ctx.putImageData(img, 0, 0)
}

function kmeans(points: number[][], k: number): number[][] {
  if (points.length <= k) return points.length ? points : [[128, 128, 128]]
  // Spread initial centers by brightness.
  const sorted = [...points].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  let centers = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]])
  for (let round = 0; round < 6; round++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const p of points) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dr = p[0] - centers[c][0]
        const dg = p[1] - centers[c][1]
        const db = p[2] - centers[c][2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestD) {
          bestD = dist
          best = c
        }
      }
      const s = sums[best]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    }
    centers = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[c]))
  }
  return centers.map((c) => c.map(Math.round))
}

function dilate(mask: Uint8Array, W: number, H: number, r: number) {
  const tmp = new Uint8Array(mask.length)
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && !v; k++) v = mask[y * W + k]
      tmp[y * W + x] = v
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && !v; k++) v = tmp[k * W + x]
      out[y * W + x] = v
    }
  }
  return out
}

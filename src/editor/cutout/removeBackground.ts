import { create } from 'zustand'
import { log } from '../../debug/log'
import { useDesignStore, type PhotoLayer } from '../../store/designStore'
import { loadImage } from '../useHtmlImage'
import type { CutoutPrompt, CutoutRequest, CutoutResponse } from './protocol'

type Job = { phase: 'download' | 'running'; percent: number }
type MaskResult = Extract<CutoutResponse, { type: 'mask' }>

/** Cutout jobs in flight, by layer id (drives the buttons' progress labels). */
export const useCutoutJobs = create<{ jobs: Record<string, Job> }>()(() => ({ jobs: {} }))

const setJob = (layerId: string, job: Job | null) =>
  useCutoutJobs.setState((s) => {
    const { [layerId]: _, ...rest } = s.jobs
    return { jobs: job ? { ...rest, [layerId]: job } : rest }
  })

let worker: Worker | null = null
/** After a GPU failure the worker is restarted CPU-only for the rest of the session. */
let cpuOnly = false
const waiting = new Map<string, { msg: CutoutRequest; onMessage: (res: CutoutResponse) => void }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./bgRemoval.worker.ts', import.meta.url), {
      type: 'module',
      // Dev: open the app with ?gpufail to simulate a GPU failure and test the CPU restart.
      name: cpuOnly ? 'cpu' : import.meta.env.DEV && location.search.includes('gpufail') ? 'gpufail' : 'auto',
    })
    worker.onmessage = ({ data }: MessageEvent<CutoutResponse>) => {
      if (data.type === 'error' && data.gpu && !cpuOnly) return restartOnCpu(data.message)
      waiting.get(data.id)?.onMessage(data)
    }
  }
  return worker
}

/** The GPU failed (unsupported, out of memory…): start over on the CPU and resend open jobs. */
function restartOnCpu(reason: string) {
  log.warn('cutout', `GPU failed, switching to CPU: ${reason.split('\n')[0]}`)
  cpuOnly = true
  worker?.terminate()
  worker = null
  for (const { msg } of waiting.values()) getWorker().postMessage(msg)
}

/** Send one job to the worker; progress goes to `onProgress`. */
function request(msg: CutoutRequest, onProgress: (job: Job) => void): Promise<MaskResult> {
  return new Promise<MaskResult>((resolve, reject) => {
    waiting.set(msg.id, {
      msg,
      onMessage: (res) => {
        if (res.type === 'progress') return onProgress({ phase: res.phase, percent: res.percent })
        waiting.delete(msg.id)
        if (res.type === 'mask') resolve(res)
        else reject(new Error(res.message))
      },
    })
    getWorker().postMessage(msg)
  })
}

/** The unedited photo behind a layer (cutouts keep it in `originalSrc`). */
const baseSrc = (layer: PhotoLayer) => layer.originalSrc ?? layer.src

/**
 * Put a finished alpha mask on the layer as a new transparent PNG, keeping the original so it
 * can be restored (and undo works). Skipped if the layer changed while we were working.
 */
async function applyResult(layer: PhotoLayer, result: MaskResult) {
  const base = baseSrc(layer)
  const cutoutSrc = await applyAlpha(base, result.alpha, result.width, result.height)
  const { design, updateLayer } = useDesignStore.getState()
  const current = design.layers.find((l) => l.id === layer.id)
  if (current?.kind === 'photo' && baseSrc(current) === base) {
    updateLayer(layer.id, { src: cutoutSrc, originalSrc: base })
    return true
  }
  log.warn('cutout', 'layer changed while processing; result dropped')
  URL.revokeObjectURL(cutoutSrc)
  return false
}

async function runJob(layer: PhotoLayer, msg: CutoutRequest) {
  if (useCutoutJobs.getState().jobs[layer.id]) return false
  setJob(layer.id, { phase: 'download', percent: 0 })
  log.info('cutout', `${msg.type} ${layer.id.slice(0, 8)} ${layer.naturalWidth}x${layer.naturalHeight}`)
  try {
    const result = await request(msg, (job) => setJob(layer.id, job))
    log.info('cutout', `${msg.type} done in ${result.info.ms} ms`, result.info)
    return await applyResult(layer, result)
  } catch (err) {
    log.error('cutout', `${msg.type} failed`, err)
    alert("Sorry, the background couldn't be removed from this photo.")
    return false
  } finally {
    setJob(layer.id, null)
  }
}

/** One click: cut the pet out automatically. */
export function removeBackground(layer: PhotoLayer) {
  return runJob(layer, { id: crypto.randomUUID(), type: 'auto', src: baseSrc(layer) })
}

/** Put the original photo back (the cutout stays in undo history). */
export function restoreBackground(layer: PhotoLayer) {
  if (!layer.originalSrc) return
  useDesignStore.getState().updateLayer(layer.id, { src: layer.originalSrc, originalSrc: undefined })
}

// ---------------------------------------------------------------------------------------------
// Lasso / taps

type LassoPreview = {
  /** Veil over what would be removed, covering the whole source photo (small size). */
  canvas: HTMLCanvasElement | null
  busy: Job | null
}

export const useLassoPreview = create<LassoPreview>()(() => ({ canvas: null, busy: null }))

let latestPreview = ''

/** Ask for a fresh preview of the lasso result; older in-flight previews are ignored. */
export async function requestLassoPreview(layer: PhotoLayer, prompt: CutoutPrompt) {
  const id = crypto.randomUUID()
  latestPreview = id
  useLassoPreview.setState((s) => ({ busy: s.busy ?? { phase: 'running', percent: 0 } }))
  try {
    const result = await request({ id, type: 'preview', src: baseSrc(layer), prompt }, (job) => {
      if (id === latestPreview) useLassoPreview.setState({ busy: job })
    })
    if (id !== latestPreview) return
    log.debug('lasso', `preview ${result.info.ms} ms`, result.info)
    useLassoPreview.setState({ canvas: tint(result.alpha, result.width, result.height), busy: null })
  } catch (err) {
    if (id !== latestPreview) return
    log.error('lasso', 'preview failed', err)
    useLassoPreview.setState({ busy: null })
  }
}

export function resetLassoPreview() {
  latestPreview = ''
  useLassoPreview.setState({ canvas: null, busy: null })
}

/** Final lasso cutout at full resolution. */
export async function applyLasso(layer: PhotoLayer, prompt: CutoutPrompt) {
  const ok = await runJob(layer, { id: crypto.randomUUID(), type: 'refine', src: baseSrc(layer), prompt })
  if (ok) {
    useDesignStore.getState().endLasso()
    resetLassoPreview()
  }
}

/** Dark veil over what will be removed, so the kept pet stands out on any photo. */
function tint(alpha: Uint8ClampedArray, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < alpha.length; i++) {
    img.data[i * 4] = 28
    img.data[i * 4 + 1] = 20
    img.data[i * 4 + 2] = 24
    img.data[i * 4 + 3] = (255 - alpha[i]) * 0.72
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** The photo at full resolution with the mask as its alpha channel, as a PNG blob URL. */
async function applyAlpha(src: string, alpha: Uint8ClampedArray, width: number, height: number) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height)
  for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i]
  ctx.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
  )
  return URL.createObjectURL(blob)
}

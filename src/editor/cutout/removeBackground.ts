import { create } from 'zustand'
import { log } from '../../debug/log'
import { useDesignStore, type PhotoLayer } from '../../store/designStore'
import { loadImage } from '../useHtmlImage'
import type { CutoutRequest, CutoutResponse } from './protocol'

type Job = { phase: 'download' | 'running'; percent: number }

/** Background-removal jobs in flight, by layer id (drives the button's progress label). */
export const useCutoutJobs = create<{ jobs: Record<string, Job> }>()(() => ({ jobs: {} }))

const setJob = (layerId: string, job: Job | null) =>
  useCutoutJobs.setState((s) => {
    const { [layerId]: _, ...rest } = s.jobs
    return { jobs: job ? { ...rest, [layerId]: job } : rest }
  })

let worker: Worker | null = null
const waiting = new Map<string, (msg: CutoutResponse) => void>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./bgRemoval.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<CutoutResponse>) => waiting.get(data.id)?.(data)
  }
  return worker
}

/**
 * Cut the pet out of a photo layer (one click). The result replaces the layer's image as a
 * transparent PNG; the original is kept on the layer so it can be restored, and undo works.
 */
export async function removeBackground(layer: PhotoLayer) {
  if (useCutoutJobs.getState().jobs[layer.id]) return
  const requestId = crypto.randomUUID()
  setJob(layer.id, { phase: 'download', percent: 0 })
  log.info('cutout', `start ${layer.id.slice(0, 8)} ${layer.naturalWidth}x${layer.naturalHeight}`)

  try {
    const result = await new Promise<Extract<CutoutResponse, { type: 'done' }>>((resolve, reject) => {
      waiting.set(requestId, (msg) => {
        if (msg.type === 'progress') setJob(layer.id, { phase: msg.phase, percent: msg.percent })
        else if (msg.type === 'done') resolve(msg)
        else reject(new Error(msg.message))
      })
      getWorker().postMessage({ id: requestId, src: layer.src } satisfies CutoutRequest)
    })
    log.info('cutout', `done in ${result.info.ms} ms`, result.info)

    const cutoutSrc = await applyAlpha(layer.src, result.alpha, result.width, result.height)

    // Only apply if the layer still shows the photo we started from.
    const { design, updateLayer } = useDesignStore.getState()
    const current = design.layers.find((l) => l.id === layer.id)
    if (current?.kind === 'photo' && current.src === layer.src) {
      updateLayer(layer.id, { src: cutoutSrc, originalSrc: layer.src })
    } else {
      log.warn('cutout', 'layer changed while processing; result dropped')
      URL.revokeObjectURL(cutoutSrc)
    }
  } catch (err) {
    log.error('cutout', 'failed', err)
    alert("Sorry, the background couldn't be removed from this photo.")
  } finally {
    waiting.delete(requestId)
    setJob(layer.id, null)
  }
}

/** Put the original photo back (the cutout stays in undo history). */
export function restoreBackground(layer: PhotoLayer) {
  if (!layer.originalSrc) return
  useDesignStore.getState().updateLayer(layer.id, { src: layer.originalSrc, originalSrc: undefined })
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

import { log } from '../../debug/log'
import { loadImage } from '../useHtmlImage'
import { lookKey, type PhotoLook } from './look'
import type { LookRequest, LookResponse } from './look.worker'

/** Long-side sizes: full renders stay print-sharp; previews keep sliders responsive. */
export const FULL_SIDE = 3000
export const PREVIEW_SIDE = 900

let worker: Worker | null = null
const waiting = new Map<string, (res: LookResponse) => void>()
const cache = new Map<string, ImageBitmap>()
const inflight = new Map<string, Promise<ImageBitmap>>()
const CACHE_LIMIT = 40

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./look.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<LookResponse>) => {
      waiting.get(data.id)?.(data)
      waiting.delete(data.id)
    }
  }
  return worker
}

export function renderKey(src: string, look: Partial<PhotoLook>, maxSide: number) {
  return `${src}|${maxSide}|${lookKey(look)}`
}

/** The photo at `src` with `look` applied, at most `maxSide` px on its long side (cached). */
export function renderLook(src: string, look: Partial<PhotoLook>, maxSide: number): Promise<ImageBitmap> {
  const key = renderKey(src, look, maxSide)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit) // most recently used
    return Promise.resolve(hit)
  }
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const started = performance.now()
      const img = await loadImage(src)
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const bitmap = await createImageBitmap(img, {
        resizeWidth: Math.max(1, Math.round(img.naturalWidth * scale)),
        resizeHeight: Math.max(1, Math.round(img.naturalHeight * scale)),
        resizeQuality: 'high',
      })
      const id = crypto.randomUUID()
      const res = await new Promise<LookResponse>((resolve) => {
        waiting.set(id, resolve)
        getWorker().postMessage({ id, bitmap, look } satisfies LookRequest, [bitmap])
      })
      if (!res.bitmap) throw new Error(res.error ?? 'look render failed')
      cache.set(key, res.bitmap)
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
      log.debug('look', `${lookKey(look)} @${maxSide} in ${Math.round(performance.now() - started)} ms`)
      return res.bitmap
    })()
    p.finally(() => inflight.delete(key)).catch(() => {})
    inflight.set(key, p)
  }
  return p
}

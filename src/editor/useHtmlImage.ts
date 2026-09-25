import { useEffect, useState } from 'react'

/** Decoded images by URL, shared by every editor instance for the session. */
const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(src)
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        cache.set(src, img)
        pending.delete(src)
        resolve(img)
      }
      img.onerror = () => {
        pending.delete(src)
        reject(new Error(`could not load ${src}`))
      }
      img.src = src
    })
    pending.set(src, p)
  }
  return p
}

/**
 * Loads a set of image URLs. Returns the ones decoded so far, and whether all of them are in.
 */
export function useImages(srcs: string[]) {
  const [, rerender] = useState(0)
  const key = srcs.join('\n')

  useEffect(() => {
    let alive = true
    for (const src of key ? key.split('\n') : []) {
      if (!cache.has(src)) loadImage(src).then(() => alive && rerender((n) => n + 1), () => {})
    }
    return () => {
      alive = false
    }
  }, [key])

  const images = new Map(srcs.flatMap((s) => (cache.has(s) ? [[s, cache.get(s)!] as const] : [])))
  return { images, complete: images.size === new Set(srcs).size }
}

export async function loadImageSize(src: string) {
  const img = await loadImage(src)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

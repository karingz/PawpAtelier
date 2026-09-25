import { useEffect, useState } from 'react'

/** Loads an image URL into an HTMLImageElement; undefined until it has loaded. */
export function useHtmlImage(src: string | undefined) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement }>()

  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => setLoaded({ src, image: img })
    img.src = src
    return () => {
      img.onload = null
    }
  }, [src])

  return loaded && loaded.src === src ? loaded.image : undefined
}

export function loadImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

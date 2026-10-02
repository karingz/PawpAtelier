import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { log } from '../debug/log'
import { useDesignStore } from '../store/designStore'

/**
 * A CanvasTexture over the product's (fixed-size) print canvas that re-uploads whenever the
 * editor redraws. Reads the store inside the frame loop, so drags never re-render React.
 */
export function useLiveCanvasTexture(productId: string) {
  const canvas = useDesignStore((s) => s.printCanvases[productId])
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    if (!canvas) return null
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = Math.min(8, maxAnisotropy)
    return tex
  }, [canvas, maxAnisotropy])
  useEffect(() => () => texture?.dispose(), [texture])

  useEffect(() => {
    if (canvas) log.debug('product', `${productId} print texture ${canvas.width}x${canvas.height}`)
  }, [canvas, productId])

  const seenVersion = useRef(-1)
  useFrame(() => {
    if (!texture) return
    const version = useDesignStore.getState().printVersions[productId] ?? 0
    if (version !== seenVersion.current) {
      texture.needsUpdate = true
      seenVersion.current = version
    }
  })

  return texture
}

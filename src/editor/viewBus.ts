/**
 * Which part of the print currently faces the camera, published every frame by the scene for
 * the wrap strip. In design units along the wrap: the front's x, and how far either side is
 * still comfortably visible. `frontX` can be outside 0..width when the gap/seam faces you.
 */
export type ViewFrame = { productId: string; frontX: number; halfX: number }

type Listener = (frame: ViewFrame | null) => void
const listeners = new Set<Listener>()
let current: ViewFrame | null = null

export const viewBus = {
  set(frame: ViewFrame | null) {
    if (frame === null && current === null) return
    current = frame
    for (const l of listeners) l(frame)
  },
  get: () => current,
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
}

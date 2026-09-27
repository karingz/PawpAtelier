/**
 * Per-frame screen position of the selected layer on the 3D product, published by the scene
 * and read by the DOM overlay (outline + floating toolbar). A tiny pub/sub instead of React
 * state, so following the mug every frame doesn't re-render components.
 */
export type SelectionFrame = {
  layerId: string
  /** Outline points in viewer px (follows the curved surface). */
  outline: [number, number][]
  /** Layer center and its 4 box corners (top-left, top-right, bottom-right, bottom-left), px. */
  center: { x: number; y: number }
  corners: [number, number][]
  /** Top-most and bottom-most outline points, for placing the toolbar. */
  top: { x: number; y: number }
  bottom: { x: number; y: number }
  /** False when the layer is on the far side of the product. */
  facing: boolean
}

type Listener = (frame: SelectionFrame | null) => void
const listeners = new Set<Listener>()
let current: SelectionFrame | null = null

export const selectionBus = {
  set(frame: SelectionFrame | null) {
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

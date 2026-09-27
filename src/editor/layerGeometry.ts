import type Konva from 'konva'
import type { Layer } from '../store/designStore'

/** Each product's hidden print stage (registered by PrintCanvas), for measuring text boxes. */
const printStages = new Map<string, Konva.Stage>()

export function registerPrintStage(productId: string, stage: Konva.Stage | null) {
  if (stage) printStages.set(productId, stage)
  else printStages.delete(productId)
}

/** Node name of a layer on the print stage. */
export const printNodeName = (layerId: string) => `layer-${layerId}`

/** A layer's box in design units: center, size, rotation (degrees). */
export type LayerBox = { cx: number; cy: number; w: number; h: number; rotation: number }

export function layerBox(productId: string, layer: Layer): LayerBox {
  if (layer.kind !== 'text') return { cx: layer.x, cy: layer.y, w: layer.width, h: layer.height, rotation: layer.rotation }
  // Text is sized by its font: measure the rendered node.
  const node = printStages.get(productId)?.findOne(`.${printNodeName(layer.id)}`)
  const w = node?.width() ?? layer.fontSize * Math.max(1, layer.text.length) * 0.55
  const h = node?.height() ?? layer.fontSize * 1.1
  return { cx: layer.x, cy: layer.y, w, h, rotation: layer.rotation }
}

/** Is design point (x, y) inside the (rotated) box? */
export function boxContains(b: LayerBox, x: number, y: number, pad = 0) {
  const r = (-b.rotation * Math.PI) / 180
  const dx = x - b.cx
  const dy = y - b.cy
  const lx = dx * Math.cos(r) - dy * Math.sin(r)
  const ly = dx * Math.sin(r) + dy * Math.cos(r)
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad
}

/** Points along the box outline (design units), `perEdge` per side, starting top-left. */
export function boxOutline(b: LayerBox, perEdge = 10): [number, number][] {
  const r = (b.rotation * Math.PI) / 180
  const corners: [number, number][] = [
    [-b.w / 2, -b.h / 2],
    [b.w / 2, -b.h / 2],
    [b.w / 2, b.h / 2],
    [-b.w / 2, b.h / 2],
  ]
  const pts: [number, number][] = []
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c]
    const [bx, by] = corners[(c + 1) % 4]
    for (let i = 0; i < perEdge; i++) {
      const t = i / perEdge
      const lx = ax + (bx - ax) * t
      const ly = ay + (by - ay) * t
      pts.push([b.cx + lx * Math.cos(r) - ly * Math.sin(r), b.cy + lx * Math.sin(r) + ly * Math.cos(r)])
    }
  }
  return pts
}

/** Topmost layer at a design point. */
export function layerAt(productId: string, layers: Layer[], x: number, y: number): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (boxContains(layerBox(productId, layers[i]), x, y)) return layers[i]
  }
  return undefined
}

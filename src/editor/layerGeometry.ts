import type Konva from 'konva'
import type { Layer, LayerPatch } from '../store/designStore'

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

const MIN_SIZE = 20
const MIN_FONT = 8

/**
 * Patch that scales `layer` (as it was when a gesture started) by `factor` and sets its
 * rotation. Text scales by font size; images keep their aspect ratio.
 */
export function transformPatch(layer: Layer, factor: number, rotation: number): LayerPatch {
  if (layer.kind === 'text') return { fontSize: Math.max(MIN_FONT, layer.fontSize * factor), rotation }
  const f = Math.max(factor, MIN_SIZE / Math.min(layer.width, layer.height))
  return { width: layer.width * f, height: layer.height * f, rotation }
}

/** Keep an angle in (-180, 180]. */
export function normalizeDegrees(deg: number) {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180
  return d === -180 ? 180 : d
}

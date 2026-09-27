import { create } from 'zustand'
import { log } from '../debug/log'
import { PRODUCTS } from '../config/products'
import { applyCropBox, visibleBox, type Box } from '../editor/crop'
import type { CutoutPrompt } from '../editor/cutout/protocol'
import type { PhotoMeta } from '../editor/photoMeta'
import type { PhotoLook } from '../editor/look/look'

/** Normalized (0..1) region of the source image that is shown. */
export type Crop = { x: number; y: number; width: number; height: number }

/** Placement in design units: (x, y) is the center, rotation in degrees. */
type Placement = { id: string; x: number; y: number; rotation: number }

export type PhotoLayer = Placement & {
  kind: 'photo'
  src: string
  naturalWidth: number
  naturalHeight: number
  crop: Crop
  width: number
  height: number
  /** Set when `src` is a background-removed cutout: the photo it was made from. */
  originalSrc?: string
  /** When/where it was taken, from the file's EXIF (browser-only, see photoMeta.ts). */
  meta?: PhotoMeta
  /** Adjustments + effect, applied non-destructively (see editor/look). */
  look?: Partial<PhotoLook>
}

export type StickerLayer = Placement & {
  kind: 'sticker'
  stickerId: string
  src: string
  width: number
  height: number
}

/** Text is sized by its font size; its box is measured when drawn. */
export type TextLayer = Placement & {
  kind: 'text'
  text: string
  fontId: string
  fontSize: number
  fill: string
  /** Outline color, or null for none. */
  outline: string | null
}

export type Layer = PhotoLayer | StickerLayer | TextLayer
export type LayerPatch = Partial<PhotoLayer> | Partial<StickerLayer> | Partial<TextLayer>

export type Background =
  /** The product's own color. */
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'pattern'; pattern: string; paletteId: string; scale: number }

/** Everything that ends up on the product. Plain JSON: this is what undo/redo snapshots. */
export type Design = {
  background: Background
  /** Bottom to top. */
  layers: Layer[]
}

const HISTORY_LIMIT = 100

/** Lasso/tap background removal in progress on one photo layer. */
export type LassoState = CutoutPrompt & { layerId: string; mode: 'include' | 'exclude' }

export type View = 'shop' | 'edit'

/** One product's design plus its undo/redo stacks. */
type DesignSlot = { design: Design; past: Design[]; future: Design[] }

type DesignState = {
  view: View
  /** Product being edited (or last edited). The design fields below belong to it. */
  productId: string
  /** Designs of the other products, parked while another one is being edited. */
  parked: Record<string, DesignSlot>

  design: Design
  past: Design[]
  future: Design[]

  selectedId: string | null
  /** Crop box being edited, in the photo's local frame; null when not cropping. */
  cropDraft: Box | null
  /** Lasso cutout being drawn; null when not in lasso mode. */
  lasso: LassoState | null
  /** A layer being dragged on the 3D product: shown live, committed (one undo step) on release. */
  layerDraft: { layerId: string; patch: LayerPatch } | null
  /** A look being dragged on a slider: previewed live, committed (one undo step) on release. */
  lookDraft: { layerId: string; look: Partial<PhotoLook> } | null

  /** Per product: the 2D print canvas the 3D model samples as a texture. */
  printCanvases: Record<string, HTMLCanvasElement>
  /** Per product: bumped on every print redraw; read non-reactively in the render loop. */
  printVersions: Record<string, number>

  openProduct: (productId: string) => void
  backToShop: () => void

  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: LayerPatch) => void
  removeLayer: (id: string) => void
  /** Move a layer up (+1) or down (-1) the stack. */
  moveLayer: (id: string, step: 1 | -1) => void
  setBackground: (background: Background) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void

  startCrop: () => void
  setCropDraft: (box: Box) => void
  applyCrop: () => void
  cancelCrop: () => void

  /** Enter lasso mode on the selected photo. */
  startLasso: () => void
  updateLasso: (patch: Partial<LassoState>) => void
  endLasso: () => void

  setLayerDraft: (layerId: string, patch: LayerPatch) => void
  commitLayerDraft: () => void
  /** Drop an in-progress change without saving it. */
  clearLayerDraft: () => void
  setLookDraft: (layerId: string, look: Partial<PhotoLook>) => void
  /** Save the draft (if any) as the layer's look. */
  commitLookDraft: () => void

  setPrintCanvas: (productId: string, canvas: HTMLCanvasElement) => void
  markPrintDirty: (productId: string) => void
}

const emptySlot = (): DesignSlot => ({ design: { background: { kind: 'none' }, layers: [] }, past: [], future: [] })

export function selectedLayer(s: { design: Design; selectedId: string | null }): Layer | undefined {
  return s.design.layers.find((l) => l.id === s.selectedId)
}

export const useDesignStore = create<DesignState>()((set, get) => {
  /** Record the current design in history and replace it. */
  const commit = (design: Design) =>
    set((s) => ({
      design,
      past: [...s.past, s.design].slice(-HISTORY_LIMIT),
      future: [],
    }))

  const keepSelection = (design: Design, selectedId: string | null) =>
    design.layers.some((l) => l.id === selectedId) ? selectedId : null

  const mapLayers = (fn: (layers: Layer[]) => Layer[]) => {
    const { design } = get()
    const layers = fn(design.layers)
    if (JSON.stringify(layers) !== JSON.stringify(design.layers)) commit({ ...design, layers })
  }

  return {
    view: 'shop',
    productId: PRODUCTS[0].id,
    parked: {},
    ...emptySlot(),
    selectedId: null,
    cropDraft: null,
    lasso: null,
    lookDraft: null,
    layerDraft: null,
    printCanvases: {},
    printVersions: {},

    openProduct: (productId) => {
      const s = get()
      log.info('view', `edit ${productId}`)
      if (productId === s.productId) {
        set({ view: 'edit' })
        return
      }
      const { [productId]: slot = emptySlot(), ...rest } = s.parked
      set({
        view: 'edit',
        productId,
        parked: { ...rest, [s.productId]: { design: s.design, past: s.past, future: s.future } },
        ...slot,
        selectedId: null,
        cropDraft: null,
        lasso: null,
      })
    },
    backToShop: () => {
      log.info('view', 'shop')
      set({ view: 'shop', selectedId: null, cropDraft: null, lasso: null })
    },

    addLayer: (layer) => {
      log.info('design', `add ${layer.kind}`, layer)
      mapLayers((layers) => [...layers, layer])
      set({ selectedId: layer.id, cropDraft: null })
    },
    updateLayer: (id, patch) => {
      log.debug('design', `update ${id.slice(0, 8)}`, patch)
      mapLayers((layers) => layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)))
    },
    removeLayer: (id) => {
      log.info('design', `remove ${id.slice(0, 8)}`)
      mapLayers((layers) => layers.filter((l) => l.id !== id))
      set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId, cropDraft: null, lasso: null }))
    },
    moveLayer: (id, step) =>
      mapLayers((layers) => {
        const i = layers.findIndex((l) => l.id === id)
        const j = i + step
        if (i < 0 || j < 0 || j >= layers.length) return layers
        const next = [...layers]
        ;[next[i], next[j]] = [next[j], next[i]]
        log.debug('design', `move ${id.slice(0, 8)} ${step > 0 ? 'up' : 'down'}`)
        return next
      }),
    setBackground: (background) => {
      const { design } = get()
      if (JSON.stringify(background) === JSON.stringify(design.background)) return
      log.info('design', 'background', background)
      commit({ ...design, background })
    },

    undo: () => {
      const { past, design, future, selectedId, cropDraft, lasso } = get()
      if (!past.length || cropDraft || lasso) return
      const prev = past[past.length - 1]
      log.info('history', `undo (${past.length - 1} left)`)
      set({
        design: prev,
        past: past.slice(0, -1),
        future: [design, ...future],
        selectedId: keepSelection(prev, selectedId),
      })
    },
    redo: () => {
      const { past, design, future, selectedId, cropDraft, lasso } = get()
      if (!future.length || cropDraft || lasso) return
      const next = future[0]
      log.info('history', `redo (${future.length - 1} left)`)
      set({
        design: next,
        past: [...past, design],
        future: future.slice(1),
        selectedId: keepSelection(next, selectedId),
      })
    },
    select: (selectedId) => set({ selectedId }),

    /** Crops the selected layer, which must be a photo. */
    startCrop: () => {
      const photo = selectedLayer(get())
      if (photo?.kind !== 'photo') return
      log.debug('crop', 'start', photo.crop)
      set({ cropDraft: visibleBox(photo) })
    },
    setCropDraft: (cropDraft) => set({ cropDraft }),
    applyCrop: () => {
      const { cropDraft } = get()
      const photo = selectedLayer(get())
      set({ cropDraft: null })
      if (photo?.kind !== 'photo' || !cropDraft) return
      const patch = applyCropBox(photo, cropDraft)
      log.info('crop', 'applied', patch.crop)
      get().updateLayer(photo.id, patch)
    },
    cancelCrop: () => {
      log.debug('crop', 'cancelled')
      set({ cropDraft: null })
    },

    startLasso: () => {
      const photo = selectedLayer(get())
      if (photo?.kind !== 'photo') return
      log.debug('lasso', 'start')
      set({ lasso: { layerId: photo.id, mode: 'include', lasso: null, taps: [] }, cropDraft: null })
    },
    updateLasso: (patch) => set((s) => (s.lasso ? { lasso: { ...s.lasso, ...patch } } : s)),
    endLasso: () => set({ lasso: null }),

    setLayerDraft: (layerId, patch) => set({ layerDraft: { layerId, patch } }),
    commitLayerDraft: () => {
      const { layerDraft } = get()
      if (!layerDraft) return
      set({ layerDraft: null })
      get().updateLayer(layerDraft.layerId, layerDraft.patch)
    },
    clearLayerDraft: () => set({ layerDraft: null }),
    setLookDraft: (layerId, look) => set({ lookDraft: { layerId, look } }),
    commitLookDraft: () => {
      const { lookDraft } = get()
      if (!lookDraft) return
      set({ lookDraft: null })
      get().updateLayer(lookDraft.layerId, { look: lookDraft.look })
    },

    setPrintCanvas: (productId, canvas) =>
      set((s) => ({ printCanvases: { ...s.printCanvases, [productId]: canvas } })),
    markPrintDirty: (productId) =>
      set((s) => ({ printVersions: { ...s.printVersions, [productId]: (s.printVersions[productId] ?? 0) + 1 } })),
  }
})

/** The design's layers with any in-progress drag applied (what should be drawn right now). */
export function layersWithDraft(layers: Layer[], draft: { layerId: string; patch: LayerPatch } | null): Layer[] {
  if (!draft) return layers
  return layers.map((l) => (l.id === draft.layerId ? ({ ...l, ...draft.patch } as Layer) : l))
}

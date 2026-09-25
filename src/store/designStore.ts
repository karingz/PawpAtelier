import { create } from 'zustand'
import { log } from '../debug/log'
import { applyCropBox, visibleBox, type Box } from '../editor/crop'

/** Normalized (0..1) region of the source image that is shown. */
export type Crop = { x: number; y: number; width: number; height: number }

/** A photo placed on the print area. Positions are in design units, (x, y) is the center. */
export type PhotoLayer = {
  id: string
  src: string
  naturalWidth: number
  naturalHeight: number
  crop: Crop
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/** Everything that ends up on the product. Plain JSON: this is what undo/redo snapshots. */
export type Design = {
  photo: PhotoLayer | null
}

const HISTORY_LIMIT = 100

type DesignState = {
  design: Design
  past: Design[]
  future: Design[]

  selectedId: string | null
  /** Crop box being edited, in the photo's local frame; null when not cropping. */
  cropDraft: Box | null

  /** The 2D print canvas the 3D product samples as a texture. */
  printCanvas: HTMLCanvasElement | null
  /** Bumped every time the print canvas redraws; read non-reactively in the render loop. */
  printVersion: number

  setPhoto: (photo: PhotoLayer | null) => void
  updatePhoto: (patch: Partial<PhotoLayer>) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void

  startCrop: () => void
  setCropDraft: (box: Box) => void
  applyCrop: () => void
  cancelCrop: () => void

  setPrintCanvas: (canvas: HTMLCanvasElement | null) => void
  markPrintDirty: () => void
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
    design.photo && design.photo.id === selectedId ? selectedId : null

  return {
    design: { photo: null },
    past: [],
    future: [],
    selectedId: null,
    cropDraft: null,
    printCanvas: null,
    printVersion: 0,

    setPhoto: (photo) => {
      log.info('design', photo ? 'photo placed' : 'photo removed', photo ?? undefined)
      commit({ ...get().design, photo })
      set({ selectedId: photo?.id ?? null, cropDraft: null })
    },
    updatePhoto: (patch) => {
      const { photo } = get().design
      if (!photo) return
      const next = { ...photo, ...patch }
      if (JSON.stringify(next) === JSON.stringify(photo)) return
      log.debug('design', 'photo updated', patch)
      commit({ ...get().design, photo: next })
    },

    undo: () => {
      const { past, design, future, selectedId, cropDraft } = get()
      if (!past.length || cropDraft) return
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
      const { past, design, future, selectedId, cropDraft } = get()
      if (!future.length || cropDraft) return
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

    startCrop: () => {
      const { photo } = get().design
      if (!photo) return
      log.debug('crop', 'start', photo.crop)
      set({ cropDraft: visibleBox(photo), selectedId: photo.id })
    },
    setCropDraft: (cropDraft) => set({ cropDraft }),
    applyCrop: () => {
      const { design, cropDraft } = get()
      set({ cropDraft: null })
      if (!design.photo || !cropDraft) return
      const patch = applyCropBox(design.photo, cropDraft)
      log.info('crop', 'applied', patch.crop)
      get().updatePhoto(patch)
    },
    cancelCrop: () => {
      log.debug('crop', 'cancelled')
      set({ cropDraft: null })
    },

    setPrintCanvas: (printCanvas) => set({ printCanvas }),
    markPrintDirty: () => set((s) => ({ printVersion: s.printVersion + 1 })),
  }
})

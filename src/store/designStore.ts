import { create } from 'zustand'

/** A photo placed on the print area. Positions are in design units, (x, y) is the center. */
export type PhotoLayer = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type DesignState = {
  photo: PhotoLayer | null
  selectedId: string | null

  /** The 2D print canvas the 3D product samples as a texture. */
  printCanvas: HTMLCanvasElement | null
  /** Bumped every time the print canvas redraws; read non-reactively in the render loop. */
  printVersion: number

  setPhoto: (photo: PhotoLayer | null) => void
  updatePhoto: (patch: Partial<PhotoLayer>) => void
  select: (id: string | null) => void
  setPrintCanvas: (canvas: HTMLCanvasElement | null) => void
  markPrintDirty: () => void
}

export const useDesignStore = create<DesignState>()((set) => ({
  photo: null,
  selectedId: null,
  printCanvas: null,
  printVersion: 0,

  setPhoto: (photo) => set({ photo, selectedId: photo?.id ?? null }),
  updatePhoto: (patch) =>
    set((s) => (s.photo ? { photo: { ...s.photo, ...patch } } : s)),
  select: (selectedId) => set({ selectedId }),
  setPrintCanvas: (printCanvas) => set({ printCanvas }),
  markPrintDirty: () => set((s) => ({ printVersion: s.printVersion + 1 })),
}))

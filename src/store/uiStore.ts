import { create } from 'zustand'
import type { ZoneId } from '../config/products'

/** Editor content categories (the dock's buttons / the flat editor's tabs). */
export type Tab = 'photo' | 'effects' | 'stickers' | 'text' | 'background' | 'surprise'

type UiState = {
  /** Shop view level: null = the whole room, else the zone the camera is at. */
  zone: ZoneId | null
  setZone: (zone: ZoneId | null) => void
  /** The product being edited was brought to Leah's desk for the order summary. */
  atCounter: boolean
  goToCounter: () => void
  leaveCounter: () => void
  /** Open drawer over the 3D scene, or null. */
  drawer: Tab | null
  /** The full 2D editor instead of editing on the 3D product. */
  flat: boolean
  /** Text layer being typed into right on the product. */
  editingTextId: string | null
  /** "Turn the product to show this design x" (from the wrap strip); `n` makes repeats count. */
  turnRequest: { x: number; n: number } | null
  openDrawer: (tab: Tab) => void
  toggleDrawer: (tab: Tab) => void
  closeDrawer: () => void
  setFlat: (flat: boolean) => void
  requestTurn: (x: number) => void
  startTextEdit: (layerId: string) => void
  endTextEdit: () => void
}

/** Screen/UI state that isn't part of the design (not in undo history). */
export const useUiStore = create<UiState>()((set) => ({
  zone: null,
  setZone: (zone) => set({ zone }),
  atCounter: false,
  goToCounter: () => set({ atCounter: true, drawer: null, editingTextId: null }),
  leaveCounter: () => set({ atCounter: false }),
  drawer: null,
  flat: false,
  editingTextId: null,
  turnRequest: null,
  openDrawer: (drawer) => set({ drawer }),
  toggleDrawer: (tab) => set((s) => ({ drawer: s.drawer === tab ? null : tab })),
  closeDrawer: () => set({ drawer: null }),
  setFlat: (flat) => set({ flat }),
  requestTurn: (x) => set((s) => ({ turnRequest: { x, n: (s.turnRequest?.n ?? 0) + 1 } })),
  startTextEdit: (editingTextId) => set({ editingTextId }),
  endTextEdit: () => set({ editingTextId: null }),
}))

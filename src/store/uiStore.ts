import { create } from 'zustand'

/** Editor content categories (the dock's buttons / the flat editor's tabs). */
export type Tab = 'photo' | 'effects' | 'stickers' | 'text' | 'background'

type UiState = {
  /** Open drawer over the 3D scene, or null. */
  drawer: Tab | null
  /** The full 2D editor instead of editing on the 3D product. */
  flat: boolean
  openDrawer: (tab: Tab) => void
  toggleDrawer: (tab: Tab) => void
  closeDrawer: () => void
  setFlat: (flat: boolean) => void
}

/** Screen/UI state that isn't part of the design (not in undo history). */
export const useUiStore = create<UiState>()((set) => ({
  drawer: null,
  flat: false,
  openDrawer: (drawer) => set({ drawer }),
  toggleDrawer: (tab) => set((s) => ({ drawer: s.drawer === tab ? null : tab })),
  closeDrawer: () => set({ drawer: null }),
  setFlat: (flat) => set({ flat }),
}))

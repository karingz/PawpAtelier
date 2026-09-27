import { create } from 'zustand'
import type { ProductSpec } from '../config/products'
import { log } from '../debug/log'
import { useDesignStore, type Design } from '../store/designStore'
import { recklessRoll } from './reckless'
import { newSeed, seedCode } from './rng'

export type Roll = { id: string; seed: number; r: number; design: Design; thumb?: string }

type ProductRolls = {
  /** The design rolls start from (the last hand-edited version). */
  base: Design | null
  /** Newest first. */
  rolls: Roll[]
  activeId: string | null
}

type RecklessState = {
  /** Intensity 0 (sane) .. 100 (go crazy). */
  r: number
  byProduct: Record<string, ProductRolls>
  setR: (r: number) => void
  /** New random roll at the current intensity. */
  roll: (spec: ProductSpec) => void
  /** Re-run the showing roll (same seed) at the current intensity. */
  rerollAtR: (spec: ProductSpec) => void
  /** Go back to an earlier roll. */
  restore: (spec: ProductSpec, rollId: string) => void
  setThumb: (productId: string, rollId: string, thumb: string) => void
}

const HISTORY = 12
const same = (a: Design, b: Design) => JSON.stringify(a) === JSON.stringify(b)
const empty = (): ProductRolls => ({ base: null, rolls: [], activeId: null })

/** Is the design on screen exactly the active roll (i.e. not hand-edited since)? */
export function activeRoll(p: ProductRolls | undefined): Roll | undefined {
  const roll = p?.rolls.find((x) => x.id === p.activeId)
  return roll && same(roll.design, useDesignStore.getState().design) ? roll : undefined
}

export const useRecklessStore = create<RecklessState>()((set, get) => {
  const product = (id: string) => get().byProduct[id] ?? empty()
  const put = (id: string, p: ProductRolls) => set((s) => ({ byProduct: { ...s.byProduct, [id]: p } }))

  return {
    r: 35,
    byProduct: {},
    setR: (r) => set({ r }),

    roll: (spec) => {
      const p = product(spec.id)
      const current = useDesignStore.getState().design
      // Hand-edited since the last roll (or first roll): that becomes the new base.
      const base = activeRoll(p) && p.base ? p.base : current
      const seed = newSeed()
      const { r } = get()
      const design = recklessRoll(base, spec, r, seed)
      log.info('reckless', `roll ${seedCode(seed)} r=${r}`, { layers: design.layers.length })
      useDesignStore.getState().replaceDesign(design)
      const roll: Roll = { id: crypto.randomUUID(), seed, r, design }
      put(spec.id, { base, rolls: [roll, ...p.rolls].slice(0, HISTORY), activeId: roll.id })
    },

    rerollAtR: (spec) => {
      const p = product(spec.id)
      const active = activeRoll(p)
      const { r } = get()
      if (!active || !p.base || active.r === r) return
      const design = recklessRoll(p.base, spec, r, active.seed)
      useDesignStore.getState().replaceDesign(design)
      const updated: Roll = { ...active, r, design, thumb: undefined }
      put(spec.id, { ...p, rolls: p.rolls.map((x) => (x.id === active.id ? updated : x)) })
    },

    restore: (spec, rollId) => {
      const p = product(spec.id)
      const roll = p.rolls.find((x) => x.id === rollId)
      if (!roll) return
      useDesignStore.getState().replaceDesign(roll.design)
      put(spec.id, { ...p, activeId: roll.id })
      set({ r: roll.r })
    },

    setThumb: (productId, rollId, thumb) => {
      const p = product(productId)
      put(productId, { ...p, rolls: p.rolls.map((x) => (x.id === rollId ? { ...x, thumb } : x)) })
    },
  }
})

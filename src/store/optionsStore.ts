import { useMemo } from 'react'
import { create } from 'zustand'
import { withDefaults, type ChosenOptions, type ProductSpec } from '../config/products'

type OptionsState = {
  /** Per product: the chosen option values (missing ones use the first choice). */
  byProduct: Record<string, ChosenOptions>
  choose: (productId: string, optionId: string, choiceId: string) => void
}

/** The blank's options (tee color, case finish, …): part of the order, not of the design. */
export const useOptionsStore = create<OptionsState>()((set) => ({
  byProduct: {},
  choose: (productId, optionId, choiceId) =>
    set((s) => ({ byProduct: { ...s.byProduct, [productId]: { ...s.byProduct[productId], [optionId]: choiceId } } })),
}))

const NONE: ChosenOptions = {}

/** A product's options with defaults filled in (stable while nothing changes). */
export function useProductOptions(spec: ProductSpec): ChosenOptions {
  const chosen = useOptionsStore((s) => s.byProduct[spec.id] ?? NONE)
  return useMemo(() => withDefaults(spec, chosen), [spec, chosen])
}

export function productOptions(spec: ProductSpec): ChosenOptions {
  return withDefaults(spec, useOptionsStore.getState().byProduct[spec.id])
}

import type { ProductSpec } from '../config/products'
import type { Tab } from '../store/uiStore'

/** Editor categories: the flat editor's tabs and the 3D view's dock buttons. */
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'photo', label: 'Photo', icon: '🖼️' },
  { id: 'effects', label: 'Effects', icon: '✨' },
  { id: 'stickers', label: 'Stickers', icon: '🐾' },
  { id: 'text', label: 'Text', icon: '🔤' },
  { id: 'background', label: 'Background', icon: '🎨' },
  { id: 'surprise', label: 'Surprise', icon: '🎲' },
]

/** The tabs for a product: its options (tee color, case finish, …) first, when it has any. */
export function tabsFor(spec: ProductSpec): typeof TABS {
  if (!spec.options?.length) return TABS
  return [{ id: 'options', label: spec.kind === 'tee' ? 'Shirt' : 'Case', icon: spec.kind === 'tee' ? '👕' : '📱' }, ...TABS]
}

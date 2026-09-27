/**
 * A photo's look: adjustments + one effect, stored on the layer as plain data. The filtered
 * image is always re-rendered from the unfiltered photo, so looks are fully editable and the
 * print server can re-apply them at print resolution.
 *
 * Sizes (blur, pixel blocks, outlines) are relative to the image, so a preview and the full
 * render look the same.
 */

export type EffectId = 'none' | 'bw' | 'vintage' | 'pop' | 'posterize' | 'pixel' | 'emboss' | 'cartoon'

export type PhotoLook = {
  /** -100..100 */
  brightness: number
  /** -100..100 */
  contrast: number
  /** -100..100 (-100 = grayscale) */
  saturation: number
  /** -100 (cool) .. 100 (warm) */
  warmth: number
  /** 0..100 */
  blur: number
  /** 0..100 */
  sharpen: number
  effect: EffectId
  /** 0..100, how strongly the effect applies */
  strength: number
}

export const DEFAULT_LOOK: PhotoLook = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  blur: 0,
  sharpen: 0,
  effect: 'none',
  strength: 70,
}

export const ADJUSTMENTS: { key: keyof PhotoLook; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 100 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
]

export const EFFECTS: { id: EffectId; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'pop', label: 'Pop' },
  { id: 'posterize', label: 'Posterize' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'emboss', label: 'Emboss' },
  { id: 'cartoon', label: 'Cartoon' },
]

export function withDefaults(look: Partial<PhotoLook> | undefined): PhotoLook {
  return { ...DEFAULT_LOOK, ...look }
}

export function isDefaultLook(look: Partial<PhotoLook> | undefined): boolean {
  const l = withDefaults(look)
  return (Object.keys(DEFAULT_LOOK) as (keyof PhotoLook)[]).every(
    (k) => k === 'strength' || l[k] === DEFAULT_LOOK[k],
  )
}

/** Stable cache key for a look (strength only matters when there is an effect). */
export function lookKey(look: Partial<PhotoLook> | undefined): string {
  const l = withDefaults(look)
  return [l.brightness, l.contrast, l.saturation, l.warmth, l.blur, l.sharpen, l.effect, l.effect === 'none' ? 0 : l.strength].join(',')
}

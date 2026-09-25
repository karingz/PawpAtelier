/** Messages between the editor and the cutout (background removal) worker. */

/** A point on the source photo, normalized to 0..1. label 1 = keep this, 0 = remove this. */
export type Tap = { x: number; y: number; label: 0 | 1 }

/** What the user told us: a rough loop around the pet (normalized polygon) and/or taps. */
export type CutoutPrompt = { lasso: [number, number][] | null; taps: Tap[] }

export type CutoutRequest =
  /** One click: automatic cutout, full resolution. */
  | { id: string; type: 'auto'; src: string }
  /** Lasso/taps: quick low-res mask preview. */
  | { id: string; type: 'preview'; src: string; prompt: CutoutPrompt }
  /** Lasso/taps: final cutout, full resolution. */
  | { id: string; type: 'refine'; src: string; prompt: CutoutPrompt }

export type CutoutResponse =
  | { id: string; type: 'progress'; phase: 'download' | 'running'; percent: number }
  | {
      id: string
      type: 'mask'
      /** One byte per pixel (0..255), row-major. Full size for auto/refine, small for preview. */
      alpha: Uint8ClampedArray
      width: number
      height: number
      info: Record<string, string | number | boolean>
    }
  | { id: string; type: 'error'; message: string }

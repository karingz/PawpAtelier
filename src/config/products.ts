// Product specs. Physical sizes are in inches so print areas can be matched
// against real blanks / POD templates later. Design units = 100 per inch.

export const DESIGN_UNITS_PER_INCH = 100

export type MugSpec = {
  id: string
  name: string
  /** Print wrap size in inches (flat template). */
  print: { widthIn: number; heightIn: number }
  /** Physical body size in inches. */
  body: { diameterIn: number; heightIn: number }
  /** Pixel width of the live preview texture (not the print file). */
  previewTextureWidth: number
  color: string
}

export const MUG_11OZ: MugSpec = {
  id: 'mug-11oz',
  name: 'Classic Mug 11oz',
  print: { widthIn: 8.5, heightIn: 3.5 },
  body: { diameterIn: 3.25, heightIn: 3.8 },
  previewTextureWidth: 2048,
  color: '#ffffff',
}

export function designSize(spec: MugSpec) {
  return {
    width: spec.print.widthIn * DESIGN_UNITS_PER_INCH,
    height: spec.print.heightIn * DESIGN_UNITS_PER_INCH,
  }
}

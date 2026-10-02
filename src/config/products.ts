// Product specs. Physical sizes are in inches so print areas can be matched
// against real blanks / POD templates later. Design units = 100 per inch.

export const DESIGN_UNITS_PER_INCH = 100

/** Where a product lives in the shop (a zone of the room). */
export type ZoneId = 'drinkware' | 'apparel' | 'accessories'

/** A round product printed with a flat wrap (mug, tumbler). */
export type CylinderSpec = {
  id: string
  kind: 'cylinder'
  name: string
  /** What it's called in a sentence ("this mug"). */
  noun: string
  zone: ZoneId
  /** Retail price in US dollars. TODO: placeholder until pricing is decided (POD cost + margin). */
  priceUsd: number
  /** Print wrap size in inches (flat template). */
  print: { widthIn: number; heightIn: number }
  /** Physical body size in inches. */
  body: { diameterIn: number; heightIn: number }
  /** Print band center, in inches above the body's center. */
  printOffsetIn?: number
  handle: boolean
  lid: boolean
  /** Pixel width of the live preview texture (not the print file). */
  previewTextureWidth: number
  color: string
}

export type ProductSpec = CylinderSpec

export const MUG_11OZ: CylinderSpec = {
  id: 'mug-11oz',
  kind: 'cylinder',
  name: 'Classic Mug 11oz',
  noun: 'mug',
  zone: 'drinkware',
  priceUsd: 19.99,
  print: { widthIn: 8.5, heightIn: 3.5 },
  body: { diameterIn: 3.25, heightIn: 3.8 },
  handle: true,
  lid: false,
  previewTextureWidth: 2048,
  color: '#ffffff',
}

// TODO: confirm print area against the chosen POD provider's 20oz skinny template.
export const TUMBLER_20OZ: CylinderSpec = {
  id: 'tumbler-20oz',
  kind: 'cylinder',
  name: 'Skinny Tumbler 20oz',
  noun: 'tumbler',
  zone: 'drinkware',
  priceUsd: 29.99,
  print: { widthIn: 8.9, heightIn: 7.4 },
  body: { diameterIn: 2.9, heightIn: 8.0 },
  printOffsetIn: -0.15,
  handle: false,
  lid: true,
  previewTextureWidth: 2048,
  color: '#fbf7f2',
}

export const PRODUCTS: ProductSpec[] = [MUG_11OZ, TUMBLER_20OZ]

export function getProduct(id: string): ProductSpec {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0]
}

export function designSize(spec: ProductSpec) {
  return {
    width: spec.print.widthIn * DESIGN_UNITS_PER_INCH,
    height: spec.print.heightIn * DESIGN_UNITS_PER_INCH,
  }
}

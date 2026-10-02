// Product specs. Physical sizes are in inches so print areas can be matched
// against real blanks / POD templates later. Design units = 100 per inch.

export const DESIGN_UNITS_PER_INCH = 100

/** Where a product lives in the shop (a zone of the room). */
export type ZoneId = 'drinkware' | 'apparel' | 'accessories'

/** A choice the customer makes about the blank itself (tee color, case finish, …). */
export type OptionDef = {
  id: string
  label: string
  /** How Leah asks about it. */
  question: string
  choices: { id: string; label: string; color?: string }[]
}

type SpecBase = {
  id: string
  name: string
  /** What it's called in a sentence ("this mug"). */
  noun: string
  zone: ZoneId
  /** Retail price in US dollars. TODO: placeholder until pricing is decided (POD cost + margin). */
  priceUsd: number
  /** Print area in inches (the flat print file). */
  print: { widthIn: number; heightIn: number }
  /** Pixel width of the live preview texture (not the print file). */
  previewTextureWidth: number
  /** The blank's color where nothing is printed. */
  color: string
  options?: OptionDef[]
}

/** A round product printed with a flat wrap (mug, tumbler). */
export type CylinderSpec = SpecBase & {
  kind: 'cylinder'
  /** Physical body size in inches. */
  body: { diameterIn: number; heightIn: number }
  /** Print band center, in inches above the body's center. */
  printOffsetIn?: number
  handle: boolean
  lid: boolean
}

/** A hole in a case's back for the camera, in print inches (x right, y down, seen from behind). */
export type Cutout = { kind: 'rect'; x: number; y: number; w: number; h: number; r: number } | { kind: 'circle'; x: number; y: number; r: number }

/** A phone case printed on its whole back (the print area is the back, minus the camera cutout). */
export type CaseSpec = SpecBase & {
  kind: 'case'
  /** Outer case size in inches; the print covers the back (width × height). */
  body: { depthIn: number; cornerIn: number }
  cutouts: Cutout[]
  /** Camera lenses showing through the cutouts (print inches, radius). */
  lenses: { x: number; y: number; r: number }[]
  /** The phone's back color, seen through a clear case. */
  phoneColor: string
}

/** A t-shirt printed on the front or the back. */
export type TeeSpec = SpecBase & {
  kind: 'tee'
  /** Body width (armpit to armpit) and length (collar to hem), in inches. */
  shirt: { widthIn: number; lengthIn: number }
  /** Top of the print area, in inches below the collar. */
  printTopIn: number
}

export type ProductSpec = CylinderSpec | CaseSpec | TeeSpec

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

const TEE_COLORS: OptionDef = {
  id: 'color',
  label: 'Color',
  question: 'Which color tee?',
  choices: [
    { id: 'white', label: 'White', color: '#f7f6f2' },
    { id: 'black', label: 'Black', color: '#2a2928' },
    { id: 'grey', label: 'Heather grey', color: '#b8b7b3' },
    { id: 'beige', label: 'Beige', color: '#e4d6bd' },
  ],
}
const TEE_SIDE: OptionDef = {
  id: 'side',
  label: 'Print on',
  question: 'Should your pet go on the front or the back?',
  choices: [
    { id: 'front', label: 'Front' },
    { id: 'back', label: 'Back' },
  ],
}

// Print area: the usual DTG maximum (12 × 16 in, front or back). TODO: confirm with the POD provider.
export const TEE: TeeSpec = {
  id: 'tee-classic',
  kind: 'tee',
  name: 'Classic Tee',
  noun: 'tee',
  zone: 'apparel',
  priceUsd: 24.99,
  print: { widthIn: 12, heightIn: 16 },
  shirt: { widthIn: 20, lengthIn: 28 },
  printTopIn: 3.5,
  previewTextureWidth: 1536,
  color: '#f7f6f2',
  options: [TEE_COLORS, TEE_SIDE],
}

const CASE_FINISH: OptionDef = {
  id: 'finish',
  label: 'Case',
  question: 'Soft matte, or clear so your phone shows through?',
  choices: [
    { id: 'matte', label: 'Soft matte' },
    { id: 'clear', label: 'Clear silicone' },
  ],
}

// Phone sizes: iPhone 18 Pro 150.0 × 71.9 × 8.75 mm, Galaxy S26 Ultra 163.6 × 78.1 × 7.9 mm;
// cases add ~1.5 mm a side. Camera layouts are approximate. TODO: replace with the POD
// provider's case templates (print file size and cutouts) once those models are listed.
export const CASE_IPHONE: CaseSpec = {
  id: 'case-iphone-18-pro',
  kind: 'case',
  name: 'iPhone 18 Pro Case',
  noun: 'case',
  zone: 'accessories',
  priceUsd: 22.99,
  print: { widthIn: 2.95, heightIn: 6.02 },
  body: { depthIn: 0.45, cornerIn: 0.42 },
  // The full-width camera plateau across the top.
  cutouts: [{ kind: 'rect', x: 0.1, y: 0.1, w: 2.75, h: 1.3, r: 0.32 }],
  lenses: [
    { x: 0.52, y: 0.45, r: 0.27 },
    { x: 0.52, y: 1.05, r: 0.27 },
    { x: 1.08, y: 0.75, r: 0.27 },
    { x: 2.45, y: 0.42, r: 0.09 },
  ],
  phoneColor: '#c9ccd1',
  previewTextureWidth: 768,
  color: '#ffffff',
  options: [CASE_FINISH],
}

export const CASE_GALAXY: CaseSpec = {
  id: 'case-galaxy-s26-ultra',
  kind: 'case',
  name: 'Galaxy S26 Ultra Case',
  noun: 'case',
  zone: 'accessories',
  priceUsd: 22.99,
  print: { widthIn: 3.19, heightIn: 6.56 },
  body: { depthIn: 0.43, cornerIn: 0.2 },
  // Separate lenses in a column at the top left.
  cutouts: [
    { kind: 'circle', x: 0.55, y: 0.55, r: 0.3 },
    { kind: 'circle', x: 0.55, y: 1.2, r: 0.3 },
    { kind: 'circle', x: 0.55, y: 1.85, r: 0.3 },
    { kind: 'circle', x: 1.15, y: 0.55, r: 0.15 },
  ],
  lenses: [
    { x: 0.55, y: 0.55, r: 0.25 },
    { x: 0.55, y: 1.2, r: 0.25 },
    { x: 0.55, y: 1.85, r: 0.25 },
    { x: 1.15, y: 0.55, r: 0.1 },
  ],
  phoneColor: '#5c6470',
  previewTextureWidth: 768,
  color: '#ffffff',
  options: [CASE_FINISH],
}

export const PRODUCTS: ProductSpec[] = [MUG_11OZ, TUMBLER_20OZ, TEE, CASE_IPHONE, CASE_GALAXY]

export function getProduct(id: string): ProductSpec {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0]
}

export function designSize(spec: ProductSpec) {
  return {
    width: spec.print.widthIn * DESIGN_UNITS_PER_INCH,
    height: spec.print.heightIn * DESIGN_UNITS_PER_INCH,
  }
}

/** The chosen options of a product (each falls back to its first choice). */
export type ChosenOptions = Record<string, string>

export function withDefaults(spec: ProductSpec, chosen: ChosenOptions | undefined): ChosenOptions {
  const out: ChosenOptions = {}
  for (const o of spec.options ?? []) out[o.id] = chosen?.[o.id] ?? o.choices[0].id
  return out
}

/**
 * How the print sits on the blank, given the options: the color behind an empty print, and
 * whether empty print areas are see-through (a tee shows the fabric, a clear case the phone).
 */
export function printBase(spec: ProductSpec, options: ChosenOptions): { color: string; transparent: boolean } {
  if (spec.kind === 'tee') {
    const c = spec.options?.find((o) => o.id === 'color')?.choices.find((x) => x.id === options.color)
    return { color: c?.color ?? spec.color, transparent: true }
  }
  if (spec.kind === 'case' && options.finish === 'clear') return { color: spec.phoneColor, transparent: true }
  return { color: spec.color, transparent: false }
}

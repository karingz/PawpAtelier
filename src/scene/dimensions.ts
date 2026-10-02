import type { CylinderSpec, ProductSpec, TeeSpec } from '../config/products'

/** Scene units per inch (1 unit = 10 cm). */
export const UNITS_PER_INCH = 0.254

/** Physical size in scene units, for layout and camera framing. */
export function cylinderSize(spec: CylinderSpec) {
  const radius = (spec.body.diameterIn / 2) * UNITS_PER_INCH
  const height = spec.body.heightIn * UNITS_PER_INCH
  const handleReach = spec.handle ? height * 0.26 + 0.045 : 0
  return { radius, height, width: radius * 2 + handleReach * 2 }
}

/** How far a tee's sleeves reach out past its body, each side (inches). */
export const TEE_SLEEVE_IN = 5.5
/** Puffy cartoon tee: thickness of the body (inches), before its rounded edges. */
export const TEE_DEPTH_IN = 1.2

export function teeSize(spec: TeeSpec) {
  return {
    width: (spec.shirt.widthIn + TEE_SLEEVE_IN * 2) * UNITS_PER_INCH,
    height: spec.shirt.lengthIn * UNITS_PER_INCH,
    depth: TEE_DEPTH_IN * UNITS_PER_INCH,
  }
}

/**
 * Any product's size in scene units: width × height for framing, `radius` for the contact
 * shadow. Products are placed by the center of their base.
 */
export function productSize(spec: ProductSpec) {
  if (spec.kind === 'cylinder') {
    const c = cylinderSize(spec)
    return { width: c.width, height: c.height, radius: c.radius }
  }
  if (spec.kind === 'tee') {
    const t = teeSize(spec)
    return { width: t.width, height: t.height, radius: t.width * 0.35 }
  }
  return {
    width: spec.print.widthIn * UNITS_PER_INCH,
    height: spec.print.heightIn * UNITS_PER_INCH,
    radius: spec.print.widthIn * UNITS_PER_INCH * 0.5,
  }
}

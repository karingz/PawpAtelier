import type { CylinderSpec } from '../config/products'

/** Scene units per inch (1 unit = 10 cm). */
export const UNITS_PER_INCH = 0.254

/** Physical size in scene units, for layout and camera framing. */
export function cylinderSize(spec: CylinderSpec) {
  const radius = (spec.body.diameterIn / 2) * UNITS_PER_INCH
  const height = spec.body.heightIn * UNITS_PER_INCH
  const handleReach = spec.handle ? height * 0.26 + 0.045 : 0
  return { radius, height, width: radius * 2 + handleReach * 2 }
}

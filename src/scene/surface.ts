// Where the print lives on a product, and how design coordinates map onto it.
//
// Design space: x → right, y → down, in design units (100 per inch), origin at the print's
// top-left. For a cylinder (mug, tumbler) the print wraps around the body as an open band;
// the band's UVs map 1:1 onto the design (texture flipY: design y=0 is the band's top).

import * as THREE from 'three'
import { designSize, type CylinderSpec } from '../config/products'
import { cylinderSize, UNITS_PER_INCH } from './dimensions'

/** The print band as built by CylinderProduct (radius slightly outside the body). */
export type CylinderBand = {
  radius: number
  height: number
  /** Band center height, relative to the body center. */
  y: number
  /** Angle where design x=0 sits; the band runs `arc` radians from there. */
  start: number
  arc: number
}

export function cylinderBand(spec: CylinderSpec): CylinderBand {
  const { radius } = cylinderSize(spec)
  const circumferenceIn = Math.PI * spec.body.diameterIn
  const arc = Math.min(spec.print.widthIn / circumferenceIn, 0.995) * Math.PI * 2
  return {
    radius: radius + 0.0012,
    height: spec.print.heightIn * UNITS_PER_INCH,
    y: (spec.printOffsetIn ?? 0) * UNITS_PER_INCH,
    // Center the wrap's gap (or seam) on +X, where the handle is.
    start: Math.PI / 2 + (Math.PI * 2 - arc) / 2,
    arc,
  }
}

/** A design point on the band, in the band mesh's local frame (+ the outward normal). */
export function designToBandLocal(spec: CylinderSpec, x: number, y: number, out = new THREE.Vector3(), normal?: THREE.Vector3) {
  const band = cylinderBand(spec)
  const design = designSize(spec)
  const theta = band.start + (x / design.width) * band.arc
  const h = band.height / 2 - (y / design.height) * band.height
  out.set(band.radius * Math.sin(theta), h, band.radius * Math.cos(theta))
  normal?.set(Math.sin(theta), 0, Math.cos(theta))
  return out
}

/** A band UV (from a raycast) to a design point. */
export function uvToDesign(spec: CylinderSpec, uv: THREE.Vector2) {
  const design = designSize(spec)
  return { x: uv.x * design.width, y: (1 - uv.y) * design.height }
}

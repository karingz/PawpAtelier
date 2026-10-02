// Where the print lives on a product, and how design coordinates map onto it.
//
// Design space: x → right, y → down, in design units (100 per inch), origin at the print's
// top-left. For a cylinder (mug, tumbler) the print wraps around the body as an open band;
// on a tee or a phone case it's a flat panel. Either way the print mesh's UVs map 1:1 onto the
// design (texture flipY: design y=0 is the top).

import * as THREE from 'three'
import { designSize, type ChosenOptions, type CylinderSpec, type ProductSpec } from '../config/products'
import { cylinderSize, UNITS_PER_INCH } from './dimensions'

/** The print surface of any product, as used for editing on the 3D product. */
export type PrintSurface = {
  /** A design point on the print mesh, in the mesh's local frame (+ the outward normal). */
  toLocal: (x: number, y: number, out?: THREE.Vector3, normal?: THREE.Vector3) => THREE.Vector3
  /** A print-mesh UV (from a raycast) to a design point. */
  uvToDesign: (uv: THREE.Vector2) => { x: number; y: number }
  /** Which way the print faces at design x: an angle around Y in the product's frame (0 = +Z). */
  angleAt: (x: number) => number
  /** Wraps around the product (the wrap strip follows which part faces you). */
  wrap?: { start: number; arc: number }
}

export function printSurface(spec: ProductSpec, options: ChosenOptions): PrintSurface {
  if (spec.kind === 'cylinder') {
    const band = cylinderBand(spec)
    const W = designSize(spec).width
    return {
      toLocal: (x, y, out, normal) => designToBandLocal(spec, x, y, out, normal),
      uvToDesign: (uv) => uvToDesign(spec, uv),
      angleAt: (x) => band.start + (x / W) * band.arc,
      wrap: { start: band.start, arc: band.arc },
    }
  }
  // Flat: a panel centered on the print mesh's origin, facing +Z in the mesh's frame. A tee's
  // back print faces the other way in the product's frame.
  const { width: W, height: H } = designSize(spec)
  const w = spec.print.widthIn * UNITS_PER_INCH
  const h = spec.print.heightIn * UNITS_PER_INCH
  const angle = spec.kind === 'tee' && options.side === 'back' ? Math.PI : 0
  return {
    toLocal: (x, y, out = new THREE.Vector3(), normal) => {
      normal?.set(0, 0, 1)
      return out.set((x / W - 0.5) * w, (0.5 - y / H) * h, 0)
    },
    uvToDesign: (uv) => ({ x: uv.x * W, y: (1 - uv.y) * H }),
    angleAt: () => angle,
  }
}

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

import type { PhotoLayer } from '../store/designStore'

/** Axis-aligned box in a photo's local frame: origin at the photo center, unrotated, design units. */
export type Box = { x: number; y: number; width: number; height: number }

export const MIN_CROP_SIZE = 20

/** The currently visible (cropped) part of the photo. */
export function visibleBox(p: PhotoLayer): Box {
  return { x: -p.width / 2, y: -p.height / 2, width: p.width, height: p.height }
}

/** Where the whole, uncropped source image sits at the photo's current scale. */
export function fullImageBox(p: PhotoLayer): Box {
  const width = p.width / p.crop.width
  const height = p.height / p.crop.height
  return {
    x: -p.width / 2 - p.crop.x * width,
    y: -p.height / 2 - p.crop.y * height,
    width,
    height,
  }
}

/** Keep a crop box inside the source image and above the minimum size. */
export function clampBox(box: Box, bounds: Box): Box {
  const width = Math.min(Math.max(box.width, MIN_CROP_SIZE), bounds.width)
  const height = Math.min(Math.max(box.height, MIN_CROP_SIZE), bounds.height)
  return {
    x: Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.height - height),
    width,
    height,
  }
}

/** Turn a crop box into a photo update. The visible pixels stay exactly where they were on the print. */
export function applyCropBox(p: PhotoLayer, box: Box): Partial<PhotoLayer> {
  const full = fullImageBox(p)
  const lx = box.x + box.width / 2
  const ly = box.y + box.height / 2
  const r = (p.rotation * Math.PI) / 180
  return {
    crop: {
      x: (box.x - full.x) / full.width,
      y: (box.y - full.y) / full.height,
      width: box.width / full.width,
      height: box.height / full.height,
    },
    width: box.width,
    height: box.height,
    x: p.x + lx * Math.cos(r) - ly * Math.sin(r),
    y: p.y + lx * Math.sin(r) + ly * Math.cos(r),
  }
}

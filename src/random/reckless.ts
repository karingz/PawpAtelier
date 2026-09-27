// The "Reckless" randomizer: remix a design with an intensity slider r ∈ [0, 100].
//
//   0 = sane      small nudges, everything stays inside the print area, matching colors
//  50 = creative  new stickers/phrases, restyled text, bolder backgrounds, gentle effects
// 100 = go crazy  wild angles and sizes, clashing palettes, strong effects, lots added/removed
//
// Deterministic: the same (base design, product, r, seed) always gives the same result, so a
// roll can be reproduced and the slider can re-run "this roll" at another intensity.
// The pet photo is never removed and always stays mostly on the print.

import { designSize, DESIGN_UNITS_PER_INCH, type ProductSpec } from '../config/products'
import { FONTS } from '../content/fonts'
import { PALETTES, PATTERNS, SOLID_COLORS, getPalette } from '../content/patterns'
import { STICKERS } from '../content/stickers'
import { EFFECTS, type EffectId, type PhotoLook } from '../editor/look/look'
import type { Background, Design, Layer, PhotoLayer, StickerLayer, TextLayer } from '../store/designStore'
import { makeRng } from './rng'

const SAFE = 0.125 * DESIGN_UNITS_PER_INCH

const PHRASES = [
  'Good boy',
  'Good girl',
  'Best friend',
  'Treat please?',
  'Zoomies!',
  'Nap queen',
  'Woof',
  'Meow',
  'My baby',
  'Hooman is mine',
  'Too cute',
  '우리 강아지',
  '우리 고양이',
  '사랑해',
  '간식 주세요',
  '귀여워',
]
const hasHangul = (s: string) => /[ㄱ-힝]/.test(s)

/** Calm sticker themes for low intensity; anything goes higher up. */
const CALM_CATEGORIES = ['pets', 'hearts', 'sparkle']
const TEXT_COLORS = ['#3b2f2f', '#ffffff', '#d9607f', '#f2c14e', '#7cc9a9', '#7aa7e8', '#a58be0', '#2b2b2b']

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function recklessRoll(base: Design, spec: ProductSpec, r: number, seed: number): Design {
  const t = clamp(r, 0, 100) / 100
  const rng = makeRng(seed)
  const { width: W, height: H } = designSize(spec)
  let idCounter = 0
  const newId = () => `rk${seed.toString(36)}-${idCounter++}`

  // Where things may go: inside the safe area when sane, spilling off the edges when crazy.
  const spill = t > 0.6 ? (t - 0.6) * 0.5 : 0
  const bounds = {
    x0: SAFE - spill * W,
    x1: W - SAFE + spill * W,
    y0: SAFE - spill * H,
    y1: H - SAFE + spill * H,
  }

  // ---- Background ---------------------------------------------------------------------------
  let background: Background = base.background
  if (rng.chance(lerp(0.25, 0.9, t))) {
    if (t < 0.35) {
      // Harmonious: keep the kind of background, just a different soft palette.
      const palette = rng.pick(PALETTES.filter((p) => p.id !== 'night' && p.id !== 'classic'))
      background =
        base.background.kind === 'pattern'
          ? { ...base.background, paletteId: palette.id }
          : rng.chance(0.5)
            ? { kind: 'pattern', pattern: rng.pick(['dots', 'paws', 'hearts']), paletteId: palette.id, scale: 1 }
            : base.background
    } else if (rng.chance(0.15)) {
      background = { kind: 'solid', color: rng.pick(SOLID_COLORS) }
    } else {
      const scales = t > 0.8 ? [0.6, 1, 1.6, 2.4] : [0.6, 1, 1.6]
      background = { kind: 'pattern', pattern: rng.pick(PATTERNS).id, paletteId: rng.pick(PALETTES).id, scale: rng.pick(scales) }
    }
  }
  const palette = background.kind === 'pattern' ? getPalette(background.paletteId) : null
  // Text colors that suit the background when sane; anything when crazy.
  const textColor = () => (t < 0.5 && palette ? rng.pick([palette.fg, '#3b2f2f', '#ffffff']) : rng.pick(TEXT_COLORS))

  // ---- Existing layers: nudge, rescale, rotate, restyle -------------------------------------
  const photos = base.layers.filter((l): l is PhotoLayer => l.kind === 'photo')
  let layers: Layer[] = []
  for (const layer of base.layers) {
    // Stickers (and a few texts) may go; photos never do.
    if (layer.kind === 'sticker' && rng.chance(0.35 * t)) continue
    if (layer.kind === 'text' && rng.chance(0.15 * t)) continue
    layers.push(jitter(layer))
  }

  function jitter(layer: Layer): Layer {
    const isPhoto = layer.kind === 'photo'
    const calm = isPhoto ? 0.45 : 1 // photos move less: the pet stays the star
    const x = layer.x + rng.gauss() * lerp(0.02, 0.28, t) * W * calm
    const y = layer.y + rng.gauss() * lerp(0.02, 0.22, t) * H * calm
    const rotation = layer.rotation + rng.gauss() * lerp(3, 75, t) * calm
    const scale = Math.exp(rng.gauss() * lerp(0.05, 0.45, t) * calm)
    const place = isPhoto
      ? { x: clamp(x, W * 0.2, W * 0.8), y: clamp(y, H * 0.25, H * 0.75) }
      : { x: clamp(x, bounds.x0, bounds.x1), y: clamp(y, bounds.y0, bounds.y1) }

    if (layer.kind === 'text') {
      const next: TextLayer = {
        ...layer,
        ...place,
        rotation,
        fontSize: clamp(layer.fontSize * scale, 14, H * 0.5),
      }
      if (rng.chance(lerp(0.1, 0.7, t))) next.fontId = pickFont(layer.text)
      if (rng.chance(lerp(0.1, 0.6, t))) next.fill = textColor()
      if (rng.chance(0.3 * t)) next.outline = rng.pick([null, '#ffffff', '#3b2f2f'])
      return next
    }
    if (layer.kind === 'photo') {
      const f = clamp(scale, 0.75, 1.35)
      return { ...layer, ...place, rotation, width: layer.width * f, height: layer.height * f, look: rollLook(layer.look) }
    }
    return { ...layer, ...place, rotation, width: layer.width * scale, height: layer.height * scale }
  }

  function pickFont(text: string) {
    // Latin fonts fall back to a Korean face, but a Korean font reads better for Hangul.
    const pool = hasHangul(text) ? FONTS.filter((f) => f.script === 'korean') : FONTS
    return rng.pick(pool).id
  }

  function rollLook(look: Partial<PhotoLook> | undefined): Partial<PhotoLook> | undefined {
    if (t < 0.15 && !rng.chance(0.3)) return look
    const adjust = (v: number | undefined, spread: number) => Math.round(clamp((v ?? 0) + rng.gauss() * spread, -100, 100))
    const next: Partial<PhotoLook> = {
      ...look,
      brightness: adjust(look?.brightness, lerp(4, 25, t)),
      contrast: adjust(look?.contrast, lerp(4, 30, t)),
      saturation: adjust(look?.saturation, lerp(6, 55, t)),
      warmth: adjust(look?.warmth, lerp(5, 45, t)),
    }
    if (rng.chance(lerp(0, 0.85, t) ** 1.3)) {
      const effects = EFFECTS.map((e) => e.id).filter((id): id is EffectId => id !== 'none')
      // Calmer effects when sane; any of them when crazy.
      const pool = t < 0.5 ? effects.filter((e) => e === 'bw' || e === 'vintage' || e === 'pop') : effects
      next.effect = rng.pick(pool)
      next.strength = Math.round(lerp(35, 100, t * rng.range(0.6, 1)))
    }
    return next
  }

  // ---- New stickers ---------------------------------------------------------------------------
  const categories = t < 0.4 ? CALM_CATEGORIES : null
  const stickerPool = STICKERS.filter((s) => !categories || categories.includes(s.category))
  const addCount = Math.min(10, rng.poisson(lerp(0.4, 6, t)))
  for (let i = 0; i < addCount; i++) {
    const sticker = rng.pick(stickerPool)
    const size = H * rng.range(0.16, 0.34) * (t > 0.7 ? rng.range(0.7, 1.9) : 1)
    // When sane, prefer spots away from the pet photos (pick the best of a few tries).
    const tries = t < 0.5 ? 6 : 1
    let best = { x: 0, y: 0, score: -Infinity }
    for (let k = 0; k < tries; k++) {
      const x = rng.range(bounds.x0 + size / 2, bounds.x1 - size / 2)
      const y = rng.range(bounds.y0 + size / 2, bounds.y1 - size / 2)
      const score = photos.length ? Math.min(...photos.map((p) => Math.hypot((x - p.x) / p.width, (y - p.y) / p.height))) : 0
      if (score > best.score) best = { x, y, score }
    }
    const layer: StickerLayer = {
      id: newId(),
      kind: 'sticker',
      stickerId: sticker.id,
      src: sticker.src,
      x: best.x,
      y: best.y,
      width: size,
      height: size,
      rotation: rng.gauss() * lerp(8, 80, t),
    }
    layers.push(layer)
  }

  // ---- A phrase -----------------------------------------------------------------------------
  const hasText = layers.some((l) => l.kind === 'text')
  if (rng.chance(lerp(hasText ? 0.05 : 0.15, 0.6, t))) {
    const text = rng.pick(PHRASES)
    const layer: TextLayer = {
      id: newId(),
      kind: 'text',
      text,
      fontId: pickFont(text),
      fontSize: H * rng.range(0.12, 0.2) * (t > 0.7 ? rng.range(0.8, 1.6) : 1),
      fill: textColor(),
      outline: rng.chance(0.7) ? '#ffffff' : null,
      x: clamp(W / 2 + rng.gauss() * W * lerp(0.05, 0.3, t), bounds.x0, bounds.x1),
      y: rng.chance(0.5) ? H * rng.range(0.78, 0.86) : H * rng.range(0.14, 0.22),
      rotation: rng.gauss() * lerp(2, 40, t),
    }
    layers.push(layer)
  }

  // ---- Layer order ----------------------------------------------------------------------------
  if (rng.chance(0.6 * t)) {
    if (t < 0.7) {
      // Shuffle the decorations but keep photos at the bottom.
      const deco = rng.shuffle(layers.filter((l) => l.kind !== 'photo'))
      layers = [...layers.filter((l) => l.kind === 'photo'), ...deco]
    } else {
      layers = rng.shuffle(layers)
    }
  }

  return { background, layers }
}

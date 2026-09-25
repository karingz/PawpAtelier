// Background patterns drawn in code: sharp at any print size, seamless, recolorable and
// free of third-party licensing. Each pattern is a square tile in design units.

export type Palette = { id: string; label: string; bg: string; fg: string; accent: string }

export const PALETTES: Palette[] = [
  { id: 'strawberry', label: 'Strawberry milk', bg: '#ffe4ec', fg: '#f59ab5', accent: '#ffffff' },
  { id: 'mint', label: 'Mint', bg: '#e3f6ef', fg: '#7cc9a9', accent: '#fff4c2' },
  { id: 'sky', label: 'Sky', bg: '#e3f0ff', fg: '#7aa7e8', accent: '#ffffff' },
  { id: 'butter', label: 'Butter', bg: '#fff6d6', fg: '#f2c14e', accent: '#f59ab5' },
  { id: 'lavender', label: 'Lavender', bg: '#efe8ff', fg: '#a58be0', accent: '#ffd6e8' },
  { id: 'cocoa', label: 'Cocoa', bg: '#f3e6da', fg: '#8a5a44', accent: '#f2c14e' },
  { id: 'night', label: 'Night', bg: '#1f2544', fg: '#ffd66b', accent: '#8fb3ff' },
  { id: 'classic', label: 'Classic', bg: '#ffffff', fg: '#2b2b2b', accent: '#d9607f' },
]

export const SOLID_COLORS = [...new Set(['#ffffff', ...PALETTES.map((p) => p.bg), '#f59ab5', '#7aa7e8', '#2b2b2b'])]

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/** Tile edge in design units (100 = 1 inch). */
export const TILE = 100

type Draw = (ctx: CanvasRenderingContext2D, p: Palette) => void

/** Draw `fn` at (x, y) and at its wrapped copies, so shapes crossing an edge tile seamlessly. */
function wrapped(ctx: CanvasRenderingContext2D, x: number, y: number, fn: () => void) {
  for (const dx of [-TILE, 0, TILE]) {
    for (const dy of [-TILE, 0, TILE]) {
      ctx.save()
      ctx.translate(x + dx, y + dy)
      fn()
      ctx.restore()
    }
  }
}

function paw(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.ellipse(0, 5, 10, 8.5, 0, 0, Math.PI * 2)
  for (const [x, y] of [[-11, -6], [-4, -12.5], [4, -12.5], [11, -6]]) {
    ctx.moveTo(x + 4.2, y)
    ctx.arc(x, y, 4.2, 0, Math.PI * 2)
  }
  ctx.fill()
}

function heart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45)
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35)
  ctx.fill()
}

/** Small deterministic PRNG so confetti looks the same every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DRAW: Record<string, Draw> = {
  dots: (ctx, p) => {
    ctx.fillStyle = p.fg
    for (const [x, y] of [[25, 25], [75, 75]]) {
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  checker: (ctx, p) => {
    ctx.fillStyle = p.fg
    ctx.fillRect(0, 0, TILE / 2, TILE / 2)
    ctx.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2)
  },
  stripes: (ctx, p) => {
    ctx.strokeStyle = p.fg
    ctx.lineWidth = 16
    // Period 50 along X divides the tile, so the diagonals line up across edges.
    for (let o = -TILE; o <= TILE * 2; o += TILE / 2) {
      ctx.beginPath()
      ctx.moveTo(o, TILE)
      ctx.lineTo(o + TILE, 0)
      ctx.stroke()
    }
  },
  paws: (ctx, p) => {
    ctx.fillStyle = p.fg
    wrapped(ctx, 27, 30, () => {
      ctx.rotate(-0.35)
      paw(ctx)
    })
    wrapped(ctx, 75, 78, () => {
      ctx.rotate(0.3)
      paw(ctx)
    })
  },
  hearts: (ctx, p) => {
    wrapped(ctx, 25, 28, () => {
      ctx.fillStyle = p.fg
      ctx.rotate(-0.2)
      heart(ctx, 16)
    })
    wrapped(ctx, 75, 78, () => {
      ctx.fillStyle = p.accent
      ctx.rotate(0.25)
      heart(ctx, 13)
    })
  },
  confetti: (ctx, p) => {
    const rand = mulberry32(7)
    for (let i = 0; i < 14; i++) {
      const x = rand() * TILE
      const y = rand() * TILE
      const angle = rand() * Math.PI
      const color = i % 3 === 0 ? p.accent : p.fg
      const round = rand() < 0.4
      wrapped(ctx, x, y, () => {
        ctx.fillStyle = color
        ctx.rotate(angle)
        ctx.beginPath()
        if (round) ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
        else ctx.roundRect(-7, -2.5, 14, 5, 2.5)
        ctx.fill()
      })
    }
  },
}

export const PATTERNS = [
  { id: 'paws', label: 'Paws' },
  { id: 'dots', label: 'Dots' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'checker', label: 'Checks' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'confetti', label: 'Confetti' },
  { id: 'gradient', label: 'Gradient' },
] as const

const tileCache = new Map<string, HTMLCanvasElement>()

/** A pattern tile rendered at `density` pixels per design unit (cached). */
export function patternTile(patternId: string, palette: Palette, density: number): HTMLCanvasElement {
  const key = `${patternId}:${palette.id}:${density}`
  const cached = tileCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(TILE * density)
  const ctx = canvas.getContext('2d')!
  ctx.scale(density, density)
  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, TILE, TILE)
  DRAW[patternId]?.(ctx, palette)
  tileCache.set(key, canvas)
  return canvas
}

/** CSS background for a picker swatch. */
export function patternSwatch(patternId: string, palette: Palette): string {
  if (patternId === 'gradient') return `linear-gradient(135deg, ${palette.bg}, ${palette.fg})`
  return `url(${patternTile(patternId, palette, 1).toDataURL()}) 0 0 / 40px 40px`
}

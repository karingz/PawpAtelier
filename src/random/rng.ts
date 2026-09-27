/** Small deterministic PRNG (mulberry32): the same seed always gives the same sequence. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Handy draws on top of a seeded uniform source. */
export function makeRng(seed: number) {
  const next = mulberry32(seed)
  const rng = {
    next,
    /** Uniform in [a, b). */
    range: (a: number, b: number) => a + (b - a) * next(),
    /** Standard normal (Box–Muller). */
    gauss: () => {
      const u = Math.max(1e-9, next())
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
    },
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    /** Poisson-distributed count with mean `lambda` (Knuth). */
    poisson: (lambda: number) => {
      const limit = Math.exp(-lambda)
      let k = 0
      let p = next()
      while (p > limit) {
        k++
        p *= next()
      }
      return k
    },
    shuffle: <T>(items: T[]) => {
      const a = [...items]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
  }
  return rng
}

/** A fresh random 32-bit seed. */
export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Short, human-friendly form of a seed, e.g. "#4F2A". */
export function seedCode(seed: number) {
  return `#${(seed >>> 16).toString(16).toUpperCase().padStart(4, '0')}`
}

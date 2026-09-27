import { useEffect } from 'react'
import type { ProductSpec } from '../config/products'
import { activeRoll, useRecklessStore } from '../random/recklessStore'
import { seedCode } from '../random/rng'
import { useDesignStore } from '../store/designStore'

const MOODS = [
  { upTo: 25, face: '😇', label: 'Sane' },
  { upTo: 60, face: '🎨', label: 'Creative' },
  { upTo: 85, face: '🤩', label: 'Bold' },
  { upTo: 100, face: '🤪', label: 'Go crazy' },
]

/** The Reckless randomizer: intensity slider, Roll, and a history of rolls to go back to. */
export function SurprisePanel({ spec }: { spec: ProductSpec }) {
  const r = useRecklessStore((s) => s.r)
  const rolls = useRecklessStore((s) => s.byProduct[spec.id]?.rolls ?? NO_ROLLS)
  const activeId = useRecklessStore((s) => s.byProduct[spec.id]?.activeId ?? null)
  useDesignStore((s) => s.design) // re-render when the design changes (active roll may go stale)
  const { setR, roll, rerollAtR, restore } = useRecklessStore.getState()
  const current = activeRoll(useRecklessStore.getState().byProduct[spec.id])
  const mood = MOODS.find((m) => r <= m.upTo) ?? MOODS[MOODS.length - 1]

  useRollThumbnails(spec)

  return (
    <div className="panel__body surprise">
      <p className="app__note">
        Remix your design. Your pet photo always stays; everything else is fair game. Undo works too.
      </p>
      <label className="surprise__slider">
        <span className="surprise__mood" aria-hidden>
          {mood.face}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={r}
          onChange={(e) => setR(+e.target.value)}
          onPointerUp={() => rerollAtR(spec)}
          onKeyUp={() => rerollAtR(spec)}
          aria-label="How reckless"
        />
        <span className="surprise__value">{mood.label}</span>
      </label>
      <div className="surprise__scale" aria-hidden>
        <span>Sane</span>
        <span>Creative</span>
        <span>Go crazy</span>
      </div>
      <button className="btn btn--primary surprise__roll" onClick={() => roll(spec)}>
        🎲 Roll
      </button>
      {current && <p className="app__note">Showing roll {seedCode(current.seed)}. Move the slider to redo it wilder or tamer.</p>}

      {rolls.length > 0 && (
        <>
          <h3 className="panel__title">Your rolls</h3>
          <div className="roll-history">
            {rolls.map((x) => (
              <button
                key={x.id}
                className={`roll-history__item${x.id === activeId && current ? ' roll-history__item--active' : ''}`}
                onClick={() => restore(spec, x.id)}
                title={`${seedCode(x.seed)} · reckless ${x.r}`}
              >
                {x.thumb ? <img src={x.thumb} alt="" /> : <span className="roll-history__pending">🎲</span>}
                <span className="roll-history__label">{x.r}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const NO_ROLLS: never[] = []

/**
 * Snapshot the print as each roll's thumbnail once it has rendered (updated on every publish
 * while that roll is the design on screen, so late effect renders are included).
 */
function useRollThumbnails(spec: ProductSpec) {
  useEffect(() => {
    let raf = 0
    const capture = () => {
      const p = useRecklessStore.getState().byProduct[spec.id]
      const roll = activeRoll(p)
      const src = useDesignStore.getState().printCanvases[spec.id]
      if (!roll || !src) return
      const c = document.createElement('canvas')
      c.width = 160
      c.height = Math.round((160 * src.height) / src.width)
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
      useRecklessStore.getState().setThumb(spec.id, roll.id, c.toDataURL('image/jpeg', 0.8))
    }
    return useDesignStore.subscribe((s, prev) => {
      if (s.printVersions[spec.id] === prev.printVersions[spec.id]) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(capture)
    })
  }, [spec.id])
}

import { useEffect, useState } from 'react'
import { useClerkStore, type ClerkChoice } from './clerkStore'

const MS_PER_CHAR = 18
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Leah's speech bubble, game-NPC style: her avatar and name, the line typing itself out, and
 * either "tap to go on" or her choices. Tapping while it types shows the whole line.
 */
export function ClerkDialog() {
  const line = useClerkStore((s) => s.lines[s.at])
  const talk = useClerkStore((s) => s.talk)
  const { next, hush } = useClerkStore.getState()
  const text = line?.text ?? ''

  const [shown, setShown] = useState({ talk, chars: 0 })
  if (shown.talk !== talk) setShown({ talk, chars: reducedMotion() ? text.length : 0 })
  const typing = shown.chars < text.length

  useEffect(() => {
    if (!typing) return
    const t = setTimeout(() => setShown((s) => ({ ...s, chars: s.chars + 1 })), MS_PER_CHAR)
    return () => clearTimeout(t)
  }, [typing, shown])

  if (!line) return null

  const skipOrNext = () => (typing ? setShown({ talk, chars: text.length }) : !line.choices && next())
  const choose = (c: ClerkChoice) => {
    const before = useClerkStore.getState().talk
    c.run?.()
    // Unless the choice started a new conversation, move on.
    if (useClerkStore.getState().talk === before) next()
  }

  return (
    <div className="clerk" role="dialog" aria-label="Leah says" aria-live="polite">
      <img className="clerk__avatar" src="/clerk/leah-avatar.webp" alt="" width={56} height={56} />
      <div className="clerk__bubble" onClick={skipOrNext}>
        <div className="clerk__head">
          <span className="clerk__name">Leah</span>
          <button
            className="clerk__close"
            onClick={(e) => {
              e.stopPropagation()
              hush()
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="clerk__text">
          {text.slice(0, shown.chars)}
          {/* The rest is laid out but invisible, so the bubble doesn't grow while typing. */}
          <span className="clerk__rest" aria-hidden>
            {text.slice(shown.chars)}
          </span>
        </p>
        {!typing && line.choices && (
          <div className="clerk__choices">
            {line.choices.map((c) => (
              <button
                key={c.label}
                className={`btn btn--small${c.primary ? ' btn--primary' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  choose(c)
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {!typing && !line.choices && (
          <span className="clerk__more" aria-hidden>
            ▼
          </span>
        )}
      </div>
    </div>
  )
}

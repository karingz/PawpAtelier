import { create } from 'zustand'

/** A button under one of Leah's lines. Without `run` it just moves on to the next line. */
export type ClerkChoice = { label: string; run?: () => void; primary?: boolean }

/** One speech bubble. With choices, the visitor answers by tapping one; without, tap to go on. */
export type ClerkLine = { text: string; choices?: ClerkChoice[] }

type ClerkState = {
  /** What Leah is saying now (empty = quiet), and which line of it is showing. */
  lines: ClerkLine[]
  at: number
  /** Bumped whenever she starts a new line, so the standee can hop. */
  talk: number
  /** Conversations already had this visit (keys), so greetings don't repeat. */
  seen: Record<string, true>
  /**
   * Start a conversation (replacing whatever she was saying). With a `once` key, only the first
   * time this visit.
   */
  say: (lines: ClerkLine[], once?: string) => void
  next: () => void
  hush: () => void
}

export const useClerkStore = create<ClerkState>()((set, get) => ({
  lines: [],
  at: 0,
  talk: 0,
  seen: {},
  say: (lines, once) => {
    const s = get()
    if (once && s.seen[once]) return
    set({ lines, at: 0, talk: s.talk + 1, seen: once ? { ...s.seen, [once]: true } : s.seen })
  },
  next: () => {
    const s = get()
    if (s.at + 1 < s.lines.length) set({ at: s.at + 1, talk: s.talk + 1 })
    else set({ lines: [], at: 0 })
  },
  hush: () => set({ lines: [], at: 0 }),
}))

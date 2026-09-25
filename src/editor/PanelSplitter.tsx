import type { RefObject } from 'react'
import { DESKTOP, type Sizes } from './panelSizes'

/**
 * Drag handle between the 3D view and the editor: the editor's left edge on desktop, a grab
 * bar on its top edge on phones. Double-click / double-tap resets to the default split.
 */
export function PanelSplitter({
  mainRef,
  setSizes,
}: {
  mainRef: RefObject<HTMLElement | null>
  setSizes: (update: (s: Sizes) => Sizes) => void
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    const main = mainRef.current
    if (!main) return
    e.preventDefault()
    const desktop = window.matchMedia(DESKTOP).matches
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing')

    const move = (ev: PointerEvent) => {
      const r = main.getBoundingClientRect()
      if (desktop) {
        const width = Math.round(Math.min(r.width - 300, Math.max(320, r.right - ev.clientX)))
        setSizes((s) => ({ ...s, editorWidth: width }))
      } else {
        const height = Math.round(Math.min(r.height - 180, Math.max(160, ev.clientY - r.top)))
        setSizes((s) => ({ ...s, viewerHeight: height }))
      }
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('is-resizing')
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-label="Resize editor"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setSizes(() => ({ editorWidth: null, viewerHeight: null }))}
    >
      <span className="splitter__grip" />
    </div>
  )
}

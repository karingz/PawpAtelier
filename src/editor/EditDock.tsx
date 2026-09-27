import { useEffect, useState, type RefObject } from 'react'
import type { ProductSpec } from '../config/products'
import { selectedLayer, useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { TabPanel } from './Editor'
import { TABS } from './tabs'
import { WrapStrip } from './WrapStrip'

/**
 * Editing on the 3D product: a category bar (bottom on phones, a rail on the left on desktop)
 * and a drawer with that category's options, over the scene. Plus floating undo/redo.
 */
export function EditDock({ spec, dockRef }: { spec: ProductSpec; dockRef: RefObject<HTMLDivElement | null> }) {
  const drawer = useUiStore((s) => s.drawer)
  const { toggleDrawer, closeDrawer, openDrawer } = useUiStore.getState()
  const selected = useDesignStore(selectedLayer)

  // With a drawer open, selecting text switches it to the text settings.
  const [seen, setSeen] = useState(selected?.id)
  if (selected?.id !== seen) {
    setSeen(selected?.id)
    if (drawer && selected?.kind === 'text' && drawer !== 'text') openDrawer('text')
  }

  // A tap on the 3D scene closes the drawer (drags that turn the product or move a layer don't;
  // nor do taps on the toolbar, handles or the drawer itself, which aren't the scene's canvas).
  useEffect(() => {
    const viewer = dockRef.current?.parentElement
    if (!viewer || !drawer) return
    let start: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      start = e.target instanceof HTMLCanvasElement && e.target.closest('.scene') ? { x: e.clientX, y: e.clientY } : null
    }
    const up = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) closeDrawer()
      start = null
    }
    viewer.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      viewer.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [dockRef, drawer, closeDrawer])

  const current = TABS.find((t) => t.id === drawer)
  return (
    <>
      <HistoryButtons />
      <div ref={dockRef} className={`dock${drawer ? ' dock--open' : ''}`}>
        {drawer && current && (
          <section className="drawer" aria-label={current.label}>
            <header className="drawer__header">
              <h2>{current.label}</h2>
              <button className="btn btn--icon btn--small" onClick={closeDrawer} aria-label="Close">
                ✕
              </button>
            </header>
            <div className="drawer__body">
              <TabPanel tab={drawer} spec={spec} />
            </div>
          </section>
        )}
        {!drawer && <WrapStrip spec={spec} />}
        <nav className="category-bar" aria-label="Edit">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`category-bar__item${drawer === t.id ? ' category-bar__item--active' : ''}`}
              onClick={() => toggleDrawer(t.id)}
              aria-pressed={drawer === t.id}
            >
              <span className="category-bar__icon" aria-hidden>
                {t.icon}
              </span>
              <span className="category-bar__label">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

function HistoryButtons() {
  const canUndo = useDesignStore((s) => s.past.length > 0)
  const canRedo = useDesignStore((s) => s.future.length > 0)
  const { undo, redo } = useDesignStore.getState()
  return (
    <div className="history-float">
      <button className="btn btn--icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button className="btn btn--icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        ↷
      </button>
    </div>
  )
}

/** 3D / Flat switch for the header. */
export function ModeSwitch() {
  const flat = useUiStore((s) => s.flat)
  const tool = useDesignStore((s) => s.cropDraft !== null || s.lasso !== null)
  const setFlat = useUiStore((s) => s.setFlat)
  return (
    <div className="mode-switch" role="group" aria-label="Editing view">
      <button className={!flat ? 'mode-switch--on' : ''} onClick={() => setFlat(false)} disabled={tool}>
        3D
      </button>
      <button className={flat ? 'mode-switch--on' : ''} onClick={() => setFlat(true)} disabled={tool}>
        Flat
      </button>
    </div>
  )
}

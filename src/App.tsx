import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { PRODUCTS, getProduct } from './config/products'
import { Editor } from './editor/Editor'
import { PanelSplitter } from './editor/PanelSplitter'
import { usePanelSizes } from './editor/panelSizes'
import { Scene } from './scene/Scene'
import { useDesignStore } from './store/designStore'

export default function App() {
  const view = useDesignStore((s) => s.view)
  const spec = getProduct(useDesignStore((s) => s.productId))
  const backToShop = useDesignStore((s) => s.backToShop)
  const [ready, setReady] = useState(false)
  const viewerRef = useRef<HTMLElement>(null)
  const shopRef = useRef<HTMLElement>(null)
  const shopInset = useCoveredFraction(viewerRef, shopRef, view === 'shop')
  const mainRef = useRef<HTMLElement>(null)
  const panel = usePanelSizes()

  useEditorShortcuts()

  return (
    <div className={`app app--${view}`}>
      <header className="app__header">
        {view === 'edit' && (
          <button className="btn btn--back" onClick={backToShop}>
            ← Shop
          </button>
        )}
        <h1>Pawp Atelier</h1>
        {view === 'edit' && <span className="app__product">{spec.name}</span>}
      </header>

      <main ref={mainRef} className="app__main" style={view === 'edit' ? panel.style : undefined}>
        <section ref={viewerRef} className="app__viewer">
          <Scene onReady={() => setReady(true)} bottomInset={view === 'shop' ? shopInset : 0} />
          <p className="app__hint">{view === 'shop' ? 'Tap something to make it yours' : 'Drag to turn · scroll or pinch to zoom'}</p>
        </section>

        {view === 'shop' ? (
          <ShopSheet ref={shopRef} />
        ) : (
          <>
            <PanelSplitter mainRef={mainRef} setSizes={panel.setSizes} />
            <Editor key={spec.id} spec={spec} />
          </>
        )}
      </main>

      <LoadingScreen ready={ready} />
    </div>
  )
}

function ShopSheet({ ref }: { ref: RefObject<HTMLElement | null> }) {
  const openProduct = useDesignStore((s) => s.openProduct)
  return (
    <section ref={ref} className="app__shop">
      <h2>What are we making?</h2>
      <div className="product-list">
        {PRODUCTS.map((p) => (
          <button key={p.id} className="product-card" onClick={() => openProduct(p.id)}>
            <span className="product-card__name">{p.name}</span>
            <span className="product-card__meta">
              {p.print.widthIn} × {p.print.heightIn} in wrap
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** How much of `base`'s height `overlay` covers from the bottom (0..1), kept up to date. */
function useCoveredFraction(
  base: RefObject<HTMLElement | null>,
  overlay: RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [fraction, setFraction] = useState(0)
  useLayoutEffect(() => {
    const b = base.current
    const o = overlay.current
    if (!active || !b || !o) return
    const measure = () => {
      const br = b.getBoundingClientRect()
      const or = o.getBoundingClientRect()
      setFraction(br.height > 0 ? Math.max(0, br.bottom - or.top) / br.height : 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(b)
    observer.observe(o)
    return () => observer.disconnect()
  }, [base, overlay, active])
  return fraction
}

/** Covers the page until the 3D scene has drawn its first frame, then fades away. */
function LoadingScreen({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <div className={`loading${ready ? ' loading--done' : ''}`} onTransitionEnd={() => ready && setGone(true)}>
      <span className="loading__paw" aria-hidden>
        🐾
      </span>
      <span className="loading__name">Pawp Atelier</span>
    </div>
  )
}

/** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Delete removes, Esc cancels a crop. Editor only. */
function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { view, undo, redo, cancelCrop, cropDraft, lasso, endLasso, selectedId, removeLayer } = useDesignStore.getState()
      if (view !== 'edit') return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 'escape' && cropDraft) {
        cancelCrop()
      } else if (key === 'escape' && lasso) {
        endLasso()
      } else if ((key === 'delete' || key === 'backspace') && selectedId && !cropDraft && !lasso) {
        e.preventDefault()
        removeLayer(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

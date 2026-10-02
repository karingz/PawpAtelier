import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { PRODUCTS, getProduct } from './config/products'
import { ATELIER } from './room/rooms'
import { ClerkDialog } from './clerk/ClerkDialog'
import { OrderSheet } from './clerk/OrderSheet'
import { useClerkDirector } from './clerk/useClerkDirector'
import { EditDock, ModeSwitch } from './editor/EditDock'
import { Editor } from './editor/Editor'
import { PrintStage } from './editor/PrintCanvas'
import { PhotoToolModal } from './editor/PhotoToolModal'
import { useUiStore } from './store/uiStore'
import { PanelSplitter } from './editor/PanelSplitter'
import { SelectionOverlay } from './editor/SelectionOverlay'
import { usePanelSizes } from './editor/panelSizes'
import { Scene } from './scene/Scene'
import { transformPatch } from './editor/layerGeometry'
import { layersWithDraft, useDesignStore } from './store/designStore'

export default function App() {
  const view = useDesignStore((s) => s.view)
  const spec = getProduct(useDesignStore((s) => s.productId))
  const [ready, setReady] = useState(false)
  const viewerRef = useRef<HTMLElement>(null)
  const shopRef = useRef<HTMLElement>(null)
  const shopInset = useCoveredFraction(viewerRef, shopRef, view === 'shop')
  const mainRef = useRef<HTMLElement>(null)
  const panel = usePanelSizes()
  // Editing on the 3D product (dock + drawer), or the flat 2D editor. From the 3D view, crop
  // and lasso open a full-screen tool for the photo; in the flat editor they work in place.
  const flatChosen = useUiStore((s) => s.flat)
  const tool = useDesignStore((s) => s.cropDraft !== null || s.lasso !== null)
  // At Leah's desk: the order summary instead of the editing UI.
  const counter = useUiStore((s) => s.atCounter) && view === 'edit'
  const orderRef = useRef<HTMLElement>(null)
  const orderInset = useCoveredFraction(viewerRef, orderRef, counter)
  const flat = view === 'edit' && flatChosen && !counter
  const docked = view === 'edit' && !flat && !counter
  const dockRef = useRef<HTMLDivElement>(null)
  const dockInset = useDockInsets(viewerRef, dockRef, docked)

  useEditorShortcuts()
  useClerkDirector(ready)

  return (
    <div className={`app app--${view}${docked ? ' app--docked' : ''}${counter ? ' app--counter' : ''}`}>
      <header className="app__header">
        <BackButton />
        <h1>Pawp Atelier</h1>
        {view === 'edit' && <span className="app__product">{spec.name}</span>}
        {view === 'edit' && !counter && <ModeSwitch />}
        {view === 'edit' && !counter && <CounterButton />}
      </header>

      <main ref={mainRef} className="app__main" style={flat ? panel.style : undefined}>
        <section ref={viewerRef} className="app__viewer">
          <Scene
            onReady={() => setReady(true)}
            bottomInset={view === 'shop' ? shopInset : counter ? orderInset : docked ? dockInset.bottom : 0}
            leftInset={docked ? dockInset.left : 0}
          />
          {view === 'edit' && !tool && !counter && <SelectionOverlay />}
          <p className="app__hint">
            {view === 'shop' ? 'Tap something to make it yours' : counter ? 'Drag to turn it around' : 'Drag to turn · scroll or pinch to zoom'}
          </p>
          {docked && <EditDock key={spec.id} spec={spec} dockRef={dockRef} />}
          {counter && <OrderSheet key={spec.id} spec={spec} ref={orderRef} />}
          <ClerkDialog />
        </section>
        {/* The print feeding the 3D product: mounted for any kind of editing. */}
        {view === 'edit' && <PrintStage key={spec.id} spec={spec} />}
        {docked && tool && <PhotoToolModal />}

        {view === 'shop' && <ShopSheet ref={shopRef} />}
        {flat && (
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

/** "Done": take the product to Leah's desk for the order. */
function CounterButton() {
  const goToCounter = useUiStore((s) => s.goToCounter)
  return (
    <button className="btn btn--primary btn--counter" onClick={goToCounter} title="Bring it to the counter">
      Done <span aria-hidden>🛎️</span>
    </button>
  )
}

/** Back one level: counter → editing, product → its zone, zone → the whole room. */
function BackButton() {
  const view = useDesignStore((s) => s.view)
  const productId = useDesignStore((s) => s.productId)
  const zone = useUiStore((s) => s.zone)
  const { backToShop } = useDesignStore.getState()
  const { setZone, leaveCounter } = useUiStore.getState()
  const counter = useUiStore((s) => s.atCounter)
  if (view === 'edit' && counter) {
    return (
      <button className="btn btn--back" onClick={leaveCounter}>
        ← Keep editing
      </button>
    )
  }
  if (view === 'edit') {
    const z = ATELIER.zones.find((x) => x.id === getProduct(productId).zone)
    return (
      <button
        className="btn btn--back"
        onClick={() => {
          setZone(z?.id ?? null)
          backToShop()
        }}
      >
        ← {z?.label ?? 'Shop'}
      </button>
    )
  }
  if (zone) {
    return (
      <button className="btn btn--back" onClick={() => setZone(null)}>
        ← Shop
      </button>
    )
  }
  return null
}

/** Room level: pick a zone. Zone level: that zone's products (and what's coming soon). */
function ShopSheet({ ref }: { ref: RefObject<HTMLElement | null> }) {
  const openProduct = useDesignStore((s) => s.openProduct)
  const zone = useUiStore((s) => s.zone)
  const setZone = useUiStore((s) => s.setZone)
  const current = ATELIER.zones.find((z) => z.id === zone)

  if (!current) {
    return (
      <section ref={ref} className="app__shop">
        <h2>Welcome in! What are we making?</h2>
        <div className="product-list">
          {ATELIER.zones.map((z) => (
            <button key={z.id} className="product-card" onClick={() => setZone(z.id)}>
              <span className="product-card__name">{z.label}</span>
              <span className="product-card__meta">
                {PRODUCTS.filter((p) => p.zone === z.id).length || 'Coming soon'}
                {PRODUCTS.some((p) => p.zone === z.id) ? ' to choose from' : ''}
              </span>
            </button>
          ))}
        </div>
      </section>
    )
  }
  const products = PRODUCTS.filter((p) => p.zone === current.id)
  const soon = ATELIER.placeholders.filter((p) => p.zone === current.id)
  return (
    <section ref={ref} className="app__shop">
      <h2>{current.label}</h2>
      <div className="product-list">
        {products.map((p) => (
          <button key={p.id} className="product-card" onClick={() => openProduct(p.id)}>
            <span className="product-card__name">{p.name}</span>
            <span className="product-card__meta">
              {p.print.widthIn} × {p.print.heightIn} in wrap
            </span>
          </button>
        ))}
        {soon.map((p) => (
          <div key={p.marker} className="product-card product-card--soon" aria-disabled>
            <span className="product-card__name">{p.label}</span>
            <span className="product-card__meta">Coming soon</span>
          </div>
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

/**
 * How much of the 3D view the dock covers: from the bottom on phones (bar + drawer), from the
 * left on desktop (rail + drawer), as fractions, so the camera can frame the product beside it.
 */
function useDockInsets(viewer: RefObject<HTMLElement | null>, dock: RefObject<HTMLElement | null>, active: boolean) {
  const [insets, setInsets] = useState({ bottom: 0, left: 0 })
  useLayoutEffect(() => {
    const v = viewer.current
    const d = dock.current
    if (!active || !v || !d) return
    const measure = () => {
      const vr = v.getBoundingClientRect()
      const dr = d.getBoundingClientRect()
      const side = dr.height > vr.height * 0.8 // a full-height rail = desktop layout
      // On desktop the wrap strip floats at the bottom of the scene: keep the product above it.
      const strip = d.querySelector('.wrap-strip')?.getBoundingClientRect()
      const stripBottom = strip && vr.height > 0 ? Math.max(0, vr.bottom - strip.top + 8) / vr.height : 0
      setInsets(
        side
          ? { bottom: stripBottom, left: vr.width > 0 ? Math.max(0, dr.right - vr.left) / vr.width : 0 }
          : { bottom: vr.height > 0 ? Math.max(0, vr.bottom - dr.top) / vr.height : 0, left: 0 },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(v)
    observer.observe(d)
    // The strip comes and goes with the drawer; re-measure when the dock's contents change.
    const mutations = new MutationObserver(measure)
    mutations.observe(d, { childList: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [viewer, dock, active])
  return active ? insets : NO_INSETS
}

const NO_INSETS = { bottom: 0, left: 0 }

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
      // Typing in a text field keeps its own undo; sliders and buttons don't.
      const t = e.target
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['range', 'checkbox', 'button'].includes(t.type))) return
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
      } else if (selectedId && !cropDraft && !lasso && !mod && !(t instanceof HTMLInputElement) && nudge(e, selectedId)) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

let nudgeCommit: ReturnType<typeof setTimeout> | undefined

/**
 * Keyboard nudges for the selected layer: arrows move (Shift = 10×), [ ] rotate, - = scale.
 * Shown live; a burst of presses is committed as one undo step once they pause.
 */
function nudge(e: KeyboardEvent, layerId: string) {
  const step = e.shiftKey ? 20 : 2
  const moves: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }
  const key = e.key.toLowerCase()
  const st = useDesignStore.getState()
  const layer = layersWithDraft(st.design.layers, st.layerDraft).find((l) => l.id === layerId)
  if (!layer) return false
  const keep = st.layerDraft?.layerId === layerId ? st.layerDraft.patch : {}
  let patch
  if (moves[key]) patch = { x: layer.x + moves[key][0], y: layer.y + moves[key][1] }
  else if (key === '[' || key === ']') patch = { rotation: layer.rotation + (key === ']' ? 1 : -1) * (e.shiftKey ? 15 : 3) }
  else if (key === '-' || key === '=' || key === '+') patch = transformPatch(layer, key === '-' ? 0.96 : 1.04, layer.rotation)
  else return false
  st.setLayerDraft(layerId, { ...keep, ...patch })
  clearTimeout(nudgeCommit)
  nudgeCommit = setTimeout(() => useDesignStore.getState().commitLayerDraft(), 500)
  return true
}

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { DESIGN_UNITS_PER_INCH, PRODUCTS, designSize, getProduct, type ProductSpec } from './config/products'
import { log } from './debug/log'
import { PrintCanvas } from './editor/PrintCanvas'
import { loadImageSize } from './editor/useHtmlImage'
import { Scene } from './scene/Scene'
import { useDesignStore, type PhotoLayer } from './store/designStore'

export default function App() {
  const view = useDesignStore((s) => s.view)
  const spec = getProduct(useDesignStore((s) => s.productId))
  const backToShop = useDesignStore((s) => s.backToShop)
  const [ready, setReady] = useState(false)
  const viewerRef = useRef<HTMLElement>(null)
  const shopRef = useRef<HTMLElement>(null)
  const shopInset = useCoveredFraction(viewerRef, shopRef, view === 'shop')

  useUndoShortcuts()

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

      <main className="app__main">
        <section ref={viewerRef} className="app__viewer">
          <Scene onReady={() => setReady(true)} bottomInset={view === 'shop' ? shopInset : 0} />
          <p className="app__hint">{view === 'shop' ? 'Tap something to make it yours' : 'Drag to turn it'}</p>
        </section>

        {view === 'shop' ? <ShopSheet ref={shopRef} /> : <Editor key={spec.id} spec={spec} />}
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

function Editor({ spec }: { spec: ProductSpec }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const photo = useDesignStore((s) => s.design.photo)
  const canUndo = useDesignStore((s) => s.past.length > 0)
  const canRedo = useDesignStore((s) => s.future.length > 0)
  const cropping = useDesignStore((s) => s.cropDraft !== null)
  const { setPhoto, updatePhoto, undo, redo, startCrop, applyCrop, cancelCrop } = useDesignStore.getState()

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Blob URLs are kept for the session: undo can bring back a replaced photo.
    const src = URL.createObjectURL(file)
    try {
      const size = await loadImageSize(src)
      const next: PhotoLayer = {
        id: crypto.randomUUID(),
        src,
        naturalWidth: size.width,
        naturalHeight: size.height,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        ...fitToPrintArea(spec, size),
        rotation: 0,
      }
      log.info('upload', `${file.name} ${size.width}x${size.height}, ${Math.round(file.size / 1024)} KB`, {
        product: spec.id,
        type: file.type,
        effectiveDpi: effectiveDpi(next),
      })
      setPhoto(next)
    } catch (err) {
      URL.revokeObjectURL(src)
      log.error('upload', `could not decode ${file.name}`, err)
      alert("That file couldn't be opened as an image.")
    }
  }

  const recenter = () => {
    const { width, height } = designSize(spec)
    updatePhoto({ x: width / 2, y: height / 2, rotation: 0 })
  }

  return (
    <section className="app__editor">
      {cropping ? (
        <div className="toolbar">
          <button className="btn btn--primary" onClick={applyCrop}>
            Done
          </button>
          <button className="btn" onClick={cancelCrop}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="toolbar">
          <button className="btn btn--primary" onClick={() => fileInput.current?.click()}>
            {photo ? 'Change photo' : 'Upload pet photo'}
          </button>
          <button className="btn" onClick={startCrop} disabled={!photo}>
            Crop
          </button>
          <button className="btn" onClick={recenter} disabled={!photo}>
            Center
          </button>
          <button className="btn" onClick={() => setPhoto(null)} disabled={!photo}>
            Remove
          </button>
          <span className="toolbar__history">
            <button className="btn btn--icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className="btn btn--icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
          </span>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
        </div>
      )}

      <PrintCanvas spec={spec} />

      <p className="app__note">
        {cropping
          ? 'Drag the box or its handles to choose what to keep.'
          : photo
            ? 'Drag to move. Pull the corners to resize, the top handle to rotate.'
            : 'Your photo appears here and on the product. The dashed line is the safe print area.'}
      </p>
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

/** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Esc cancels a crop. Editor only. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { view, undo, redo, cancelCrop, cropDraft } = useDesignStore.getState()
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Fit the photo to 90% of the print height, centered (the wrap's center faces front). */
function fitToPrintArea(spec: ProductSpec, size: { width: number; height: number }) {
  const design = designSize(spec)
  const height = design.height * 0.9
  const width = Math.min((size.width / size.height) * height, design.width * 0.9)
  return {
    x: design.width / 2,
    y: design.height / 2,
    width,
    height: width * (size.height / size.width),
  }
}

/** Source pixels per printed inch at the photo's current size. */
function effectiveDpi(p: PhotoLayer) {
  return Math.round((p.naturalWidth * p.crop.width) / (p.width / DESIGN_UNITS_PER_INCH))
}

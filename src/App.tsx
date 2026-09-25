import { useEffect, useRef, type ChangeEvent } from 'react'
import { DESIGN_UNITS_PER_INCH, MUG_11OZ, designSize } from './config/products'
import { log } from './debug/log'
import { PrintCanvas } from './editor/PrintCanvas'
import { loadImageSize } from './editor/useHtmlImage'
import { Scene } from './scene/Scene'
import { useDesignStore, type PhotoLayer } from './store/designStore'

const spec = MUG_11OZ

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const photo = useDesignStore((s) => s.design.photo)
  const canUndo = useDesignStore((s) => s.past.length > 0)
  const canRedo = useDesignStore((s) => s.future.length > 0)
  const cropping = useDesignStore((s) => s.cropDraft !== null)
  const { setPhoto, updatePhoto, undo, redo, startCrop, applyCrop, cancelCrop } = useDesignStore.getState()

  useUndoShortcuts()

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
        ...fitToPrintArea(size),
        rotation: 0,
      }
      log.info('upload', `${file.name} ${size.width}x${size.height}, ${Math.round(file.size / 1024)} KB`, {
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
    <div className="app">
      <header className="app__header">
        <h1>Pawp Atelier</h1>
        <span className="app__product">{spec.name}</span>
      </header>

      <main className="app__main">
        <section className="app__viewer">
          <Scene spec={spec} />
          <p className="app__hint">Drag to turn the mug</p>
        </section>

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
              <span className="toolbar__spacer" />
              <button className="btn btn--icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
                ↶
              </button>
              <button className="btn btn--icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                ↷
              </button>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
            </div>
          )}

          <PrintCanvas spec={spec} />

          <p className="app__note">
            {cropping
              ? 'Drag the box or its handles to choose what to keep.'
              : photo
                ? 'Drag to move. Pull the corners to resize, the top handle to rotate.'
                : 'Your photo appears here and on the mug. The dashed line is the safe print area.'}
          </p>
        </section>
      </main>
    </div>
  )
}

/** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Esc cancels a crop. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { undo, redo, cancelCrop, cropDraft } = useDesignStore.getState()
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
function fitToPrintArea(size: { width: number; height: number }) {
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

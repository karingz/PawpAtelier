import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { DESIGN_UNITS_PER_INCH, designSize, type ProductSpec } from '../config/products'
import { FONTS } from '../content/fonts'
import { PALETTES, PATTERNS, SOLID_COLORS, getPalette, patternSwatch } from '../content/patterns'
import { STICKERS, STICKER_CATEGORIES } from '../content/stickers'
import { log } from '../debug/log'
import { selectedLayer, useDesignStore, type PhotoLayer, type TextLayer } from '../store/designStore'
import { removeBackground, restoreBackground, useCutoutJobs } from './cutout/removeBackground'
import { PrintCanvas } from './PrintCanvas'
import { loadImageSize } from './useHtmlImage'

type Tab = 'photo' | 'stickers' | 'text' | 'background'

const TABS: { id: Tab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'text', label: 'Text' },
  { id: 'background', label: 'Background' },
]

const TEXT_COLORS = ['#3b2f2f', '#ffffff', '#d9607f', '#f2c14e', '#7cc9a9', '#7aa7e8', '#a58be0', '#2b2b2b']
const OUTLINES: { label: string; color: string | null }[] = [
  { label: 'None', color: null },
  { label: 'White', color: '#ffffff' },
  { label: 'Dark', color: '#3b2f2f' },
]

export function Editor({ spec }: { spec: ProductSpec }) {
  const [tab, setTab] = useState<Tab>('photo')
  const selected = useDesignStore(selectedLayer)
  const cropping = useDesignStore((s) => s.cropDraft !== null)

  // Selecting text on the canvas opens its settings.
  const [seenSelection, setSeenSelection] = useState(selected?.id)
  if (selected?.id !== seenSelection) {
    setSeenSelection(selected?.id)
    if (selected?.kind === 'text') setTab('text')
  }

  return (
    <section className="app__editor">
      {cropping ? <CropBar /> : <LayerBar spec={spec} />}

      <PrintCanvas spec={spec} />

      {!cropping && (
        <>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tabs__tab${tab === t.id ? ' tabs__tab--active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="panel">
            {tab === 'photo' && <PhotoPanel spec={spec} />}
            {tab === 'stickers' && <StickerPanel spec={spec} />}
            {tab === 'text' && <TextPanel spec={spec} />}
            {tab === 'background' && <BackgroundPanel />}
          </div>
        </>
      )}
    </section>
  )
}

/** Actions for the selected layer, plus undo/redo. */
function LayerBar({ spec }: { spec: ProductSpec }) {
  const selected = useDesignStore(selectedLayer)
  const layers = useDesignStore((s) => s.design.layers)
  const canUndo = useDesignStore((s) => s.past.length > 0)
  const canRedo = useDesignStore((s) => s.future.length > 0)
  const { undo, redo, startCrop, moveLayer, removeLayer, updateLayer } = useDesignStore.getState()
  const index = selected ? layers.indexOf(selected) : -1

  const center = () => {
    if (!selected) return
    const { width, height } = designSize(spec)
    updateLayer(selected.id, { x: width / 2, y: height / 2, rotation: 0 })
  }

  return (
    <div className="toolbar">
      {selected ? (
        <>
          <span className="toolbar__label">{selected.kind === 'photo' ? 'Photo' : selected.kind === 'sticker' ? 'Sticker' : 'Text'}</span>
          {selected.kind === 'photo' && (
            <>
              <CutoutButton photo={selected} />
              <button className="btn btn--small" onClick={startCrop}>
                Crop
              </button>
            </>
          )}
          <button className="btn btn--small" onClick={center}>
            Center
          </button>
          <button className="btn btn--small" onClick={() => moveLayer(selected.id, 1)} disabled={index === layers.length - 1} title="Bring forward">
            Forward
          </button>
          <button className="btn btn--small" onClick={() => moveLayer(selected.id, -1)} disabled={index === 0} title="Send backward">
            Back
          </button>
          <button className="btn btn--small btn--danger" onClick={() => removeLayer(selected.id)} title="Delete (Del)">
            Delete
          </button>
        </>
      ) : (
        <span className="toolbar__hint">Tap something on the canvas to edit it</span>
      )}
      <span className="toolbar__history">
        <button className="btn btn--icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button className="btn btn--icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
      </span>
    </div>
  )
}

/** One-click background removal (누끼), or restore the original photo. */
function CutoutButton({ photo }: { photo: PhotoLayer }) {
  const job = useCutoutJobs((s) => s.jobs[photo.id])
  if (job) {
    const label = job.phase === 'download' ? `Getting AI ready ${Math.round(job.percent)}%` : 'Removing background…'
    return (
      <button className="btn btn--small btn--busy" disabled>
        {label}
      </button>
    )
  }
  if (photo.originalSrc) {
    return (
      <button className="btn btn--small" onClick={() => restoreBackground(photo)}>
        Restore BG
      </button>
    )
  }
  return (
    <button className="btn btn--small btn--magic" onClick={() => removeBackground(photo)} title="Cut your pet out of the photo">
      ✨ Remove BG
    </button>
  )
}

function CropBar() {
  const { applyCrop, cancelCrop } = useDesignStore.getState()
  return (
    <div className="toolbar">
      <span className="toolbar__label">Crop: drag the box or its handles</span>
      <span className="toolbar__history">
        <button className="btn btn--primary btn--small" onClick={applyCrop}>
          Done
        </button>
        <button className="btn btn--small" onClick={cancelCrop}>
          Cancel
        </button>
      </span>
    </div>
  )
}

function PhotoPanel({ spec }: { spec: ProductSpec }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const addLayer = useDesignStore((s) => s.addLayer)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Blob URLs are kept for the session: undo can bring back a removed photo.
    const src = URL.createObjectURL(file)
    try {
      const size = await loadImageSize(src)
      const photo: PhotoLayer = {
        id: crypto.randomUUID(),
        kind: 'photo',
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
        effectiveDpi: effectiveDpi(photo),
      })
      addLayer(photo)
    } catch (err) {
      URL.revokeObjectURL(src)
      log.error('upload', `could not decode ${file.name}`, err)
      alert("That file couldn't be opened as an image.")
    }
  }

  return (
    <div className="panel__body">
      <button className="btn btn--primary" onClick={() => fileInput.current?.click()}>
        Add pet photo
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
      <p className="app__note">
        Drag to move, pull the corners to resize, the top handle to rotate. The dashed line is the safe print area.
      </p>
    </div>
  )
}

function StickerPanel({ spec }: { spec: ProductSpec }) {
  const [category, setCategory] = useState<string>(STICKER_CATEGORIES[0].id)
  const addLayer = useDesignStore((s) => s.addLayer)
  const count = useDesignStore((s) => s.design.layers.length)

  const add = (sticker: (typeof STICKERS)[number]) => {
    const { width, height } = designSize(spec)
    const size = height * 0.32
    // Nudge each new sticker so repeated taps don't stack exactly.
    const nudge = ((count % 5) - 2) * size * 0.35
    addLayer({
      id: crypto.randomUUID(),
      kind: 'sticker',
      stickerId: sticker.id,
      src: sticker.src,
      x: width / 2 + nudge,
      y: height / 2 - nudge * 0.3,
      width: size,
      height: size,
      rotation: 0,
    })
  }

  return (
    <div className="panel__body">
      <div className="chips">
        {STICKER_CATEGORIES.map((c) => (
          <button key={c.id} className={`chip${category === c.id ? ' chip--active' : ''}`} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="sticker-grid">
        {STICKERS.filter((s) => s.category === category).map((s) => (
          <button key={s.id} className="sticker-grid__item" onClick={() => add(s)} title={s.name} aria-label={`Add ${s.name}`}>
            <img src={s.src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

function TextPanel({ spec }: { spec: ProductSpec }) {
  const selected = useDesignStore(selectedLayer)
  const { addLayer, updateLayer } = useDesignStore.getState()
  const text = selected?.kind === 'text' ? selected : null

  const add = () => {
    const { width, height } = designSize(spec)
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      kind: 'text',
      text: 'My best friend',
      fontId: 'fredoka',
      fontSize: height * 0.16,
      fill: '#3b2f2f',
      outline: '#ffffff',
      x: width / 2,
      y: height * 0.78,
      rotation: 0,
    }
    addLayer(layer)
  }

  return (
    <div className="panel__body">
      <button className="btn btn--primary" onClick={add}>
        Add text
      </button>
      {text && <TextSettings key={text.id} layer={text} onChange={(patch) => updateLayer(text.id, patch)} />}
    </div>
  )
}

function TextSettings({ layer, onChange }: { layer: TextLayer; onChange: (patch: Partial<TextLayer>) => void }) {
  // Type freely; commit to history when typing pauses so each keystroke isn't an undo step.
  const [draft, setDraft] = useState(layer.text)
  const committed = useRef(layer.text)
  const commitText = (text: string) => {
    if (text === committed.current) return
    committed.current = text
    onChange({ text })
  }
  useEffect(() => {
    const t = setTimeout(() => commitText(draft), 300)
    return () => clearTimeout(t)
  })
  // Undo/redo changed the text underneath us: show it.
  useEffect(() => {
    if (layer.text === committed.current) return
    committed.current = layer.text
    setDraft(layer.text)
  }, [layer.text])

  return (
    <div className="text-settings">
      <textarea
        className="text-settings__input"
        value={draft}
        rows={2}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitText(draft)}
        aria-label="Text"
      />
      <div className="font-list">
        {FONTS.map((f) => (
          <button
            key={f.id}
            className={`font-list__item${layer.fontId === f.id ? ' font-list__item--active' : ''}`}
            style={{ fontFamily: f.family, fontSize: `${1.05 * (f.previewScale ?? 1)}rem` }}
            onClick={() => onChange({ fontId: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="swatches" aria-label="Text color">
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${layer.fill === c ? ' swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange({ fill: c })}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="chips" aria-label="Outline">
        {OUTLINES.map((o) => (
          <button
            key={o.label}
            className={`chip${layer.outline === o.color ? ' chip--active' : ''}`}
            onClick={() => onChange({ outline: o.color })}
          >
            {o.label} outline
          </button>
        ))}
      </div>
    </div>
  )
}

function BackgroundPanel() {
  const background = useDesignStore((s) => s.design.background)
  const setBackground = useDesignStore((s) => s.setBackground)
  const paletteId = background.kind === 'pattern' ? background.paletteId : PALETTES[0].id
  const scale = background.kind === 'pattern' ? background.scale : 1
  const palette = getPalette(paletteId)

  return (
    <div className="panel__body">
      <h3 className="panel__title">Patterns</h3>
      <div className="pattern-grid">
        <button
          className={`pattern-grid__item${background.kind === 'none' ? ' pattern-grid__item--active' : ''}`}
          onClick={() => setBackground({ kind: 'none' })}
        >
          <span className="pattern-grid__swatch pattern-grid__swatch--plain" />
          Plain
        </button>
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            className={`pattern-grid__item${background.kind === 'pattern' && background.pattern === p.id ? ' pattern-grid__item--active' : ''}`}
            onClick={() => setBackground({ kind: 'pattern', pattern: p.id, paletteId, scale })}
          >
            <span className="pattern-grid__swatch" style={{ background: patternSwatch(p.id, palette) }} />
            {p.label}
          </button>
        ))}
      </div>

      {background.kind === 'pattern' && (
        <>
          <h3 className="panel__title">Colors</h3>
          <div className="swatches">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                className={`swatch swatch--duo${paletteId === p.id ? ' swatch--active' : ''}`}
                style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.fg} 50%)` }}
                onClick={() => setBackground({ ...background, paletteId: p.id })}
                title={p.label}
                aria-label={p.label}
              />
            ))}
          </div>
          {background.pattern !== 'gradient' && (
            <div className="chips">
              {[
                { label: 'Small', value: 0.6 },
                { label: 'Medium', value: 1 },
                { label: 'Large', value: 1.6 },
              ].map((s) => (
                <button
                  key={s.label}
                  className={`chip${scale === s.value ? ' chip--active' : ''}`}
                  onClick={() => setBackground({ ...background, scale: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <h3 className="panel__title">Solid</h3>
      <div className="swatches">
        {SOLID_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${background.kind === 'solid' && background.color === c ? ' swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => setBackground({ kind: 'solid', color: c })}
            aria-label={`Solid ${c}`}
          />
        ))}
      </div>
    </div>
  )
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

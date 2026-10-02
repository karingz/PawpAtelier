import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { designSize, type ProductSpec } from '../config/products'
import { FONTS } from '../content/fonts'
import { PALETTES, PATTERNS, SOLID_COLORS, getPalette, patternSwatch } from '../content/patterns'
import { SAMPLES, type SampleDef } from '../content/samples'
import { STICKERS, STICKER_CATEGORIES } from '../content/stickers'
import { log } from '../debug/log'
import { selectedLayer, useDesignStore, type PhotoLayer, type TextLayer } from '../store/designStore'
import { applyLasso, removeBackground, resetLassoPreview, restoreBackground, useCutoutJobs, useLassoPreview } from './cutout/removeBackground'
import { dateOptions, formatTakenAt, placeOptions, printQuality, readPhotoMeta, type PhotoMeta } from './photoMeta'
import { ADJUSTMENTS, EFFECTS, isDefaultLook, withDefaults, type PhotoLook } from './look/look'
import { renderLook } from './look/renderLook'
import { PrintCanvas } from './PrintCanvas'
import type { Tab } from '../store/uiStore'
import { tabsFor } from './tabs'
import { OptionsPanel } from './OptionsPanel'
import { SurprisePanel } from './SurprisePanel'
import { loadImageSize } from './useHtmlImage'

/** The content for one category, used by the flat editor's tabs and the 3D view's drawer. */
export function TabPanel({ tab, spec }: { tab: Tab; spec: ProductSpec }) {
  return (
    <>
      {tab === 'options' && <OptionsPanel spec={spec} />}
      {tab === 'photo' && <PhotoPanel spec={spec} />}
      {tab === 'effects' && <EffectsPanel />}
      {tab === 'stickers' && <StickerPanel spec={spec} />}
      {tab === 'text' && <TextPanel spec={spec} />}
      {tab === 'background' && <BackgroundPanel />}
      {tab === 'surprise' && <SurprisePanel spec={spec} />}
    </>
  )
}

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
  const lassoing = useDesignStore((s) => s.lasso !== null)
  const toolMode = cropping || lassoing

  // Selecting text on the canvas opens its settings.
  const [seenSelection, setSeenSelection] = useState(selected?.id)
  if (selected?.id !== seenSelection) {
    setSeenSelection(selected?.id)
    if (selected?.kind === 'text') setTab('text')
  }

  return (
    <section className="app__editor">
      {cropping ? <CropBar /> : lassoing ? <LassoBar /> : <LayerBar spec={spec} />}

      <PrintCanvas spec={spec} />

      {!toolMode && (
        <>
          <nav className="tabs" role="tablist">
            {tabsFor(spec).map((t) => (
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
            <TabPanel tab={tab} spec={spec} />
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
  const { undo, redo, startCrop, startLasso, moveLayer, removeLayer, updateLayer } = useDesignStore.getState()
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
              <button className="btn btn--small" onClick={startLasso} title="Circle your pet or tap to fix the cutout">
                Lasso
              </button>
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
export function CutoutButton({ photo }: { photo: PhotoLayer }) {
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

/** Lasso mode: include/exclude taps, clear, apply. */
export function LassoBar() {
  const lasso = useDesignStore((s) => s.lasso)!
  const photo = useDesignStore((s) => s.design.layers.find((l) => l.id === s.lasso?.layerId))
  const { updateLasso, endLasso } = useDesignStore.getState()
  const busy = useLassoPreview((s) => s.busy)
  const job = useCutoutJobs((s) => (photo ? s.jobs[photo.id] : undefined))
  const hasPrompt = !!lasso.lasso || lasso.taps.length > 0

  const status = job
    ? job.phase === 'download'
      ? `Getting AI ready ${Math.round(job.percent)}%`
      : 'Cutting out…'
    : busy
      ? busy.phase === 'download'
        ? `Getting AI ready ${Math.round(busy.percent)}%`
        : 'Thinking…'
      : hasPrompt
        ? 'Bright = kept. Tap to fix bits.'
        : 'Draw a loop around your pet'

  const cancel = () => {
    endLasso()
    resetLassoPreview()
  }

  return (
    <div className="toolbar">
      <span className={`toolbar__label${busy || job ? ' toolbar__label--busy' : ''}`}>{status}</span>
      <span className="chips">
        <button className={`chip${lasso.mode === 'include' ? ' chip--active' : ''}`} onClick={() => updateLasso({ mode: 'include' })}>
          + Keep
        </button>
        <button className={`chip${lasso.mode === 'exclude' ? ' chip--active' : ''}`} onClick={() => updateLasso({ mode: 'exclude' })}>
          − Remove
        </button>
      </span>
      <span className="toolbar__history">
        <button className="btn btn--small" onClick={() => updateLasso({ lasso: null, taps: [] })} disabled={!hasPrompt || !!job}>
          Clear
        </button>
        <button
          className="btn btn--primary btn--small"
          onClick={() => photo?.kind === 'photo' && applyLasso(photo, { lasso: lasso.lasso, taps: lasso.taps })}
          disabled={!hasPrompt || !!job}
        >
          Apply
        </button>
        <button className="btn btn--small" onClick={cancel} disabled={!!job}>
          Cancel
        </button>
      </span>
    </div>
  )
}

export function CropBar() {
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

  const selected = useDesignStore(selectedLayer)

  /** Place a photo (uploaded blob URL or a sample) centered on the print area. */
  const addPhoto = async (src: string, name: string, meta: PhotoMeta, extra: Record<string, unknown> = {}) => {
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
      meta,
    }
    log.info('upload', `${name} ${size.width}x${size.height}`, {
      product: spec.id,
      dpi: printQuality(photo).dpi,
      taken: meta.takenAt ?? 'unknown',
      gps: meta.lat !== undefined,
      ...extra,
    })
    addLayer(photo)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Blob URLs are kept for the session: undo can bring back a removed photo.
    const src = URL.createObjectURL(file)
    try {
      const meta = await readPhotoMeta(file)
      await addPhoto(src, file.name, meta, { type: file.type, kb: Math.round(file.size / 1024) })
    } catch (err) {
      URL.revokeObjectURL(src)
      log.error('upload', `could not decode ${file.name}`, err)
      alert("That file couldn't be opened as an image.")
    }
  }

  const addSample = (sample: SampleDef) =>
    addPhoto(sample.src, `sample:${sample.id}`, sample.meta ?? {}, { tags: sample.tags }).catch((err) =>
      log.error('upload', `sample ${sample.id} failed`, err),
    )

  return (
    <div className="panel__body">
      <button className="btn btn--primary" onClick={() => fileInput.current?.click()}>
        Add pet photo
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
      <p className="app__note">
        Drag to move, pull the corners to resize, the top handle to rotate. The dashed line is the safe print area.
      </p>
      {selected?.kind === 'photo' && <PhotoInfo key={selected.id} photo={selected} spec={spec} />}
      <h3 className="panel__title">No photo handy? Borrow Leah, our shop dog 🐾</h3>
      <SampleGrid samples={SAMPLES.filter((x) => x.collection === 'leah')} onPick={addSample} />
      <h3 className="panel__title">…or one of her friends</h3>
      <SampleGrid samples={SAMPLES.filter((x) => x.collection !== 'leah')} onPick={addSample} />
    </div>
  )
}

/** When/where the photo was taken (as one-tap text) and whether it will print sharply. */
function PhotoInfo({ photo, spec }: { photo: PhotoLayer; spec: ProductSpec }) {
  const addLayer = useDesignStore((s) => s.addLayer)
  const meta = photo.meta ?? {}
  const quality = printQuality(photo)
  const dates = dateOptions(meta)
  const taken = formatTakenAt(meta)
  const hasGps = meta.lat !== undefined && meta.lon !== undefined
  const [places, setPlaces] = useState<string[] | 'loading' | 'error' | null>(null)

  const lookUp = () => {
    setPlaces('loading')
    placeOptions(meta.lat!, meta.lon!).then(setPlaces, (err) => {
      log.warn('meta', 'place lookup failed', err)
      setPlaces('error')
    })
  }

  const addText = (text: string) => addLayer(newTextLayer(spec, { text, fontSize: designSize(spec).height * 0.11 }))

  return (
    <div className="photo-info">
      <h3 className="panel__title">About this photo</h3>
      <div className={`photo-info__row photo-info__quality photo-info__quality--${quality.level}`}>
        <span aria-hidden>🖨</span>
        <span>
          Print quality: <b>{quality.label}</b> <span className="photo-info__muted">({quality.dpi} DPI at this size)</span>
        </span>
      </div>

      {taken ? (
        <>
          <div className="photo-info__row">
            <span aria-hidden>📅</span>
            <span>Taken {taken}</span>
          </div>
          <OptionChips options={dates} onPick={addText} />
        </>
      ) : (
        <div className="photo-info__row photo-info__muted">
          <span aria-hidden>📅</span>
          <span>No date in this photo</span>
        </div>
      )}

      {hasGps ? (
        <>
          <div className="photo-info__row">
            <span aria-hidden>📍</span>
            {places === null && (
              <button className="btn btn--small" onClick={lookUp}>
                Show where it was taken
              </button>
            )}
            {places === 'loading' && <span className="photo-info__muted">Finding the place…</span>}
            {places === 'error' && (
              <span>
                Couldn't find the place.{' '}
                <button className="btn btn--small" onClick={lookUp}>
                  Retry
                </button>
              </span>
            )}
            {Array.isArray(places) && <span>{places.length ? 'Taken near' : 'No place name found'}</span>}
          </div>
          {Array.isArray(places) && <OptionChips options={places} onPick={addText} />}
          {places === null && <p className="photo-info__fine">Looks up the photo's location on OpenStreetMap.</p>}
          {Array.isArray(places) && places.length > 0 && <p className="photo-info__fine">Place data © OpenStreetMap contributors</p>}
        </>
      ) : (
        <div className="photo-info__row photo-info__muted">
          <span aria-hidden>📍</span>
          <span>No location in this photo</span>
        </div>
      )}
    </div>
  )
}

/** Tap a suggestion to add it to the design as text. */
function OptionChips({ options, onPick }: { options: string[]; onPick: (text: string) => void }) {
  if (!options.length) return null
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} className="chip chip--add" onClick={() => onPick(o)} title="Add to design as text">
          + {o}
        </button>
      ))}
    </div>
  )
}

/** Filters and effects for the selected photo. */
function EffectsPanel() {
  const selected = useDesignStore(selectedLayer)
  // Select the (stable) layer list and filter here: a selector returning a new array each time
  // makes zustand re-render forever.
  const layers = useDesignStore((s) => s.design.layers)
  const photos = layers.filter((l): l is PhotoLayer => l.kind === 'photo')
  const select = useDesignStore((s) => s.select)
  const photo = selected?.kind === 'photo' ? selected : null

  if (!photo) {
    return (
      <div className="panel__body">
        <p className="app__note">
          {photos.length ? 'Tap a photo on the canvas to give it a look.' : 'Add a photo first, then give it a look here.'}
        </p>
        {photos.length === 1 && (
          <button className="btn btn--small" onClick={() => select(photos[0].id)}>
            Select my photo
          </button>
        )}
      </div>
    )
  }
  return <LookEditor key={photo.id} photo={photo} />
}

function LookEditor({ photo }: { photo: PhotoLayer }) {
  const draft = useDesignStore((s) => (s.lookDraft?.layerId === photo.id ? s.lookDraft.look : null))
  const { setLookDraft, commitLookDraft, updateLayer } = useDesignStore.getState()
  const look = withDefaults(draft ?? photo.look)

  const slide = (key: keyof PhotoLook, value: number) => setLookDraft(photo.id, { ...look, [key]: value })
  const set = (patch: Partial<PhotoLook>) => updateLayer(photo.id, { look: { ...look, ...patch } })
  // A drag commits as one undo step when released; keyboard nudges commit once they pause.
  const endProps = { onPointerUp: commitLookDraft, onBlur: commitLookDraft, onTouchEnd: commitLookDraft }
  useEffect(() => {
    if (!draft) return
    const t = setTimeout(commitLookDraft, 600)
    return () => clearTimeout(t)
  }, [draft, commitLookDraft])

  return (
    <div className="panel__body look">
      <h3 className="panel__title">Effects</h3>
      <div className="effect-grid">
        {EFFECTS.map((e) => (
          <button
            key={e.id}
            className={`effect-grid__item${look.effect === e.id ? ' effect-grid__item--active' : ''}`}
            onClick={() => set({ effect: e.id })}
          >
            <EffectThumb src={photo.src} look={{ ...look, effect: e.id }} />
            <span>{e.label}</span>
          </button>
        ))}
      </div>
      {look.effect !== 'none' && (
        <label className="slider">
          <span className="slider__label">Strength</span>
          <input type="range" min={0} max={100} value={look.strength} onChange={(e) => slide('strength', +e.target.value)} {...endProps} />
          <span className="slider__value">{look.strength}</span>
        </label>
      )}

      <h3 className="panel__title">Adjust</h3>
      {ADJUSTMENTS.map((a) => (
        <label key={a.key} className="slider" onDoubleClick={() => set({ [a.key]: 0 })} title="Double-click to reset">
          <span className="slider__label">{a.label}</span>
          <input
            type="range"
            min={a.min}
            max={a.max}
            value={look[a.key] as number}
            onChange={(e) => slide(a.key, +e.target.value)}
            {...endProps}
          />
          <span className="slider__value">{look[a.key] as number}</span>
        </label>
      ))}
      <button className="btn btn--small" onClick={() => updateLayer(photo.id, { look: undefined })} disabled={isDefaultLook(photo.look)}>
        Reset all
      </button>
    </div>
  )
}

/** Small preview of an effect on the user's own photo. */
function EffectThumb({ src, look }: { src: string; look: Partial<PhotoLook> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const effect = look.effect
  useEffect(() => {
    let alive = true
    // Thumbnails show the effect only (with default strength), so they don't re-render per slider tick.
    renderLook(src, { effect }, 160).then(
      (bitmap) => {
        const c = ref.current
        if (!alive || !c) return
        c.width = bitmap.width
        c.height = bitmap.height
        c.getContext('2d')!.drawImage(bitmap, 0, 0)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [src, effect])
  return <canvas ref={ref} className="effect-grid__thumb" />
}

function SampleGrid({ samples, onPick }: { samples: SampleDef[]; onPick: (s: SampleDef) => void }) {
  return (
    <div className="sample-grid">
      {samples.map((sample) => (
        <button
          key={sample.id}
          className="sample-grid__item"
          onClick={() => onPick(sample)}
          title={import.meta.env.DEV ? `${sample.label}: tests ${sample.tags.join(', ')}` : sample.label}
          aria-label={`Use sample photo: ${sample.label}`}
        >
          <img src={sample.thumb} alt="" loading="lazy" />
        </button>
      ))}
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

  const add = () => addLayer(newTextLayer(spec))

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

/** A new text layer in the house style, low and centered on the print. */
function newTextLayer(spec: ProductSpec, overrides: Partial<TextLayer> = {}): TextLayer {
  const { width, height } = designSize(spec)
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    text: 'My best friend',
    fontId: 'fredoka',
    fontSize: height * 0.16,
    fill: '#3b2f2f',
    outline: '#ffffff',
    x: width / 2,
    y: height * 0.8,
    rotation: 0,
    ...overrides,
  }
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

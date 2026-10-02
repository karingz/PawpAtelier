import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { DESIGN_UNITS_PER_INCH, designSize, printBase, type ProductSpec } from '../config/products'
import { productOptions, useProductOptions } from '../store/optionsStore'
import { getFont, loadFontFor } from '../content/fonts'
import { getPalette, patternTile, TILE } from '../content/patterns'
import { printNodeName, registerPrintStage } from './layerGeometry'
import {
  layersWithDraft,
  selectedLayer,
  useDesignStore,
  type Background,
  type LassoState,
  type Layer,
  type PhotoLayer,
  type TextLayer,
} from '../store/designStore'
import { log } from '../debug/log'
import { clampBox, fullImageBox, visibleBox, type Box } from './crop'
import { requestLassoPreview, resetLassoPreview, useLassoPreview } from './cutout/removeBackground'
import { isDefaultLook, type PhotoLook } from './look/look'
import { FULL_SIDE, PREVIEW_SIDE, renderKey, renderLook } from './look/renderLook'
import { useImages } from './useHtmlImage'

const SAFE_INSET = 0.125 * DESIGN_UNITS_PER_INCH
const MIN_SIZE = 20
const ACCENT = '#d9607f'
/** Pattern tiles are rendered at this many pixels per design unit (texture is ~2.4). */
const PATTERN_DENSITY = 3
const MIN_ZOOM = 1
const MAX_ZOOM = 8
/** Pointer travel (px) that turns a press on empty canvas into a pan instead of a tap. */
const PAN_SLOP = 4

type Props = { spec: ProductSpec }

/** Zoom factor and pan offset (screen px) of the editing view; zoom 1 = whole print area. */
type View = { zoom: number; x: number; y: number }

/**
 * Flat print-area editor.
 *
 * Two stages render the same design: a visible one you edit (zoom/pan freely), and a hidden
 * fixed-size one at texture resolution that is shared with the 3D product. Keeping the print
 * separate means zooming the editor never zooms the print, and the texture never resizes.
 */
/**
 * What the print looks like right now: layers (with any in-progress drag), their decoded
 * images, rendered photo looks and loaded fonts. Shared by the print stage and the flat editor;
 * images and looks are cached, so using it twice doesn't double the work.
 */
function useRenderData(spec: ProductSpec) {
  const design = designSize(spec)
  const { background, layers: savedLayers } = useDesignStore((s) => s.design)
  const layerDraft = useDesignStore((s) => s.layerDraft)
  const layers = useMemo(() => layersWithDraft(savedLayers, layerDraft), [savedLayers, layerDraft])
  const cropDraft = useDesignStore((s) => s.cropDraft)
  const lasso = useDesignStore((s) => s.lasso)
  const selected = useDesignStore(selectedLayer)
  const srcs = useMemo(
    () => layers.flatMap((l) => (l.kind === 'text' ? [] : [lasso?.layerId === l.id && l.kind === 'photo' ? (l.originalSrc ?? l.src) : l.src])),
    [layers, lasso?.layerId],
  )
  const { images, complete: imagesReady } = useImages(srcs)
  const fontsVersion = useFontsVersion(layers)
  const lookDraft = useDesignStore((s) => s.lookDraft)
  const looks = useLookImages(layers, lookDraft, lasso?.layerId)
  const cropPhoto = cropDraft && selected?.kind === 'photo' && images.get(selected.src) ? selected : null
  const options = useProductOptions(spec)
  const base = useMemo(() => printBase(spec, options), [spec, options])
  return {
    content: { background, layers, design, spec, base, images, looks: looks.images, fontsVersion, lasso, cropPhoto, cropDraft },
    ready: imagesReady && looks.ready,
  }
}

/**
 * The print itself: a hidden, fixed-size stage at texture resolution that feeds the 3D product.
 * Always mounted while editing (whether or not the flat editor is on screen), so the product
 * updates from any kind of edit. Zooming the flat editor never touches it.
 */
export function PrintStage({ spec }: Props) {
  const { content, ready } = useRenderData(spec)
  const { design } = content
  const printLayerRef = useRef<Konva.Layer>(null)
  const printStageRef = useRef<Konva.Stage>(null)

  // The print is only worth publishing once every image (and every photo look) is ready.
  // Updated in a layout effect (synchronously on commit, before Konva's next animation-frame
  // draw) and, when it flips to ready, the print is redrawn explicitly: a draw that ran while
  // it wasn't ready skipped publishing, and nothing else may redraw it (the product would stay
  // stale until the next edit).
  const complete = useRef(false)
  useLayoutEffect(() => {
    const wasReady = complete.current
    complete.current = ready
    if (ready && !wasReady) printLayerRef.current?.batchDraw()
  })

  // Publish every finished print frame to the 3D product (a fixed-size copy that outlives
  // the editor, so the product keeps its print in the shop view).
  useEffect(() => {
    const layer = printLayerRef.current
    if (!layer) return
    registerPrintStage(spec.id, printStageRef.current)
    const texture = printTextureCanvas(spec)
    const ctx = texture.getContext('2d')!
    const { markPrintDirty } = useDesignStore.getState()
    // Render the hidden stage straight at texture resolution.
    layer.getCanvas().setPixelRatio(texture.width / design.width)
    log.debug('editor', `print stage ${layer.getCanvas()._canvas.width}x${layer.getCanvas()._canvas.height}`)

    const publish = () => {
      if (!complete.current) return
      ctx.clearRect(0, 0, texture.width, texture.height)
      ctx.drawImage(layer.getCanvas()._canvas, 0, 0, texture.width, texture.height)
      markPrintDirty(spec.id)
    }
    layer.on('draw', publish)
    layer.batchDraw()
    return () => {
      layer.off('draw', publish)
      registerPrintStage(spec.id, null)
    }
  }, [spec, design.width])

  return (
    <div className="print-stage" aria-hidden>
      <Stage ref={printStageRef} width={design.width} height={design.height} listening={false}>
        <KLayer ref={printLayerRef} listening={false}>
          <DesignContent {...content} />
        </KLayer>
      </Stage>
    </div>
  )
}

/** The flat 2D editor: zoom/pan freely, with handles, crop and lasso tools. */
export function PrintCanvas({ spec }: Props) {
  const { content } = useRenderData(spec)
  const { design, layers, images, fontsVersion, lasso, cropPhoto, cropDraft } = content
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const spaceHeld = useSpaceKey()

  const selectedId = useDesignStore((s) => s.selectedId)
  /** Crop or lasso: the canvas is a tool surface, layers can't be moved. */
  const editing = !!cropDraft || !!lasso
  const select = useDesignStore((s) => s.select)
  const updateLayer = useDesignStore((s) => s.updateLayer)
  const lassoPhoto = lasso ? layers.find((l): l is PhotoLayer => l.id === lasso.layerId && l.kind === 'photo') : undefined

  const baseScale = displayWidth / design.width
  const displayHeight = design.height * baseScale
  /** Screen px per design unit in the editing view. */
  const scale = baseScale * view.zoom

  // Track the container width so the stage stays responsive; keep the view's zoom and
  // relative pan when the panel is resized.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      setDisplayWidth((old) => {
        if (old && width !== old) setView((v) => ({ ...v, x: (v.x * width) / old, y: (v.y * width) / old }))
        return width
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Attach the transform handles to the selected layer (hidden while cropping / lassoing).
  useEffect(() => {
    const tr = transformerRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = !editing && selectedId ? stage.findOne(`#${selectedId}`) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [layers, selectedId, editing, images, fontsVersion, displayWidth])

  // ------------------------------------------------------------------------------------------
  // View: zoom around a point, pan, keep the print area on screen.

  const clampView = (v: View): View => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom))
    const w = design.width * baseScale * zoom
    const h = design.height * baseScale * zoom
    const clampAxis = (pos: number, content: number, frame: number) =>
      content <= frame ? (frame - content) / 2 : Math.min(0, Math.max(frame - content, pos))
    return { zoom, x: clampAxis(v.x, w, displayWidth), y: clampAxis(v.y, h, displayHeight) }
  }

  /** Zoom to `zoom`, keeping the design point under screen point `p` where it is. */
  const zoomAt = (p: { x: number; y: number }, zoom: number, from: View = view) => {
    const oldScale = baseScale * from.zoom
    const next = clampView({ ...from, zoom })
    const newScale = baseScale * next.zoom
    const wx = (p.x - from.x) / oldScale
    const wy = (p.y - from.y) / oldScale
    return clampView({ zoom: next.zoom, x: p.x - wx * newScale, y: p.y - wy * newScale })
  }

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const p = stageRef.current?.getPointerPosition()
    if (!p) return
    // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as big steps.
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015))
    setView((v) => zoomAt(p, v.zoom * factor, v))
  }

  const zoomBy = (factor: number) =>
    setView((v) => (factor === 0 ? clampView({ zoom: 1, x: 0, y: 0 }) : zoomAt({ x: displayWidth / 2, y: displayHeight / 2 }, v.zoom * factor, v)))

  /**
   * Pan: drag on empty canvas, or anywhere with Space held / the middle mouse button (for when
   * a zoomed-in photo fills the view). A plain tap on empty canvas deselects.
   */
  const onStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const empty = e.target === e.target.getStage() || e.target.name() === 'background'
    const panAnywhere = spaceHeld || e.evt.button === 1
    if ((!empty && !panAnywhere) || pinch.current) return
    if (e.evt.button === 1) e.evt.preventDefault()
    const start = { x: e.evt.clientX, y: e.evt.clientY, view }
    let moved = false
    const move = (ev: PointerEvent) => {
      if (pinch.current) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < PAN_SLOP) return
      moved = true
      setView(clampView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!moved && empty && !panAnywhere && !editing && !pinch.current) select(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Two-finger pinch zoom + pan (touch), on top of whatever Konva is doing.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)
  const viewRef = useRef(view)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const measure = () => {
      const [a, b] = [...pointers.current.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
    const down = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, local(e))
      if (pointers.current.size === 2) {
        // Second finger: whatever the first one was dragging stops; this is a pinch now.
        stageRef.current?.find((n: Konva.Node) => n.isDragging()).forEach((n) => n.stopDrag())
        pinch.current = { ...measure(), view: viewRef.current }
      }
    }
    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, local(e))
      const start = pinch.current
      if (!start || pointers.current.size < 2) return
      const now = measure()
      const zoomed = zoomAtRef.current(start.mid, start.view.zoom * (now.dist / Math.max(1, start.dist)), start.view)
      setView(clampRef.current({ ...zoomed, x: zoomed.x + now.mid.x - start.mid.x, y: zoomed.y + now.mid.y - start.mid.y }))
    }
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
    }
    el.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])
  // Latest view/zoom/clamp for the native listeners above (they're registered once).
  const zoomAtRef = useRef(zoomAt)
  const clampRef = useRef(clampView)
  useLayoutEffect(() => {
    viewRef.current = view
    zoomAtRef.current = zoomAt
    clampRef.current = clampView
  })

  /** Fold the node's gesture (drag / scale / rotate) back into the layer. */
  const commit = (layer: Layer) => (e: Konva.KonvaEventObject<Event>) => {
    const n = e.target
    const sx = n.scaleX()
    const sy = n.scaleY()
    n.scale({ x: 1, y: 1 })
    const placement = { x: n.x(), y: n.y(), rotation: n.rotation() }
    if (layer.kind === 'text') {
      updateLayer(layer.id, { ...placement, fontSize: Math.max(8, layer.fontSize * sx) })
    } else {
      updateLayer(layer.id, {
        ...placement,
        width: Math.max(MIN_SIZE, layer.width * sx),
        height: Math.max(MIN_SIZE, layer.height * sy),
      })
    }
  }

  const handlersFor = (layer: Layer): NodeHandlers => ({
    id: layer.id,
    // With Space held, dragging pans the view instead of moving things.
    draggable: !editing && !spaceHeld,
    listening: !editing,
    onPointerDown: () => select(layer.id),
    onDragEnd: commit(layer),
    onTransformEnd: commit(layer),
  })

  const stageReady = displayWidth > 0
  return (
    <div className="print-canvas">
      <div
        ref={containerRef}
        className={`print-canvas__stage${spaceHeld ? ' print-canvas__stage--pan' : ''}`}
        style={{ height: displayHeight || undefined }}
      >
        {stageReady && (
          <Stage
            ref={stageRef}
            width={displayWidth}
            height={displayHeight}
            scaleX={scale}
            scaleY={scale}
            x={view.x}
            y={view.y}
            onPointerDown={onStagePointerDown}
            onWheel={onWheel}
          >
            <KLayer>
              <DesignContent {...content} handlersFor={handlersFor} />
            </KLayer>
            <KLayer>
              <Rect
                x={SAFE_INSET}
                y={SAFE_INSET}
                width={design.width - SAFE_INSET * 2}
                height={design.height - SAFE_INSET * 2}
                stroke="#e0a3b4"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                dash={[6, 6]}
                listening={false}
              />
              <Line
                points={[design.width / 2, 0, design.width / 2, design.height]}
                stroke="#e0a3b4"
                strokeWidth={1}
                strokeScaleEnabled={false}
                dash={[2, 6]}
                opacity={0.6}
                listening={false}
              />
              <Transformer
                ref={transformerRef}
                rotateEnabled
                keepRatio
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                anchorSize={14}
                anchorCornerRadius={7}
                anchorStroke={ACCENT}
                borderStroke={ACCENT}
                rotateAnchorOffset={24}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < MIN_SIZE * scale || Math.abs(newBox.height) < MIN_SIZE * scale
                    ? oldBox
                    : newBox
                }
              />
              {cropPhoto && cropDraft && (
                <CropEditor photo={cropPhoto} image={images.get(cropPhoto.src)!} draft={cropDraft} />
              )}
              {lasso && lassoPhoto && <LassoOverlay photo={lassoPhoto} lasso={lasso} scale={scale} />}
            </KLayer>
          </Stage>
        )}
        {stageReady && (
          <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button className="zoom-controls__btn" onClick={() => zoomBy(1 / 1.5)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">
              −
            </button>
            <button
              className="zoom-controls__btn zoom-controls__level"
              onClick={() => zoomBy(0)}
              title="Fit the whole print area. Scroll or pinch to zoom; Space + drag (or middle mouse, or two fingers) to move around."
            >
              {view.zoom <= 1.001 ? 'Fit' : `${Math.round(view.zoom * 100)}%`}
            </button>
            <button className="zoom-controls__btn" onClick={() => zoomBy(1.5)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">
              +
            </button>
          </div>
        )}
      </div>
      {spec.kind === 'cylinder' && (
        <div className="print-canvas__labels">
          <span>← {spec.handle ? 'handle side' : 'back seam'}</span>
          <span>front</span>
          <span>{spec.handle ? 'handle side' : 'back seam'} →</span>
        </div>
      )}

    </div>
  )
}

type ContentProps = {
  background: Background
  layers: Layer[]
  design: { width: number; height: number }
  spec: ProductSpec
  /** The blank behind the print, and whether empty print areas stay see-through. */
  base: { color: string; transparent: boolean }
  images: Map<string, HTMLImageElement>
  /** Rendered looks (filters/effects) by photo layer id. */
  looks: Map<string, ImageBitmap>
  fontsVersion: number
  lasso: LassoState | null
  cropPhoto: PhotoLayer | null
  cropDraft: Box | null
  /** Interactive (editing view) only. */
  handlersFor?: (layer: Layer) => NodeHandlers
}

/** Background + layers, exactly as printed. Rendered by both the editing view and the print. */
function DesignContent({ background, layers, design, base, images, looks, fontsVersion, lasso, cropPhoto, cropDraft, handlersFor }: ContentProps) {
  return (
    <>
      {/* Editing view of a see-through print (tee, clear case): show the blank behind it. */}
      {handlersFor && base.transparent && <Rect width={design.width} height={design.height} fill={base.color} listening={false} />}
      <BackgroundNode background={background} width={design.width} height={design.height} baseColor={base.transparent ? null : base.color} />
      {layers.map((layer) => {
        if (cropPhoto && cropDraft && layer.id === cropPhoto.id) {
          // Live crop preview: the full image clipped to the draft box.
          return (
            <PhotoFrame key={layer.id} photo={cropPhoto} listening={false}>
              <Group clipX={cropDraft.x} clipY={cropDraft.y} clipWidth={cropDraft.width} clipHeight={cropDraft.height}>
                <FullImage photo={cropPhoto} image={images.get(cropPhoto.src)!} />
              </Group>
            </PhotoFrame>
          )
        }
        const handlers = { name: printNodeName(layer.id), ...handlersFor?.(layer) }
        if (layer.kind === 'text') {
          return <TextNode key={`${layer.id}:${fontsVersion}`} layer={layer} {...handlers} />
        }
        // In lasso mode the photo shows its original (uncut) image so you can see what to circle.
        const src = lasso?.layerId === layer.id && layer.kind === 'photo' ? (layer.originalSrc ?? layer.src) : layer.src
        const image = looks.get(layer.id) ?? images.get(src)
        if (!image) return null
        return (
          <KImage
            key={layer.id}
            {...handlers}
            image={image}
            crop={layer.kind === 'photo' ? sourceCrop(layer, image) : undefined}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            offsetX={layer.width / 2}
            offsetY={layer.height / 2}
            rotation={layer.rotation}
          />
        )
      })}
    </>
  )
}

/** True while the Space bar is held (and focus isn't in a text field): drag-to-pan mode. */
function useSpaceKey() {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return
      e.preventDefault() // don't scroll the page
      setHeld(true)
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setHeld(false)
    const blur = () => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return held
}

/** The product's fixed-size texture canvas, created on first use. */
function printTextureCanvas(spec: ProductSpec) {
  const { printCanvases, setPrintCanvas } = useDesignStore.getState()
  const existing = printCanvases[spec.id]
  if (existing) return existing
  const { width, height } = designSize(spec)
  const canvas = document.createElement('canvas')
  canvas.width = spec.previewTextureWidth
  canvas.height = Math.round((spec.previewTextureWidth * height) / width)
  const base = printBase(spec, productOptions(spec))
  if (!base.transparent) {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = base.color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  setPrintCanvas(spec.id, canvas)
  return canvas
}

/** The layer's crop in pixels of the image actually drawn (a look render may be smaller). */
function sourceCrop(p: PhotoLayer, image: HTMLImageElement | ImageBitmap) {
  const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width
  const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height
  return { x: p.crop.x * w, y: p.crop.y * h, width: p.crop.width * w, height: p.crop.height * h }
}

/**
 * Rendered looks for photo layers that have one. While a slider is dragged (the draft), that
 * layer renders at preview size; otherwise full size. Each layer keeps showing its last render
 * until the next is ready (no flash of the unfiltered photo), and only the newest wanted render
 * per layer is started, so fast slider drags don't queue up work.
 */
function useLookImages(layers: Layer[], draft: { layerId: string; look: Partial<PhotoLook> } | null, lassoLayerId?: string) {
  const [results, setResults] = useState<Record<string, { key: string; image: ImageBitmap }>>({})
  const running = useRef(new Map<string, string>())
  const wanted = useRef(new Map<string, { key: string; src: string; look: Partial<PhotoLook>; side: number }>())

  const needs = layers.flatMap((l) => {
    if (l.kind !== 'photo' || l.id === lassoLayerId) return []
    const isDraft = draft?.layerId === l.id
    const look = isDraft ? draft.look : l.look
    if (isDefaultLook(look)) return []
    const side = isDraft ? PREVIEW_SIDE : FULL_SIDE
    return [{ id: l.id, src: l.src, look: look!, side, key: renderKey(l.src, look!, side) }]
  })
  const needsKey = needs.map((n) => `${n.id}=${n.key}`).join(';')

  useEffect(() => {
    const start = (id: string) => {
      const job = wanted.current.get(id)
      if (!job || running.current.has(id)) return
      running.current.set(id, job.key)
      renderLook(job.src, job.look, job.side)
        .then((image) => setResults((r) => ({ ...r, [id]: { key: job.key, image } })))
        .catch((err) => log.error('look', 'render failed', err))
        .finally(() => {
          running.current.delete(id)
          if (wanted.current.get(id)?.key !== job.key) start(id)
          else wanted.current.delete(id)
        })
    }
    for (const n of needs) {
      if (results[n.id]?.key === n.key) continue
      wanted.current.set(n.id, n)
      start(n.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- needsKey captures `needs`
  }, [needsKey])

  const images = new Map<string, ImageBitmap>()
  for (const n of needs) {
    const r = results[n.id]
    if (r) images.set(n.id, r.image)
  }
  return { images, ready: needs.every((n) => results[n.id]) }
}

/**
 * Bumps whenever the browser finishes loading font files, after asking it to load what the
 * current text layers need. Canvas text is measured when drawn, so text nodes re-mount on
 * each bump to re-measure with the real font instead of the fallback.
 */
function useFontsVersion(layers: Layer[]) {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  useEffect(() => {
    for (const l of layers) if (l.kind === 'text') loadFontFor(getFont(l.fontId), l.text)
  }, [layers])
  return version
}

function BackgroundNode({
  background,
  width,
  height,
  baseColor,
}: {
  background: Background
  width: number
  height: number
  /** Null: a see-through print, nothing behind the layers. */
  baseColor: string | null
}) {
  const common = { name: 'background', width, height }
  if (background.kind === 'solid') return <Rect {...common} fill={background.color} />
  if (background.kind === 'pattern') {
    const palette = getPalette(background.paletteId)
    if (background.pattern === 'gradient') {
      return (
        <Rect
          {...common}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: width, y: height }}
          fillLinearGradientColorStops={[0, palette.bg, 1, palette.fg]}
        />
      )
    }
    const tileScale = background.scale / PATTERN_DENSITY
    return (
      <Rect
        {...common}
        fillPatternImage={patternTile(background.pattern, palette, PATTERN_DENSITY) as unknown as HTMLImageElement}
        fillPatternScale={{ x: tileScale, y: tileScale }}
        // Center the pattern on the wrap's front instead of its left edge.
        fillPatternOffset={{ x: ((width / 2) % (TILE * background.scale)) / tileScale, y: 0 }}
      />
    )
  }
  return baseColor ? <Rect {...common} fill={baseColor} /> : null
}

type NodeHandlers = {
  id: string
  draggable: boolean
  listening: boolean
  onPointerDown: () => void
  onDragEnd: (e: Konva.KonvaEventObject<Event>) => void
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void
}

/** Text centered on (x, y): its offset is set from the measured size after each render. */
function TextNode({ layer, ...handlers }: { layer: TextLayer; name?: string } & Partial<NodeHandlers>) {
  const ref = useRef<Konva.Text>(null)
  useLayoutEffect(() => {
    const n = ref.current
    if (!n) return
    n.offset({ x: n.width() / 2, y: n.height() / 2 })
    n.getLayer()?.batchDraw()
  })
  return (
    <Text
      ref={ref}
      {...handlers}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      text={layer.text}
      fontFamily={getFont(layer.fontId).family}
      fontSize={layer.fontSize}
      fill={layer.fill}
      align="center"
      lineHeight={1.1}
      stroke={layer.outline ?? undefined}
      strokeWidth={layer.outline ? layer.fontSize * 0.14 : 0}
      fillAfterStrokeEnabled
      lineJoin="round"
    />
  )
}

/** A group in the photo's local frame: origin at its center, rotated with it. */
function PhotoFrame({ photo, children, listening }: { photo: PhotoLayer; children: ReactNode; listening?: boolean }) {
  return (
    <Group x={photo.x} y={photo.y} rotation={photo.rotation} listening={listening}>
      {children}
    </Group>
  )
}

export function FullImage({ photo, image, opacity }: { photo: PhotoLayer; image: HTMLImageElement; opacity?: number }) {
  const full = fullImageBox(photo)
  return <KImage image={image} {...full} opacity={opacity} listening={false} />
}

/**
 * Crop mode overlay: the whole source image dimmed, the kept region bright, and a
 * free-aspect box with handles. The box is clamped to the image when a gesture ends.
 */
export function CropEditor({ photo, image, draft }: { photo: PhotoLayer; image: HTMLImageElement; draft: Box }) {
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const setCropDraft = useDesignStore((s) => s.setCropDraft)
  // The rect is driven imperatively during gestures; its props only seed it.
  const [seed] = useState(draft)
  const bounds = fullImageBox(photo)

  useEffect(() => {
    const rect = rectRef.current
    const tr = trRef.current
    if (!rect || !tr) return
    tr.nodes([rect])
    tr.getLayer()?.batchDraw()
  }, [])

  const readBox = (): Box | null => {
    const n = rectRef.current
    if (!n) return null
    return { x: n.x(), y: n.y(), width: n.width() * n.scaleX(), height: n.height() * n.scaleY() }
  }

  const onChange = () => {
    const box = readBox()
    if (box) setCropDraft(box)
  }

  const onEnd = () => {
    const n = rectRef.current
    const box = readBox()
    if (!n || !box) return
    const clamped = clampBox(box, bounds)
    n.setAttrs({ ...clamped, scaleX: 1, scaleY: 1 })
    setCropDraft(clamped)
  }

  return (
    <PhotoFrame photo={photo}>
      <FullImage photo={photo} image={image} opacity={0.3} />
      <Group clipX={draft.x} clipY={draft.y} clipWidth={draft.width} clipHeight={draft.height} listening={false}>
        <FullImage photo={photo} image={image} />
      </Group>
      <Rect
        ref={rectRef}
        {...seed}
        fill="rgba(255,255,255,0.01)"
        draggable
        onDragMove={onChange}
        onDragEnd={onEnd}
        onTransform={onChange}
        onTransformEnd={onEnd}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        keepRatio={false}
        flipEnabled={false}
        anchorSize={14}
        anchorCornerRadius={3}
        anchorStroke={ACCENT}
        borderStroke={ACCENT}
        borderDash={[4, 4]}
      />
    </PhotoFrame>
  )
}

/** Normalized source-photo coords <-> the photo's local frame. */
function sourceToLocal(photo: PhotoLayer, [u, v]: [number, number]): [number, number] {
  const full = fullImageBox(photo)
  return [full.x + u * full.width, full.y + v * full.height]
}

/**
 * Lasso mode: draw a rough loop around the pet, or tap to include / exclude. Shows the
 * worker's live preview (pink = kept) over the original photo.
 */
export function LassoOverlay({ photo, lasso, scale }: { photo: PhotoLayer; lasso: LassoState; scale: number }) {
  const groupRef = useRef<Konva.Group>(null)
  const preview = useLassoPreview((s) => s.canvas)
  const updateLasso = useDesignStore((s) => s.updateLasso)
  const [drawing, setDrawing] = useState<[number, number][] | null>(null)
  const full = fullImageBox(photo)
  const visible = visibleBox(photo)

  // Refresh the preview whenever the prompt changes (also warms up both models on entry).
  const prompt = useMemo(() => ({ lasso: lasso.lasso, taps: lasso.taps }), [lasso.lasso, lasso.taps])
  useEffect(() => {
    requestLassoPreview(photo, prompt)
  }, [photo, prompt])
  useEffect(() => resetLassoPreview, [])

  const toSource = (): [number, number] | null => {
    const p = groupRef.current?.getRelativePointerPosition()
    if (!p) return null
    return [(p.x - full.x) / full.width, (p.y - full.y) / full.height]
  }

  const onDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.cancelBubble = true
    const p = toSource()
    if (!p) return
    setDrawing([p])
    const stage = e.target.getStage()!
    let path: [number, number][] = [p]
    stage.on('pointermove.lasso', () => {
      const q = toSource()
      if (!q) return
      path = [...path, q]
      setDrawing(path)
    })
    stage.on('pointerup.lasso pointercancel.lasso', () => {
      stage.off('.lasso')
      setDrawing(null)
      // Path length in screen px decides tap vs loop.
      let length = 0
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = sourceToLocal(photo, path[i - 1])
        const [bx, by] = sourceToLocal(photo, path[i])
        length += Math.hypot(bx - ax, by - ay) * scale
      }
      if (length < 10) {
        const [x, y] = path[0]
        updateLasso({ taps: [...lasso.taps, { x, y, label: lasso.mode === 'include' ? 1 : 0 }] })
      } else if (path.length >= 3) {
        updateLasso({ lasso: path })
      }
    })
  }

  const toPoints = (path: [number, number][]) => path.flatMap((p) => sourceToLocal(photo, p))
  const dot = 7 / scale

  return (
    <Group ref={groupRef} x={photo.x} y={photo.y} rotation={photo.rotation}>
      <Group clipX={visible.x} clipY={visible.y} clipWidth={visible.width} clipHeight={visible.height}>
        {preview && <KImage image={preview} {...full} listening={false} />}
        {lasso.lasso && (
          <Line points={toPoints(lasso.lasso)} closed stroke={ACCENT} strokeWidth={2} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
        )}
        {drawing && drawing.length > 1 && (
          <Line points={toPoints(drawing)} stroke="#ffffff" strokeWidth={3} strokeScaleEnabled={false} shadowColor="#000" shadowBlur={4} shadowOpacity={0.4} listening={false} />
        )}
        {lasso.taps.map((t, i) => {
          const [x, y] = sourceToLocal(photo, [t.x, t.y])
          return (
            <Circle key={i} x={x} y={y} radius={dot} fill={t.label ? '#3fb67a' : '#e0474c'} stroke="#fff" strokeWidth={2} strokeScaleEnabled={false} listening={false} />
          )
        })}
        {/* Capture surface for drawing and tapping */}
        <Rect {...visible} fill="rgba(0,0,0,0.001)" onPointerDown={onDown} />
      </Group>
      <Rect {...visible} stroke={ACCENT} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
    </Group>
  )
}

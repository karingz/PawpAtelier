import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type Konva from 'konva'
import { Circle, Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { DESIGN_UNITS_PER_INCH, designSize, type ProductSpec } from '../config/products'
import { getFont, loadFontFor } from '../content/fonts'
import { getPalette, patternTile, TILE } from '../content/patterns'
import {
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
import { useImages } from './useHtmlImage'

const SAFE_INSET = 0.125 * DESIGN_UNITS_PER_INCH
const MIN_SIZE = 20
const ACCENT = '#d9607f'
/** Pattern tiles are rendered at this many pixels per design unit (texture is ~2.4). */
const PATTERN_DENSITY = 3

type Props = { spec: ProductSpec }

/**
 * Flat print-area editor. The "print" layer is exactly what goes on the product and is
 * shared with the 3D scene as a live texture; guides and handles live on a separate layer.
 */
export function PrintCanvas({ spec }: Props) {
  const design = designSize(spec)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const printLayerRef = useRef<Konva.Layer>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [displayWidth, setDisplayWidth] = useState(0)

  const { background, layers } = useDesignStore((s) => s.design)
  const selectedId = useDesignStore((s) => s.selectedId)
  const cropDraft = useDesignStore((s) => s.cropDraft)
  const lasso = useDesignStore((s) => s.lasso)
  /** Crop or lasso: the canvas is a tool surface, layers can't be moved. */
  const editing = !!cropDraft || !!lasso
  const select = useDesignStore((s) => s.select)
  const updateLayer = useDesignStore((s) => s.updateLayer)
  const selected = useDesignStore(selectedLayer)

  // In lasso mode the photo shows its original (uncut) image so you can see what to circle.
  const shownSrc = (l: Exclude<Layer, TextLayer>) => (lasso?.layerId === l.id && l.kind === 'photo' ? (l.originalSrc ?? l.src) : l.src)
  const srcs = useMemo(
    () => layers.flatMap((l) => (l.kind === 'text' ? [] : [lasso?.layerId === l.id && l.kind === 'photo' ? (l.originalSrc ?? l.src) : l.src])),
    [layers, lasso?.layerId],
  )
  const lassoPhoto = lasso ? layers.find((l): l is PhotoLayer => l.id === lasso.layerId && l.kind === 'photo') : undefined
  const { images, complete: imagesReady } = useImages(srcs)
  const fontsVersion = useFontsVersion(layers)

  const scale = displayWidth / design.width
  const displayHeight = design.height * scale
  const cropPhoto = cropDraft && selected?.kind === 'photo' && images.get(selected.src) ? selected : null

  // The print layer is only worth publishing once every image has decoded.
  const complete = useRef(false)
  useEffect(() => {
    complete.current = imagesReady
  })

  // Track the container width so the stage stays responsive.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setDisplayWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the print layer's backing canvas at preview-texture resolution regardless of
  // on-screen size.
  useEffect(() => {
    const layer = printLayerRef.current
    if (!layer || displayWidth === 0) return
    layer.getCanvas().setPixelRatio(spec.previewTextureWidth / displayWidth)
    layer.batchDraw()
    const c = layer.getCanvas()._canvas
    log.debug('editor', `print canvas ${c.width}x${c.height} (display ${displayWidth}px)`)
  }, [displayWidth, spec.previewTextureWidth])

  // Publish finished frames to the 3D scene. The layer's own canvas is cleared and resized
  // whenever the stage resizes, so the product samples a fixed-size copy made after each
  // complete draw instead; otherwise it can catch a blank canvas and flash black.
  // The copy outlives this editor, so the product keeps its print in the shop view.
  const stageReady = displayWidth > 0
  useEffect(() => {
    const layer = printLayerRef.current
    if (!layer) return
    const texture = printTextureCanvas(spec)
    const ctx = texture.getContext('2d')!
    const { markPrintDirty } = useDesignStore.getState()

    const publish = () => {
      if (!complete.current) return
      ctx.drawImage(layer.getCanvas()._canvas, 0, 0, texture.width, texture.height)
      markPrintDirty(spec.id)
    }
    layer.on('draw', publish)
    layer.batchDraw()
    return () => {
      layer.off('draw', publish)
    }
  }, [stageReady, spec])

  // Attach the transform handles to the selected layer (hidden while cropping).
  useEffect(() => {
    const tr = transformerRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = !editing && selectedId ? stage.findOne(`#${selectedId}`) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [layers, selectedId, editing, images, fontsVersion])

  const deselectOnEmpty = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (editing) return
    if (e.target === e.target.getStage() || e.target.name() === 'background') select(null)
  }

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

  return (
    <div className="print-canvas">
      <div ref={containerRef} className="print-canvas__stage" style={{ height: displayHeight || undefined }}>
        {stageReady && (
          <Stage
            ref={stageRef}
            width={displayWidth}
            height={displayHeight}
            scaleX={scale}
            scaleY={scale}
            onPointerDown={deselectOnEmpty}
          >
            <KLayer ref={printLayerRef}>
              <BackgroundNode background={background} width={design.width} height={design.height} baseColor={spec.color} />
              {layers.map((layer) => {
                if (cropPhoto && layer.id === cropPhoto.id) {
                  // Live crop preview on the product: the full image clipped to the draft box.
                  return (
                    <PhotoFrame key={layer.id} photo={cropPhoto} listening={false}>
                      <Group clipX={cropDraft!.x} clipY={cropDraft!.y} clipWidth={cropDraft!.width} clipHeight={cropDraft!.height}>
                        <FullImage photo={cropPhoto} image={images.get(cropPhoto.src)!} />
                      </Group>
                    </PhotoFrame>
                  )
                }
                const handlers = {
                  id: layer.id,
                  draggable: !editing,
                  listening: !editing,
                  onPointerDown: () => select(layer.id),
                  onDragEnd: commit(layer),
                  onTransformEnd: commit(layer),
                }
                if (layer.kind === 'text') {
                  return <TextNode key={`${layer.id}:${fontsVersion}`} layer={layer} {...handlers} />
                }
                const image = images.get(shownSrc(layer))
                if (!image) return null
                return (
                  <KImage
                    key={layer.id}
                    {...handlers}
                    image={image}
                    crop={layer.kind === 'photo' ? sourceCrop(layer) : undefined}
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
      </div>
      <div className="print-canvas__labels">
        <span>← {spec.handle ? 'handle side' : 'back seam'}</span>
        <span>front</span>
        <span>{spec.handle ? 'handle side' : 'back seam'} →</span>
      </div>
    </div>
  )
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
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = spec.color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  setPrintCanvas(spec.id, canvas)
  return canvas
}

function sourceCrop(p: PhotoLayer) {
  return {
    x: p.crop.x * p.naturalWidth,
    y: p.crop.y * p.naturalHeight,
    width: p.crop.width * p.naturalWidth,
    height: p.crop.height * p.naturalHeight,
  }
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
  baseColor: string
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
  return <Rect {...common} fill={baseColor} />
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
function TextNode({ layer, ...handlers }: { layer: TextLayer } & NodeHandlers) {
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

function FullImage({ photo, image, opacity }: { photo: PhotoLayer; image: HTMLImageElement; opacity?: number }) {
  const full = fullImageBox(photo)
  return <KImage image={image} {...full} opacity={opacity} listening={false} />
}

/**
 * Crop mode overlay: the whole source image dimmed, the kept region bright, and a
 * free-aspect box with handles. The box is clamped to the image when a gesture ends.
 */
function CropEditor({ photo, image, draft }: { photo: PhotoLayer; image: HTMLImageElement; draft: Box }) {
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
function LassoOverlay({ photo, lasso, scale }: { photo: PhotoLayer; lasso: LassoState; scale: number }) {
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

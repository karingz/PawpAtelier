import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type Konva from 'konva'
import { Group, Image as KImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { DESIGN_UNITS_PER_INCH, designSize, type ProductSpec } from '../config/products'
import { useDesignStore, type PhotoLayer } from '../store/designStore'
import { log } from '../debug/log'
import { clampBox, fullImageBox, type Box } from './crop'
import { useHtmlImage } from './useHtmlImage'

const SAFE_INSET = 0.125 * DESIGN_UNITS_PER_INCH
const MIN_PHOTO_SIZE = 40
const ACCENT = '#d9607f'

type Props = { spec: ProductSpec }

/**
 * Flat print-area editor. The "print" layer is exactly what goes on the product and is
 * shared with the 3D scene as a live texture; guides and handles live on a separate layer.
 */
export function PrintCanvas({ spec }: Props) {
  const design = designSize(spec)
  const containerRef = useRef<HTMLDivElement>(null)
  const printLayerRef = useRef<Konva.Layer>(null)
  const photoRef = useRef<Konva.Image>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [displayWidth, setDisplayWidth] = useState(0)

  const photo = useDesignStore((s) => s.design.photo)
  const selectedId = useDesignStore((s) => s.selectedId)
  const cropDraft = useDesignStore((s) => s.cropDraft)
  const updatePhoto = useDesignStore((s) => s.updatePhoto)
  const select = useDesignStore((s) => s.select)
  const image = useHtmlImage(photo?.src)

  const scale = displayWidth / design.width
  const displayHeight = design.height * scale
  const cropping = !!(cropDraft && photo && image)
  // The print layer is only worth publishing once the photo (if any) has decoded.
  const complete = useRef(false)
  useEffect(() => {
    complete.current = !photo || !!image
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

  // Attach the transform handles to the selected photo (hidden while cropping).
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    const selected = !cropping && photo && selectedId === photo.id && photoRef.current
    tr.nodes(selected ? [selected] : [])
    tr.getLayer()?.batchDraw()
  }, [photo, selectedId, image, cropping])

  const deselectOnEmpty = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (cropping) return
    if (e.target === e.target.getStage() || e.target.name() === 'background') select(null)
  }

  const commitTransform = () => {
    const node = photoRef.current
    if (!node || !photo) return
    const width = Math.max(MIN_PHOTO_SIZE, node.width() * node.scaleX())
    const height = Math.max(MIN_PHOTO_SIZE, node.height() * node.scaleY())
    node.scale({ x: 1, y: 1 })
    updatePhoto({ x: node.x(), y: node.y(), width, height, rotation: node.rotation() })
  }

  return (
    <div className="print-canvas">
      <div ref={containerRef} className="print-canvas__stage" style={{ height: displayHeight || undefined }}>
        {stageReady && (
          <Stage
            width={displayWidth}
            height={displayHeight}
            scaleX={scale}
            scaleY={scale}
            onPointerDown={deselectOnEmpty}
          >
            <Layer ref={printLayerRef}>
              <Rect name="background" width={design.width} height={design.height} fill={spec.color} />
              {photo && image && cropping && cropDraft && (
                // Live crop preview on the product: the full image clipped to the draft box.
                <PhotoFrame photo={photo} listening={false}>
                  <Group clipX={cropDraft.x} clipY={cropDraft.y} clipWidth={cropDraft.width} clipHeight={cropDraft.height}>
                    <FullImage photo={photo} image={image} />
                  </Group>
                </PhotoFrame>
              )}
              {photo && image && !cropping && (
                <KImage
                  ref={photoRef}
                  image={image}
                  crop={{
                    x: photo.crop.x * photo.naturalWidth,
                    y: photo.crop.y * photo.naturalHeight,
                    width: photo.crop.width * photo.naturalWidth,
                    height: photo.crop.height * photo.naturalHeight,
                  }}
                  x={photo.x}
                  y={photo.y}
                  width={photo.width}
                  height={photo.height}
                  offsetX={photo.width / 2}
                  offsetY={photo.height / 2}
                  rotation={photo.rotation}
                  draggable
                  onPointerDown={() => select(photo.id)}
                  onDragEnd={commitTransform}
                  onTransformEnd={commitTransform}
                />
              )}
            </Layer>
            <Layer>
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
                  Math.abs(newBox.width) < MIN_PHOTO_SIZE * scale ||
                  Math.abs(newBox.height) < MIN_PHOTO_SIZE * scale
                    ? oldBox
                    : newBox
                }
              />
              {photo && image && cropping && cropDraft && (
                <CropEditor photo={photo} image={image} draft={cropDraft} />
              )}
            </Layer>
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

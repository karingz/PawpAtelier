import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Image as KImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { DESIGN_UNITS_PER_INCH, designSize, type MugSpec } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { useHtmlImage } from './useHtmlImage'

const SAFE_INSET = 0.125 * DESIGN_UNITS_PER_INCH
const MIN_PHOTO_SIZE = 40

type Props = { spec: MugSpec }

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

  const photo = useDesignStore((s) => s.photo)
  const selectedId = useDesignStore((s) => s.selectedId)
  const updatePhoto = useDesignStore((s) => s.updatePhoto)
  const select = useDesignStore((s) => s.select)
  const image = useHtmlImage(photo?.src)

  const scale = displayWidth / design.width
  const displayHeight = design.height * scale

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
  // on-screen size, and publish it to the 3D scene.
  useEffect(() => {
    const layer = printLayerRef.current
    if (!layer || displayWidth === 0) return
    layer.getCanvas().setPixelRatio(spec.previewTextureWidth / displayWidth)
    layer.batchDraw()
  }, [displayWidth, spec.previewTextureWidth])

  const stageReady = displayWidth > 0
  useEffect(() => {
    const layer = printLayerRef.current
    if (!layer) return
    const { setPrintCanvas, markPrintDirty } = useDesignStore.getState()
    setPrintCanvas(layer.getCanvas()._canvas)
    layer.on('draw', markPrintDirty)
    markPrintDirty()
    return () => {
      layer.off('draw', markPrintDirty)
      setPrintCanvas(null)
    }
  }, [stageReady])

  // Attach the transform handles to the selected photo.
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    const selected = photo && selectedId === photo.id && photoRef.current
    tr.nodes(selected ? [selected] : [])
    tr.getLayer()?.batchDraw()
  }, [photo, selectedId, image])

  const deselectOnEmpty = (e: Konva.KonvaEventObject<PointerEvent>) => {
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
              {photo && image && (
                <KImage
                  ref={photoRef}
                  image={image}
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
                anchorStroke="#d9607f"
                borderStroke="#d9607f"
                rotateAnchorOffset={24}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < MIN_PHOTO_SIZE * scale ||
                  Math.abs(newBox.height) < MIN_PHOTO_SIZE * scale
                    ? oldBox
                    : newBox
                }
              />
            </Layer>
          </Stage>
        )}
      </div>
      <div className="print-canvas__labels">
        <span>← handle side</span>
        <span>front</span>
        <span>handle side →</span>
      </div>
    </div>
  )
}

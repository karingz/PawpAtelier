import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Group, Layer as KLayer, Stage } from 'react-konva'
import { useDesignStore, type PhotoLayer } from '../store/designStore'
import { fullImageBox, visibleBox } from './crop'
import { CropBar, LassoBar } from './Editor'
import { CropEditor, FullImage, LassoOverlay } from './PrintCanvas'
import { useImages } from './useHtmlImage'

/** Space around the photo inside the tool view, px. */
const PAD = 24

/**
 * Full-screen Crop / Lasso for one photo, like a phone photo editor: just that photo, fitted to
 * the screen and shown straight (its tilt on the design doesn't matter for these tools). The
 * 3D product keeps previewing underneath; Done / Apply / Cancel returns to it.
 */
export function PhotoToolModal() {
  const cropDraft = useDesignStore((s) => s.cropDraft)
  const lasso = useDesignStore((s) => s.lasso)
  const photo = useDesignStore((s) => {
    const id = s.lasso?.layerId ?? (s.cropDraft ? s.selectedId : null)
    return s.design.layers.find((l): l is PhotoLayer => l.id === id && l.kind === 'photo')
  })
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The same photo, placed at the origin and unrotated (the tools work in its local frame).
  const straight = useMemo(() => (photo ? { ...photo, x: 0, y: 0, rotation: 0 } : null), [photo])
  // Lasso shows the original (uncut) photo; crop shows what's there now.
  const src = photo ? (lasso ? (photo.originalSrc ?? photo.src) : photo.src) : ''
  const { images } = useImages(src ? [src] : [])
  const image = images.get(src)

  if (!photo || !straight || (!cropDraft && !lasso)) return null

  // Fit the region being worked on: the whole source for crop, the visible part for lasso.
  const box = cropDraft ? fullImageBox(straight) : visibleBox(straight)
  const scale = size.w && size.h ? Math.min((size.w - PAD * 2) / box.width, (size.h - PAD * 2) / box.height) : 1
  const x = size.w / 2 - (box.x + box.width / 2) * scale
  const y = size.h / 2 - (box.y + box.height / 2) * scale
  const visible = visibleBox(straight)

  return (
    <div className="tool-modal" role="dialog" aria-label={cropDraft ? 'Crop photo' : 'Cut out your pet'}>
      <div className="tool-modal__bar">{cropDraft ? <CropBar /> : <LassoBar />}</div>
      <div ref={wrapRef} className="tool-modal__stage">
        {image && size.w > 0 && (
          <Stage width={size.w} height={size.h} scaleX={scale} scaleY={scale} x={x} y={y}>
            <KLayer>
              {cropDraft ? (
                <CropEditor photo={straight} image={image} draft={cropDraft} />
              ) : (
                <>
                  <Group clipX={visible.x} clipY={visible.y} clipWidth={visible.width} clipHeight={visible.height} listening={false}>
                    <FullImage photo={straight} image={image} />
                  </Group>
                  <LassoOverlay photo={straight} lasso={lasso!} scale={scale} />
                </>
              )}
            </KLayer>
          </Stage>
        )}
      </div>
    </div>
  )
}

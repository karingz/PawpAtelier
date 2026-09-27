import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { layersWithDraft, useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { CutoutButton } from './Editor'
import { normalizeDegrees, transformPatch } from './layerGeometry'
import { selectionBus, type SelectionFrame } from './selectionBus'

/** Distance (px) of the rotate knob beyond the layer's top edge. */
const ROTATE_OFFSET = 30

/**
 * Drawn over the 3D view for the selected layer: an outline that follows the product's curved
 * surface, corner handles (scale), a rotate knob, and a floating toolbar. Positions come from
 * the scene every frame via `selectionBus` and are written straight to the DOM (no re-render
 * per frame). Handle gestures work in screen space around the layer's projected center.
 */
export function SelectionOverlay() {
  const polygonRef = useRef<SVGPolygonElement>(null)
  const stemRef = useRef<SVGLineElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const cornerRefs = useRef<(HTMLDivElement | null)[]>([])
  const rotateRef = useRef<HTMLDivElement>(null)
  const [layerId, setLayerId] = useState<string | null>(null)

  useEffect(() => {
    const place = (el: HTMLElement | null, x: number, y: number, show: boolean) => {
      if (!el) return
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      el.style.visibility = show ? 'visible' : 'hidden'
    }
    const apply = (f: SelectionFrame | null) => {
      setLayerId(f?.layerId ?? null)
      const poly = polygonRef.current
      if (poly) {
        poly.setAttribute('points', f ? f.outline.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : '')
        poly.style.opacity = f?.facing ? '1' : '0.3'
      }
      if (!f) return

      f.corners.forEach(([x, y], i) => place(cornerRefs.current[i], x, y, f.facing))
      // Rotate knob: beyond the middle of the top edge, pointing away from the center.
      const tx = (f.corners[0][0] + f.corners[1][0]) / 2
      const ty = (f.corners[0][1] + f.corners[1][1]) / 2
      const len = Math.hypot(tx - f.center.x, ty - f.center.y) || 1
      const kx = tx + ((tx - f.center.x) / len) * ROTATE_OFFSET
      const ky = ty + ((ty - f.center.y) / len) * ROTATE_OFFSET
      place(rotateRef.current, kx, ky, f.facing)
      const stem = stemRef.current
      if (stem) {
        stem.setAttribute('x1', `${tx}`)
        stem.setAttribute('y1', `${ty}`)
        stem.setAttribute('x2', `${kx}`)
        stem.setAttribute('y2', `${ky}`)
        stem.style.opacity = f.facing ? '1' : '0'
      }

      const bar = toolbarRef.current
      if (bar) {
        // Below the layer (the rotate knob lives on top), or above it near the bottom edge.
        const viewH = bar.parentElement?.clientHeight ?? 0
        const viewW = bar.parentElement?.clientWidth ?? 0
        const below = f.bottom.y + 64 < viewH
        // Keep the whole toolbar on screen (it can be wider than a phone's view).
        const half = bar.offsetWidth / 2
        bar.style.left = `${Math.min(Math.max(f.center.x, half + 8), Math.max(half + 8, viewW - half - 8))}px`
        bar.style.top = `${below ? f.bottom.y + 16 : Math.min(f.top.y, ky) - 16}px`
        bar.style.transform = `translate(-50%, ${below ? '0' : '-100%'})`
        bar.style.visibility = f.facing ? 'visible' : 'hidden'
      }
    }
    apply(selectionBus.get())
    return selectionBus.subscribe(apply)
  }, [layerId])

  /** Scale (corners) or rotate (knob) around the layer's projected center. */
  const startHandle = (mode: 'scale' | 'rotate') => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const frame = selectionBus.get()
    const st = useDesignStore.getState()
    const layer = layersWithDraft(st.design.layers, st.layerDraft).find((l) => l.id === frame?.layerId)
    if (!frame || !layer) return
    const origin = e.currentTarget.closest('.selection-overlay')!.getBoundingClientRect()
    const c = { x: origin.left + frame.center.x, y: origin.top + frame.center.y }
    const d0 = Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y))
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x)
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - c.x, ev.clientY - c.y)
      const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x)
      let rotation = layer.rotation
      if (mode === 'rotate') {
        rotation = normalizeDegrees(layer.rotation + ((a - a0) * 180) / Math.PI)
        // Snap to straight angles when close (±4°).
        const snapped = Math.round(rotation / 90) * 90
        if (!ev.shiftKey && Math.abs(rotation - snapped) < 4) rotation = normalizeDegrees(snapped)
      }
      const factor = mode === 'scale' ? d / d0 : 1
      useDesignStore.getState().setLayerDraft(layer.id, transformPatch(layer, factor, rotation))
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      useDesignStore.getState().commitLayerDraft()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return (
    <div className="selection-overlay">
      <svg className="selection-overlay__svg">
        <polygon ref={polygonRef} className="selection-overlay__outline" />
        {layerId && <line ref={stemRef} className="selection-overlay__stem" />}
      </svg>
      {layerId && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              ref={(el) => {
                cornerRefs.current[i] = el
              }}
              className={`surface-handle surface-handle--corner surface-handle--c${i}`}
              onPointerDown={startHandle('scale')}
              aria-label="Resize"
            />
          ))}
          <div ref={rotateRef} className="surface-handle surface-handle--rotate" onPointerDown={startHandle('rotate')} aria-label="Rotate">
            ↻
          </div>
          <div ref={toolbarRef} className="floating-toolbar" onPointerDown={(e) => e.stopPropagation()}>
            <FloatingActions layerId={layerId} />
          </div>
        </>
      )}
    </div>
  )
}

function FloatingActions({ layerId }: { layerId: string }) {
  const layers = useDesignStore((s) => s.design.layers)
  const { startCrop, startLasso, moveLayer, removeLayer } = useDesignStore.getState()
  const { openDrawer } = useUiStore.getState()
  const docked = !useUiStore((s) => s.flat)
  const index = layers.findIndex((l) => l.id === layerId)
  const layer = layers[index]
  if (!layer) return null
  return (
    <>
      {layer.kind === 'photo' && (
        <>
          <CutoutButton photo={layer} />
          <button className="btn btn--small" onClick={startLasso}>
            Lasso
          </button>
          <button className="btn btn--small" onClick={startCrop}>
            Crop
          </button>
          {docked && (
            <button className="btn btn--small" onClick={() => openDrawer('effects')}>
              Effects
            </button>
          )}
        </>
      )}
      {layer.kind === 'text' && docked && (
        <button className="btn btn--small" onClick={() => openDrawer('text')}>
          Edit text
        </button>
      )}
      <button className="btn btn--small btn--icon" onClick={() => moveLayer(layerId, 1)} disabled={index === layers.length - 1} title="Bring forward" aria-label="Bring forward">
        ⬆
      </button>
      <button className="btn btn--small btn--icon" onClick={() => moveLayer(layerId, -1)} disabled={index === 0} title="Send backward" aria-label="Send backward">
        ⬇
      </button>
      <button className="btn btn--small btn--icon btn--danger" onClick={() => removeLayer(layerId)} title="Delete" aria-label="Delete">
        ✕
      </button>
    </>
  )
}

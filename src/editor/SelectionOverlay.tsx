import { useEffect, useRef, useState } from 'react'
import { useDesignStore } from '../store/designStore'
import { CutoutButton } from './Editor'
import { selectionBus, type SelectionFrame } from './selectionBus'

/**
 * Drawn over the 3D view: an outline that follows the selected layer on the product's curved
 * surface, and a floating toolbar next to it. Positions come from the scene every frame via
 * `selectionBus` and are written straight to the DOM (no re-render per frame).
 */
export function SelectionOverlay() {
  const polygonRef = useRef<SVGPolygonElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [layerId, setLayerId] = useState<string | null>(null)

  useEffect(() => {
    const apply = (f: SelectionFrame | null) => {
      setLayerId(f?.layerId ?? null)
      const poly = polygonRef.current
      if (poly) {
        poly.setAttribute('points', f ? f.outline.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : '')
        poly.style.opacity = f?.facing ? '1' : '0.3'
      }
      const bar = toolbarRef.current
      if (bar && f) {
        // Above the layer, or below it when there's no room at the top.
        const above = f.top.y > 64
        bar.style.left = `${f.top.x}px`
        bar.style.top = `${above ? f.top.y - 12 : f.bottom.y + 12}px`
        bar.style.transform = `translate(-50%, ${above ? '-100%' : '0'})`
        bar.style.visibility = f.facing ? 'visible' : 'hidden'
      }
    }
    apply(selectionBus.get())
    return selectionBus.subscribe(apply)
  }, [layerId])

  return (
    <div className="selection-overlay">
      <svg className="selection-overlay__svg">
        <polygon ref={polygonRef} className="selection-overlay__outline" />
      </svg>
      {layerId && (
        <div ref={toolbarRef} className="floating-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <FloatingActions layerId={layerId} />
        </div>
      )}
    </div>
  )
}

function FloatingActions({ layerId }: { layerId: string }) {
  const layers = useDesignStore((s) => s.design.layers)
  const { startCrop, startLasso, moveLayer, removeLayer } = useDesignStore.getState()
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
        </>
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

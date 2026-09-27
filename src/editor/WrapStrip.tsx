import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { designSize, type ProductSpec } from '../config/products'
import { layersWithDraft, useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { layerBox } from './layerGeometry'
import { viewBus, type ViewFrame } from './viewBus'

/** Strip width in CSS px (the canvas is drawn at 2× for sharpness). */
const WIDTH = 340

/**
 * The whole print, flat, as a mini-map under the product: the part facing you is framed, the
 * selected layer is outlined, and tapping a spot turns the product to it. The ends are where the
 * handle (mug) or back seam (tumbler) is.
 */
export function WrapStrip({ spec }: { spec: ProductSpec }) {
  const design = designSize(spec)
  const height = Math.round((WIDTH * design.height) / design.width)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const windowRefs = useRef<(HTMLDivElement | null)[]>([])
  const selRef = useRef<HTMLDivElement>(null)

  // Copy the print (the 3D texture canvas) whenever it changes.
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const src = useDesignStore.getState().printCanvases[spec.id]
      const c = canvasRef.current
      if (!src || !c) return
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
    }
    draw()
    const unsubscribe = useDesignStore.subscribe((s, prev) => {
      if (s.printVersions[spec.id] === prev.printVersions[spec.id] && s.printCanvases === prev.printCanvases) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(raf)
    }
  }, [spec.id])

  // Follow the view (which part faces you) and the selection, every frame.
  useEffect(() => {
    const pct = (x: number) => `${(x / design.width) * 100}%`
    const apply = (f: ViewFrame | null) => {
      const [a, b] = windowRefs.current
      if (!a || !b) return
      if (!f || f.productId !== spec.id) {
        a.style.display = b.style.display = 'none'
        return
      }
      // The visible range, split in two when it runs past an end (around the handle/seam).
      const lo = f.frontX - f.halfX
      const hi = f.frontX + f.halfX
      const setRange = (el: HTMLDivElement, from: number, to: number) => {
        const l = Math.max(0, from)
        const r = Math.min(design.width, to)
        el.style.display = r > l ? 'block' : 'none'
        el.style.left = pct(l)
        el.style.width = pct(r - l)
      }
      setRange(a, lo, hi)
      if (lo < 0) setRange(b, lo + design.width, hi + design.width)
      else if (hi > design.width) setRange(b, lo - design.width, hi - design.width)
      else b.style.display = 'none'

      // Selected layer's (rotated) extent.
      const sel = selRef.current
      const st = useDesignStore.getState()
      const layer = layersWithDraft(st.design.layers, st.layerDraft).find((l) => l.id === st.selectedId)
      if (sel) {
        if (!layer) {
          sel.style.display = 'none'
        } else {
          const box = layerBox(spec.id, layer)
          const r = (box.rotation * Math.PI) / 180
          const w = Math.abs(box.w * Math.cos(r)) + Math.abs(box.h * Math.sin(r))
          const h = Math.abs(box.w * Math.sin(r)) + Math.abs(box.h * Math.cos(r))
          sel.style.display = 'block'
          sel.style.left = pct(box.cx - w / 2)
          sel.style.width = pct(w)
          sel.style.top = `${((box.cy - h / 2) / design.height) * 100}%`
          sel.style.height = `${(h / design.height) * 100}%`
        }
      }
    }
    apply(viewBus.get())
    return viewBus.subscribe(apply)
  }, [spec.id, design.width, design.height])

  const onTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * design.width
    useUiStore.getState().requestTurn(Math.min(design.width, Math.max(0, x)))
  }

  const end = spec.handle ? 'Handle' : 'Seam'
  return (
    <div className="wrap-strip" aria-label="Whole print. Tap to turn the product there.">
      <span className="wrap-strip__end" title={`${end} side`}>
        {spec.handle ? '◖' : '┆'}
      </span>
      <div className="wrap-strip__track" style={{ width: WIDTH, aspectRatio: `${design.width} / ${design.height}` }} onPointerDown={onTap}>
        <canvas ref={canvasRef} width={WIDTH * 2} height={height * 2} />
        {[0, 1].map((i) => (
          <div
            key={i}
            ref={(el) => {
              windowRefs.current[i] = el
            }}
            className="wrap-strip__window"
          />
        ))}
        <div ref={selRef} className="wrap-strip__selection" />
      </div>
      <span className="wrap-strip__end" title={`${end} side`}>
        {spec.handle ? '◗' : '┆'}
      </span>
    </div>
  )
}

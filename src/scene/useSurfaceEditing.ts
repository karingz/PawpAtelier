import { useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { CylinderSpec } from '../config/products'
import { boxContains, boxOutline, layerAt, layerBox, normalizeDegrees, transformPatch } from '../editor/layerGeometry'
import { selectionBus } from '../editor/selectionBus'
import { viewBus } from '../editor/viewBus'
import { designSize } from '../config/products'
import { layersWithDraft, useDesignStore, type Layer } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { gesture } from './gestures'
import { cylinderBand, designToBandLocal, uvToDesign } from './surface'

/** Pointer travel (px) below which a press counts as a tap. */
const TAP_SLOP = 6
const DOUBLE_TAP_MS = 400

let lastTap = { id: '', at: 0 }
/** A tap on a layer; the second quick tap on the same text starts typing into it. */
function noteTap(layer: Layer | undefined) {
  const now = performance.now()
  if (layer?.kind === 'text' && lastTap.id === layer.id && now - lastTap.at < DOUBLE_TAP_MS) {
    useUiStore.getState().startTextEdit(layer.id)
    lastTap = { id: '', at: 0 }
    return
  }
  lastTap = { id: layer?.id ?? '', at: now }
}

/**
 * Editing directly on the product's print band (the usual 3D-configurator rules):
 * - tap a layer to select it; tap empty print area to deselect;
 * - drag the *selected* layer to slide it along the surface (one undo step); put a second
 *   finger down while holding it to scale / rotate it;
 * - any other drag (unselected layers, empty area, background) turns the product, so a big
 *   photo covering the front doesn't stop you from turning the mug;
 * - every frame, publish where the selected layer is on screen (for the outline + toolbar).
 * Returns props for the band mesh.
 */
export function useSurfaceEditing(spec: CylinderSpec, active: boolean) {
  const band = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const raycaster = useThree((s) => s.raycaster)
  const dom = useThree((s) => s.gl.domElement)

  // Scratch objects reused every frame.
  const v = useRef(new THREE.Vector3())
  const n = useRef(new THREE.Vector3())
  const toCam = useRef(new THREE.Vector3())
  const normalMatrix = useRef(new THREE.Matrix3())

  /** Band-surface design point under a client position, if the pointer is over the band. */
  const designPointAt = (clientX: number, clientY: number) => {
    const mesh = band.current
    if (!mesh) return null
    const r = dom.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObject(mesh, false)[0]
    return hit?.uv ? uvToDesign(spec, hit.uv) : null
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const st = useDesignStore.getState()
    // A second finger while a layer is held belongs to that gesture (see below).
    if (!active || gesture.layerDrag || e.nativeEvent.button !== 0 || gesture.pinching || st.cropDraft || st.lasso || !e.uv) return
    const p = uvToDesign(spec, e.uv)
    const start = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    // The selected layer wins even when something is on top of it; otherwise the topmost.
    const selected = st.design.layers.find((l) => l.id === st.selectedId)
    const grabbed = selected && boxContains(layerBox(spec.id, selected), p.x, p.y) ? selected : undefined

    if (!grabbed) {
      // Not the selected layer: a tap selects what's there (or deselects on empty print area);
      // a drag turns the product as usual.
      const tapped = layerAt(spec.id, st.design.layers, p.x, p.y)
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', up)
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < TAP_SLOP) {
          st.select(tapped?.id ?? null)
          noteTap(tapped)
        }
      }
      window.addEventListener('pointerup', up)
      return
    }
    const hit = grabbed

    e.stopPropagation()
    gesture.layerDrag = true
    const origin = { x: hit.x, y: hit.y }
    let moved = false
    // Fingers on this gesture; with two, it's a pinch (scale) + twist (rotate) of the layer.
    const fingers = new Map<number, { x: number; y: number }>([[e.nativeEvent.pointerId, start]])
    let twist: { dist: number; angle: number } | null = null
    const spread = () => {
      const [a, b] = [...fingers.values()]
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
    }
    const down = (ev: PointerEvent) => {
      if (fingers.size !== 1) return
      fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      twist = spread()
      moved = true
    }
    const move = (ev: PointerEvent) => {
      if (!fingers.has(ev.pointerId)) return
      fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      const draft = useDesignStore.getState()
      if (twist && fingers.size === 2) {
        const now = spread()
        const patch = transformPatch(hit, now.dist / Math.max(1, twist.dist), normalizeDegrees(hit.rotation + now.angle - twist.angle))
        const keep = draft.layerDraft?.layerId === hit.id ? draft.layerDraft.patch : {}
        draft.setLayerDraft(hit.id, { ...keep, ...patch })
        return
      }
      if (twist) return // one finger left after a twist: wait for it to lift, no jump
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < TAP_SLOP) return
      moved = true
      const q = designPointAt(ev.clientX, ev.clientY)
      if (!q) return // off the band: hold position
      draft.setLayerDraft(hit.id, { x: origin.x + q.x - p.x, y: origin.y + q.y - p.y })
    }
    const up = (ev: PointerEvent) => {
      fingers.delete(ev.pointerId)
      if (fingers.size > 0) return
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      gesture.layerDrag = false
      if (moved) useDesignStore.getState().commitLayerDraft()
      else noteTap(hit)
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Every frame: which part of the wrap faces the camera (for the wrap strip), and where the
  // selected layer is on screen (for the outline, handles and toolbar).
  const camLocal = useRef(new THREE.Vector3())
  useFrame(() => {
    const mesh = band.current
    if (active && mesh) {
      // The camera's direction in the band's own frame gives the front angle directly
      // (independent of spin, idle bob or tilt).
      mesh.worldToLocal(camLocal.current.copy(camera.position))
      const b = cylinderBand(spec)
      const W = designSize(spec).width
      const phi = Math.atan2(camLocal.current.x, camLocal.current.z)
      const along = (((phi - b.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      // Past the end of the band (the gap): report it as just beyond the nearer edge.
      const frontX = along <= b.arc ? (along / b.arc) * W : along - b.arc < (Math.PI * 2 - b.arc) / 2 ? W + ((along - b.arc) / b.arc) * W : ((along - Math.PI * 2) / b.arc) * W
      viewBus.set({ productId: spec.id, frontX, halfX: ((70 * Math.PI) / 180 / b.arc) * W })
    }
    const st = useDesignStore.getState()
    const layers = layersWithDraft(st.design.layers, st.layerDraft)
    const sel = active && mesh && !st.cropDraft && !st.lasso ? layers.find((l) => l.id === st.selectedId) : undefined
    if (!sel || !mesh) {
      if (active) selectionBus.set(null)
      return
    }
    const box = layerBox(spec.id, sel)
    const project = (x: number, y: number): [number, number] => {
      designToBandLocal(spec, x, y, v.current)
      mesh.localToWorld(v.current).project(camera)
      return [((v.current.x + 1) / 2) * size.width, ((1 - v.current.y) / 2) * size.height]
    }
    const outline = boxOutline(box, 12).map(([x, y]) => project(x, y))
    const corners = [0, 12, 24, 36].map((i) => outline[i])
    const [cx, cy] = project(box.cx, box.cy)
    // Facing: the surface normal at the layer's center points toward the camera.
    designToBandLocal(spec, box.cx, box.cy, v.current, n.current)
    mesh.localToWorld(v.current)
    normalMatrix.current.getNormalMatrix(mesh.matrixWorld)
    n.current.applyMatrix3(normalMatrix.current).normalize()
    toCam.current.copy(camera.position).sub(v.current).normalize()
    const facing = n.current.dot(toCam.current) > 0.15

    let top = outline[0]
    let bottom = outline[0]
    for (const pt of outline) {
      if (pt[1] < top[1]) top = pt
      if (pt[1] > bottom[1]) bottom = pt
    }
    selectionBus.set({
      layerId: sel.id,
      outline,
      center: { x: cx, y: cy },
      corners,
      top: { x: top[0], y: top[1] },
      bottom: { x: bottom[0], y: bottom[1] },
      facing,
    })
  })

  return { ref: band, onPointerDown }
}

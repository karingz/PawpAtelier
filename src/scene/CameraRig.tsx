import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import { gesture } from './gestures'

/** A region the camera should frame: center plus the width/height that must fit on screen. */
export type Framing = {
  /** Changing the key flies the camera; the same key with new numbers (e.g. resize) snaps. */
  key: string
  center: [number, number, number]
  width: number
  height: number
  /** Fractions (0..1) of the view covered by UI at the bottom / left; the framing avoids them. */
  insetBottom?: number
  insetLeft?: number
}

/** Camera looks slightly down at what it frames. */
const VIEW_DIR = new THREE.Vector3(0, 0.16, 1).normalize()
const MARGIN = 1.15

function poseFor(framing: Framing, fovDeg: number, aspect: number) {
  const halfV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
  const inset = THREE.MathUtils.clamp(framing.insetBottom ?? 0, 0, 0.6)
  const insetX = THREE.MathUtils.clamp(framing.insetLeft ?? 0, 0, 0.6)
  const distance =
    Math.max(framing.height / 2 / (halfV * (1 - inset)), framing.width / 2 / (halfV * aspect * (1 - insetX))) * MARGIN
  // Aim below / left of the subject so it sits centered in the uncovered part of the view.
  const look = new THREE.Vector3(...framing.center)
  look.y -= inset * distance * halfV
  look.x -= insetX * distance * halfV * aspect
  return { look, pos: look.clone().addScaledVector(VIEW_DIR, distance) }
}

/** Camera distance multiplier limits for wheel / pinch zoom (1 = the framing). */
const ZOOM_LIMITS: [number, number] = [0.45, 1.5]

/**
 * Drives the default camera: snaps on first frame and on resize, flies when the framing key
 * changes. With `zoomable`, wheel / pinch dolly the camera in and out with a springy clamp.
 */
export function CameraRig({ framing, duration = 1.1, zoomable = false }: { framing: Framing; duration?: number; zoomable?: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const goal = useMemo(() => poseFor(framing, camera.fov, aspect), [framing, camera.fov, aspect])

  const current = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null)
  const lastKey = useRef(framing.key)
  const flight = useRef<gsap.core.Timeline | null>(null)

  useEffect(() => {
    const cur = current.current
    const keyChanged = lastKey.current !== framing.key
    lastKey.current = framing.key
    const inFlight = flight.current?.isActive() ? flight.current : null
    flight.current?.kill()
    flight.current = null

    if (!cur) {
      current.current = { pos: goal.pos.clone(), look: goal.look.clone() }
      return
    }
    // A resize mid-flight (the editor panel opening, say) re-aims the rest of the flight.
    const remaining = keyChanged ? duration : inFlight ? inFlight.duration() - inFlight.time() : 0
    if (remaining <= 0) {
      cur.pos.copy(goal.pos)
      cur.look.copy(goal.look)
      return
    }
    const ease = keyChanged ? 'power3.inOut' : 'power2.out'
    flight.current = gsap
      .timeline()
      .to(cur.pos, { x: goal.pos.x, y: goal.pos.y, z: goal.pos.z, duration: remaining, ease }, 0)
      .to(cur.look, { x: goal.look.x, y: goal.look.y, z: goal.look.z, duration: remaining, ease }, 0)
  }, [goal, framing.key, duration])

  useEffect(() => () => void flight.current?.kill(), [])

  const zoom = useZoomGestures(zoomable, framing.key)

  useFrame((_, delta) => {
    const cur = current.current
    if (!cur) return
    const z = zoom.step(delta)
    camera.position.copy(cur.look).addScaledVector(cur.pos.clone().sub(cur.look), z)
    camera.lookAt(cur.look)
  })

  return null
}

function clamp(x: number, [min, max]: [number, number]) {
  return Math.min(max, Math.max(min, x))
}

/** Resistance past the limits, in log space so zooming in and out feel the same. */
function rubberBand(x: number, limits: [number, number], give = 0.35) {
  const lx = Math.log(x)
  const [lo, hi] = limits.map(Math.log)
  if (lx > hi) return Math.exp(hi + (1 - 1 / ((lx - hi) / give + 1)) * give)
  if (lx < lo) return Math.exp(lo - (1 - 1 / ((lo - lx) / give + 1)) * give)
  return x
}

/**
 * Wheel and two-finger pinch zoom on the 3D canvas. `raw` follows the input (it may go past the
 * limits, shown rubber-banded); once input stops it is clamped and the value springs back.
 * Resets when the framing changes (e.g. back to the shop).
 */
function useZoomGestures(enabled: boolean, resetKey: string) {
  const dom = useThree((s) => s.gl.domElement)
  const state = useRef({ raw: 1, x: 1, v: 0, settleAt: 0 })

  useEffect(() => {
    state.current.raw = 1
  }, [resetKey])

  useEffect(() => {
    if (!enabled) {
      state.current.raw = 1
      return
    }
    const s = state.current
    const settleSoon = () => (s.settleAt = performance.now() + 160)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))
      s.raw = clamp(s.raw * factor, [ZOOM_LIMITS[0] * 0.6, ZOOM_LIMITS[1] * 1.6])
      settleSoon()
    }

    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; raw: number } | null = null
    const dist = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e: PointerEvent) => {
      // Two fingers on a grabbed layer scale/rotate it (useSurfaceEditing), not the view.
      if (gesture.layerDrag) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        pinch = { dist: dist(), raw: s.raw }
        gesture.pinching = true
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size >= 2) s.raw = (pinch.raw * pinch.dist) / Math.max(1, dist())
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2 && pinch) {
        pinch = null
        gesture.pinching = false
        settleSoon()
      }
    }
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      gesture.pinching = false
    }
  }, [dom, enabled])

  return {
    /** Advance the spring; returns the camera distance multiplier to use this frame. */
    step(delta: number) {
      const s = state.current
      const dt = Math.min(delta, 1 / 30)
      if (s.settleAt && performance.now() > s.settleAt && !gesture.pinching) {
        s.raw = clamp(s.raw, ZOOM_LIMITS)
        s.settleAt = 0
      }
      const target = rubberBand(s.raw, ZOOM_LIMITS)
      // Slightly underdamped: a small bounce when it springs back from past a limit.
      s.v += (190 * (target - s.x) - 20 * s.v) * dt
      s.x += s.v * dt
      return s.x
    },
  }
}

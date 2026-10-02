import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { log } from '../debug/log'
import { gesture } from './gestures'

type Props = {
  children: ReactNode
  /** When false, input is ignored and the object springs back to rest. */
  enabled?: boolean
  /** Resting rotation [x (tilt), y (spin)] in radians. */
  rest?: [number, number]
  /** Spin limits relative to rest; dragging past them rubber-bands and springs back. */
  azimuth?: [number, number]
  /** Tilt limits relative to rest; tilt always springs home on release. */
  polar?: [number, number]
  /** Radians per pixel of drag. */
  speed?: number
  stiffness?: number
  /** Below 2 * sqrt(stiffness) the spring overshoots, which is the point. */
  damping?: number
  /**
   * Turn to this spin (radians from rest, e.g. to bring a selected layer to the front). A new
   * `key` triggers it; ignored if already close; any drag cancels it.
   */
  face?: { spin: number; key: string } | null
  /** Imperative handle, e.g. to turn to a spot picked on the wrap strip. */
  apiRef?: RefObject<SpringyApi | null>
}

export type SpringyApi = {
  /** Current spin (radians from rest). */
  spin: () => number
  /** Spring to a spin (radians from rest), taking the short way round within the limits. */
  turnTo: (spin: number) => void
}

/**
 * Casual drag-to-turn controls: clamped, rubber-banded past the limits, and a bouncy
 * spring back on release. Pointer input is taken from the whole canvas.
 */
export function SpringyControls({
  children,
  enabled = true,
  rest = [0, 0],
  azimuth = [-Math.PI, Math.PI],
  polar = [-0.35, 0.35],
  speed = 0.009,
  stiffness = 140,
  damping = 11,
  face = null,
  apiRef,
}: Props) {
  const group = useRef<Group>(null)
  const dom = useThree((s) => s.gl.domElement)

  // Offsets from rest, per axis.
  const state = useRef({
    dragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    rawSpin: 0,
    rawTilt: 0,
    spin: { x: 0, v: 0 },
    tilt: { x: 0, v: 0 },
    faceTarget: null as number | null,
    /** The rest spin as shown: eases to a new `rest` (e.g. a tee turned to print on its back). */
    restSpin: rest[1],
  })

  const turnTo = (target: number) => {
    const s = state.current
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    s.faceTarget = clamp(s.spin.x + wrap(target - s.spin.x), azimuth)
  }
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { spin: () => state.current.spin.x, turnTo }
    return () => {
      apiRef.current = null
    }
  })

  // Auto-face: pick the nearest equivalent angle within the spin limits.
  const faceKey = face?.key
  useEffect(() => {
    if (!face || !enabled) return
    const s = state.current
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    const diff = wrap(face.spin - s.spin.x)
    if (Math.abs(diff) < 0.45) return // already roughly facing
    s.faceTarget = clamp(s.spin.x + diff, azimuth)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only for a new face request
  }, [faceKey, enabled])

  useEffect(() => {
    if (!enabled) return
    const s = state.current
    const onDown = (e: PointerEvent) => {
      // A layer grabbed on the surface takes this pointer (R3F handles it before us).
      if (s.dragging || gesture.layerDrag) return
      s.faceTarget = null
      s.dragging = true
      s.pointerId = e.pointerId
      s.startX = e.clientX
      s.startY = e.clientY
      s.rawSpin = s.spin.x
      s.rawTilt = s.tilt.x
      dom.setPointerCapture(e.pointerId)
      dom.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!s.dragging || e.pointerId !== s.pointerId) return
      if (gesture.layerDrag) {
        // This press grabbed a layer on the surface (R3F saw it after our pointerdown).
        s.dragging = false
        s.pointerId = -1
        return
      }
      if (gesture.pinching) {
        // Two fingers are zooming: don't also spin, and don't jump when the pinch ends.
        s.startX = e.clientX
        s.startY = e.clientY
        return
      }
      s.rawSpin += (e.clientX - s.startX) * speed
      s.rawTilt += (e.clientY - s.startY) * speed
      s.startX = e.clientX
      s.startY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return
      s.dragging = false
      s.pointerId = -1
      log.debug('controls', `release spin=${s.spin.x.toFixed(2)} tilt=${s.tilt.x.toFixed(2)} v=${s.spin.v.toFixed(1)}`)
      dom.style.cursor = 'grab'
    }
    dom.style.cursor = 'grab'
    dom.style.touchAction = 'none'
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)
    return () => {
      s.dragging = false
      s.pointerId = -1
      dom.style.cursor = ''
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
    }
  }, [dom, speed, enabled])

  useFrame((_, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 30)
    const restGap = Math.atan2(Math.sin(rest[1] - s.restSpin), Math.cos(rest[1] - s.restSpin))
    s.restSpin = Math.abs(restGap) < 1e-4 ? rest[1] : s.restSpin + restGap * Math.min(1, dt * 6)

    if (s.dragging) {
      track(s.spin, rubberBand(s.rawSpin, azimuth), dt)
      track(s.tilt, rubberBand(s.rawTilt, polar), dt)
    } else if (!enabled) {
      spring(s.spin, 0, stiffness, damping, dt)
      spring(s.tilt, 0, stiffness, damping, dt)
    } else if (s.faceTarget !== null) {
      spring(s.spin, s.faceTarget, stiffness, damping, dt)
      spring(s.tilt, 0, stiffness, damping, dt)
      if (Math.abs(s.spin.x - s.faceTarget) < 0.002 && Math.abs(s.spin.v) < 0.01) s.faceTarget = null
    } else {
      // Spin keeps a little momentum inside the limits; tilt always goes home.
      const spinTarget = clamp(s.spin.x, azimuth)
      if (spinTarget !== s.spin.x) spring(s.spin, spinTarget, stiffness, damping, dt)
      else coast(s.spin, dt)
      spring(s.tilt, 0, stiffness, damping, dt)
    }

    if (group.current) {
      group.current.rotation.set(rest[0] + s.tilt.x, s.restSpin + s.spin.x, 0)
    }
  })

  return <group ref={group}>{children}</group>
}

type Axis = { x: number; v: number }

function clamp(x: number, [min, max]: [number, number]) {
  return Math.min(max, Math.max(min, x))
}

/** iOS-style resistance past the limits. */
function rubberBand(x: number, [min, max]: [number, number], give = 0.6) {
  if (x > max) return max + (1 - 1 / ((x - max) / give + 1)) * give
  if (x < min) return min - (1 - 1 / ((min - x) / give + 1)) * give
  return x
}

function track(axis: Axis, target: number, dt: number) {
  const v = (target - axis.x) / Math.max(dt, 1e-4)
  axis.v = axis.v * 0.6 + v * 0.4
  axis.x = target
}

function spring(axis: Axis, target: number, k: number, c: number, dt: number) {
  axis.v += (k * (target - axis.x) - c * axis.v) * dt
  axis.x += axis.v * dt
}

function coast(axis: Axis, dt: number, friction = 4) {
  axis.v *= Math.exp(-friction * dt)
  axis.x += axis.v * dt
}

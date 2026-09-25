import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'

type Props = {
  children: ReactNode
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
}

/**
 * Casual drag-to-turn controls: clamped, rubber-banded past the limits, and a bouncy
 * spring back on release. Pointer input is taken from the whole canvas.
 */
export function SpringyControls({
  children,
  rest = [0, 0],
  azimuth = [-Math.PI, Math.PI],
  polar = [-0.35, 0.35],
  speed = 0.009,
  stiffness = 140,
  damping = 11,
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
  })

  useEffect(() => {
    const s = state.current
    const onDown = (e: PointerEvent) => {
      if (s.dragging) return
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
      s.rawSpin += (e.clientX - s.startX) * speed
      s.rawTilt += (e.clientY - s.startY) * speed
      s.startX = e.clientX
      s.startY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return
      s.dragging = false
      s.pointerId = -1
      dom.style.cursor = 'grab'
    }
    dom.style.cursor = 'grab'
    dom.style.touchAction = 'none'
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)
    return () => {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
    }
  }, [dom, speed])

  useFrame((_, delta) => {
    const s = state.current
    const dt = Math.min(delta, 1 / 30)

    if (s.dragging) {
      track(s.spin, rubberBand(s.rawSpin, azimuth), dt)
      track(s.tilt, rubberBand(s.rawTilt, polar), dt)
    } else {
      // Spin keeps a little momentum inside the limits; tilt always goes home.
      const spinTarget = clamp(s.spin.x, azimuth)
      if (spinTarget !== s.spin.x) spring(s.spin, spinTarget, stiffness, damping, dt)
      else coast(s.spin, dt)
      spring(s.tilt, 0, stiffness, damping, dt)
    }

    if (group.current) {
      group.current.rotation.set(rest[0] + s.tilt.x, rest[1] + s.spin.x, 0)
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

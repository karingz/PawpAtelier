import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'

/** A region the camera should frame: center plus the width/height that must fit on screen. */
export type Framing = {
  /** Changing the key flies the camera; the same key with new numbers (e.g. resize) snaps. */
  key: string
  center: [number, number, number]
  width: number
  height: number
  /** Fraction (0..1) of the view covered by UI at the bottom; the framing avoids it. */
  insetBottom?: number
}

/** Camera looks slightly down at what it frames. */
const VIEW_DIR = new THREE.Vector3(0, 0.16, 1).normalize()
const MARGIN = 1.15

function poseFor(framing: Framing, fovDeg: number, aspect: number) {
  const halfV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
  const inset = THREE.MathUtils.clamp(framing.insetBottom ?? 0, 0, 0.6)
  const distance =
    Math.max(framing.height / 2 / (halfV * (1 - inset)), framing.width / 2 / (halfV * aspect)) * MARGIN
  // Aim below the subject so it sits centered in the uncovered part of the view.
  const look = new THREE.Vector3(...framing.center)
  look.y -= inset * distance * halfV
  return { look, pos: look.clone().addScaledVector(VIEW_DIR, distance) }
}

/** Drives the default camera: snaps on first frame and on resize, flies when the framing key changes. */
export function CameraRig({ framing, duration = 1.1 }: { framing: Framing; duration?: number }) {
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

  useFrame(() => {
    const cur = current.current
    if (!cur) return
    camera.position.copy(cur.pos)
    camera.lookAt(cur.look)
  })

  return null
}

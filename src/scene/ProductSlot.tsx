import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Group } from 'three'
import { BlobShadow } from '../room/Room'
import { designSize, type ProductSpec } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { CylinderProduct } from './CylinderProduct'
import { cylinderSize } from './dimensions'
import { IdleFloat } from './IdleFloat'
import { SpringyControls, type SpringyApi } from './SpringyControls'
import { useUiStore } from '../store/uiStore'
import { cylinderBand } from './surface'
import { useSurfaceEditing } from './useSurfaceEditing'

type Props = {
  spec: ProductSpec
  /** Where the product's base rests in the room (its shelf / slot). */
  home: THREE.Vector3
  /** Where it goes to be customized (the workbench). */
  stage: THREE.Vector3
  /** Resting rotation [tilt, spin]; spin chosen so the print's center faces the camera. */
  rest: [number, number]
  /** Yaw of the camera's viewing direction (radians): "facing the camera" means this angle. */
  viewYaw: number
}

/** Pointer travel (px) beyond which a press counts as a drag, not a tap. */
const TAP_SLOP = 6

/**
 * One product on the table: squashes and hops on hover, pops when tapped, and is
 * drag-turnable only while it is the one being edited.
 */
export function ProductSlot({ spec, home, stage, rest, viewYaw }: Props) {
  const view = useDesignStore((s) => s.view)
  const activeId = useDesignStore((s) => s.productId)
  const openProduct = useDesignStore((s) => s.openProduct)
  const dom = useThree((s) => s.gl.domElement)
  const editingThis = view === 'edit' && activeId === spec.id
  // At the counter it can still be turned around, but the design isn't editable there.
  const atCounter = useUiStore((s) => s.atCounter)
  const { height } = cylinderSize(spec)
  const bandProps = useSurfaceEditing(spec, editingThis && !atCounter)

  // A point at band angle θ faces the camera when θ + rest spin + spin ≡ the camera's yaw.
  const spinToFace = (x: number) => {
    const band = cylinderBand(spec)
    const theta = band.start + (x / designSize(spec).width) * band.arc
    const spin = viewYaw - (theta + rest[1])
    return Math.atan2(Math.sin(spin), Math.cos(spin))
  }

  // Auto-face: when a layer gets selected, turn the product so its center faces the camera.
  const selectedId = useDesignStore((s) => s.selectedId)
  const face = useMemo(() => {
    if (!editingThis || !selectedId) return null
    const layer = useDesignStore.getState().design.layers.find((l) => l.id === selectedId)
    return layer ? { spin: spinToFace(layer.x), key: selectedId } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spinToFace only depends on spec/rest/yaw
  }, [editingThis, selectedId, spec, rest, viewYaw])

  // Turn to a spot picked on the wrap strip.
  const controls = useRef<SpringyApi | null>(null)
  const turnRequest = useUiStore((s) => s.turnRequest)
  useEffect(() => {
    if (editingThis && turnRequest) controls.current?.turnTo(spinToFace(turnRequest.x))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request should turn
  }, [turnRequest?.n])

  const [hovered, setHovered] = useState(false)
  const bounce = useRef<Group>(null)
  const squash = useRef({ x: 0, v: 0 })

  // Travel between the shelf and the workbench: a springy move with a hop (arc) on the way.
  const place = useRef<Group>(null)
  const travel = useRef({ pos: home.clone(), vel: new THREE.Vector3() })
  useFrame((_, delta) => {
    const g = place.current
    if (!g) return
    const t = travel.current
    const target = editingThis ? stage : home
    // Substepped in real time so the hop keeps pace with the camera flight even at low fps.
    const steps = Math.ceil(Math.min(delta, 0.5) / (1 / 60))
    const dt = Math.min(delta, 0.5) / Math.max(1, steps)
    const acc = new THREE.Vector3()
    for (let i = 0; i < steps; i++) {
      acc.copy(target).sub(t.pos).multiplyScalar(70).addScaledVector(t.vel, -14)
      t.vel.addScaledVector(acc, dt)
      t.pos.addScaledVector(t.vel, dt)
    }
    const flat = Math.hypot(target.x - t.pos.x, target.z - t.pos.z)
    g.position.set(t.pos.x, t.pos.y + Math.min(flat * 0.35, 3), t.pos.z)
  })

  useFrame((_, delta) => {
    const g = bounce.current
    if (!g) return
    const dt = Math.min(delta, 1 / 30)
    const s = squash.current
    const target = hovered && view === 'shop' ? 1 : 0
    // Underdamped spring: overshoots into a little wobble.
    s.v += (180 * (target - s.x) - 9 * s.v) * dt
    s.x += s.v * dt
    // Scale about the base (group origin), preserving volume-ish.
    g.scale.set(1 - 0.03 * s.x, 1 + 0.06 * s.x, 1 - 0.03 * s.x)
    g.position.y = Math.max(0, s.x) * 0.04
  })

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    if (view === 'shop') dom.style.cursor = 'pointer'
  }
  const onOut = () => {
    setHovered(false)
    if (view === 'shop') dom.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > TAP_SLOP || editingThis) return
    squash.current.v -= 10 // pop
    dom.style.cursor = ''
    openProduct(spec.id)
  }

  return (
    <group ref={place} position={home}>
      <BlobShadow radius={cylinderSize(spec).radius} />
      <group ref={bounce}>
        {/* Lifted a hair so the idle bob never dips into the table */}
        <group position-y={height / 2 + 0.012}>
          <SpringyControls rest={rest} enabled={editingThis} face={face} apiRef={controls}>
            <IdleFloat phase={home.x * 3}>
              <CylinderProduct spec={spec} bandProps={bandProps} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
            </IdleFloat>
          </SpringyControls>
        </group>
      </group>
    </group>
  )
}

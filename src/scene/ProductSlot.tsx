import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
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
  /** Where the product's base sits on the table. */
  position: [number, number, number]
  /** Resting rotation [tilt, spin]; spin chosen so the print's center faces the camera. */
  rest: [number, number]
}

/** Pointer travel (px) beyond which a press counts as a drag, not a tap. */
const TAP_SLOP = 6

/**
 * One product on the table: squashes and hops on hover, pops when tapped, and is
 * drag-turnable only while it is the one being edited.
 */
export function ProductSlot({ spec, position, rest }: Props) {
  const view = useDesignStore((s) => s.view)
  const activeId = useDesignStore((s) => s.productId)
  const openProduct = useDesignStore((s) => s.openProduct)
  const dom = useThree((s) => s.gl.domElement)
  const editingThis = view === 'edit' && activeId === spec.id
  const { height } = cylinderSize(spec)
  const bandProps = useSurfaceEditing(spec, editingThis)

  // A point at band angle θ faces the camera when θ + rest spin + spin ≡ 0.
  const spinToFace = (x: number) => {
    const band = cylinderBand(spec)
    const theta = band.start + (x / designSize(spec).width) * band.arc
    const spin = -(theta + rest[1])
    return Math.atan2(Math.sin(spin), Math.cos(spin))
  }

  // Auto-face: when a layer gets selected, turn the product so its center faces the camera.
  const selectedId = useDesignStore((s) => s.selectedId)
  const face = useMemo(() => {
    if (!editingThis || !selectedId) return null
    const layer = useDesignStore.getState().design.layers.find((l) => l.id === selectedId)
    return layer ? { spin: spinToFace(layer.x), key: selectedId } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spinToFace only depends on spec/rest
  }, [editingThis, selectedId, spec, rest])

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
    <group position={position}>
      <group ref={bounce}>
        {/* Lifted a hair so the idle bob never dips into the table */}
        <group position-y={height / 2 + 0.012}>
          <SpringyControls rest={rest} enabled={editingThis} face={face} apiRef={controls}>
            <IdleFloat phase={position[0] * 3}>
              <CylinderProduct spec={spec} bandProps={bandProps} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
            </IdleFloat>
          </SpringyControls>
        </group>
      </group>
    </group>
  )
}

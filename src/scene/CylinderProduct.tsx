import { useEffect, useMemo, useRef } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import type { CylinderSpec } from '../config/products'
import { cylinderSize } from './dimensions'
import { cylinderBand } from './surface'
import { useLiveCanvasTexture } from './useLiveCanvasTexture'

type Props = {
  spec: CylinderSpec
  /** Extra props for the print band mesh (refs, pointer handlers for editing on the surface). */
  bandProps?: ThreeElements['mesh']
} & ThreeElements['group']

/**
 * Placeholder mug / tumbler built from primitives, centered on its body. The print band is
 * an open cylinder whose UVs map 1:1 onto the flat print wrap; the wrap's seam (or the
 * gap for a handle) sits at +X.
 */
export function CylinderProduct({ spec, bandProps, ...groupProps }: Props) {
  const { radius, height } = cylinderSize(spec)
  const wall = 0.018
  const band = cylinderBand(spec)

  const bandMaterial = useRef<THREE.MeshPhysicalMaterial>(null)
  const texture = useLiveCanvasTexture(spec.id)

  useEffect(() => {
    const mat = bandMaterial.current
    if (!mat) return
    mat.map = texture
    mat.needsUpdate = true
  }, [texture])

  const ceramic = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: 0.28,
        clearcoat: 0.7,
        clearcoatRoughness: 0.15,
      }),
    [spec.color],
  )
  useEffect(() => () => ceramic.dispose(), [ceramic])

  return (
    <group name={spec.id} {...groupProps}>
      {/* Outer body */}
      <mesh castShadow material={ceramic}>
        <cylinderGeometry args={[radius, radius, height, 96, 1, true]} />
      </mesh>
      {/* Print band: sits a hair outside the body so it wins the depth test */}
      <mesh position-y={band.y} name="print-band" {...bandProps}>
        <cylinderGeometry args={[band.radius, band.radius, band.height, 128, 1, true, band.start, band.arc]} />
        <meshPhysicalMaterial
          ref={bandMaterial}
          color="#ffffff"
          roughness={0.28}
          clearcoat={0.7}
          clearcoatRoughness={0.15}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      {/* Outer base */}
      <mesh rotation-x={Math.PI / 2} position-y={-height / 2} material={ceramic}>
        <circleGeometry args={[radius, 64]} />
      </mesh>

      {spec.lid ? (
        <Lid radius={radius} y={height / 2} />
      ) : (
        <>
          {/* Inside wall, rim and floor */}
          <mesh>
            <cylinderGeometry args={[radius - wall, radius - wall, height - wall, 96, 1, true]} />
            <meshPhysicalMaterial color={spec.color} roughness={0.35} side={THREE.BackSide} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={height / 2} material={ceramic}>
            <ringGeometry args={[radius - wall, radius, 96]} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={-height / 2 + wall * 2} material={ceramic}>
            <circleGeometry args={[radius - wall, 64]} />
          </mesh>
        </>
      )}

      {spec.handle && (
        // Half torus on the +X side
        <mesh castShadow rotation-z={-Math.PI / 2} position-x={radius - 0.035} material={ceramic}>
          <torusGeometry args={[height * 0.26, 0.045, 20, 48, Math.PI]} />
        </mesh>
      )}
    </group>
  )
}

/** Clear press-on lid with a sip slot, like a skinny tumbler's. */
function Lid({ radius, y }: { radius: number; y: number }) {
  const lidHeight = 0.07
  return (
    <group position-y={y + lidHeight / 2}>
      <mesh castShadow>
        <cylinderGeometry args={[radius * 0.97, radius * 1.01, lidHeight, 64]} />
        <meshPhysicalMaterial color="#d9d3cc" roughness={0.2} transmission={0.6} thickness={0.05} />
      </mesh>
      <mesh position={[0, lidHeight / 2 + 0.001, -radius * 0.55]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[radius * 0.5, radius * 0.12]} />
        <meshStandardMaterial color="#8a7f76" />
      </mesh>
    </group>
  )
}

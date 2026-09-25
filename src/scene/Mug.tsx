import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import type { MugSpec } from '../config/products'
import { useDesignStore } from '../store/designStore'

/** Scene units per inch (1 unit = 10 cm). */
const UNITS_PER_INCH = 0.254

type Props = { spec: MugSpec } & ThreeElements['group']

/**
 * Placeholder mug built from primitives. The print band is an open cylinder whose
 * UVs map 1:1 onto the flat print wrap; the gap in the band sits behind the handle (+X).
 */
export function Mug({ spec, ...groupProps }: Props) {
  const radius = (spec.body.diameterIn / 2) * UNITS_PER_INCH
  const height = spec.body.heightIn * UNITS_PER_INCH
  const wall = 0.018
  const bandHeight = spec.print.heightIn * UNITS_PER_INCH
  const circumferenceIn = Math.PI * spec.body.diameterIn
  const bandArc = (spec.print.widthIn / circumferenceIn) * Math.PI * 2
  // Handle is at theta = PI/2 (+X); center the wrap's gap on it.
  const bandStart = Math.PI / 2 + (Math.PI * 2 - bandArc) / 2

  const bandMaterial = useRef<THREE.MeshPhysicalMaterial>(null)
  const texture = useLiveCanvasTexture()

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
    <group {...groupProps}>
      {/* Outer body */}
      <mesh castShadow material={ceramic}>
        <cylinderGeometry args={[radius, radius, height, 96, 1, true]} />
      </mesh>
      {/* Print band: sits a hair outside the body so it wins the depth test */}
      <mesh>
        <cylinderGeometry args={[radius + 0.0012, radius + 0.0012, bandHeight, 128, 1, true, bandStart, bandArc]} />
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
      {/* Inside wall */}
      <mesh>
        <cylinderGeometry args={[radius - wall, radius - wall, height - wall, 96, 1, true]} />
        <meshPhysicalMaterial attach="material" color={spec.color} roughness={0.35} side={THREE.BackSide} />
      </mesh>
      {/* Rim */}
      <mesh rotation-x={-Math.PI / 2} position-y={height / 2} material={ceramic}>
        <ringGeometry args={[radius - wall, radius, 96]} />
      </mesh>
      {/* Inside floor and outer base */}
      <mesh rotation-x={-Math.PI / 2} position-y={-height / 2 + wall * 2} material={ceramic}>
        <circleGeometry args={[radius - wall, 64]} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={-height / 2} material={ceramic}>
        <circleGeometry args={[radius, 64]} />
      </mesh>
      {/* Handle: half torus on the +X side */}
      <mesh castShadow rotation-z={-Math.PI / 2} position-x={radius - 0.035} material={ceramic}>
        <torusGeometry args={[height * 0.26, 0.045, 20, 48, Math.PI]} />
      </mesh>
    </group>
  )
}

/**
 * A CanvasTexture over the shared print canvas that re-uploads whenever the
 * editor redraws. Reads the store inside the frame loop, so drags never re-render React.
 */
function useLiveCanvasTexture() {
  const canvas = useDesignStore((s) => s.printCanvas)
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    if (!canvas) return null
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = Math.min(8, maxAnisotropy)
    return tex
  }, [canvas, maxAnisotropy])
  useEffect(() => () => texture?.dispose(), [texture])

  const seen = useRef({ version: -1, width: 0, height: 0 })
  useFrame(() => {
    if (!texture || !canvas) return
    const { printVersion } = useDesignStore.getState()
    const last = seen.current
    if (canvas.width !== last.width || canvas.height !== last.height) {
      // Backing canvas was resized: drop the GPU copy so it is re-allocated at the new size.
      texture.dispose()
      last.width = canvas.width
      last.height = canvas.height
      last.version = -1
    }
    if (printVersion !== last.version) {
      texture.needsUpdate = true
      last.version = printVersion
    }
  })

  return texture
}

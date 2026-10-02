import { useEffect, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { printBase, type ChosenOptions, type TeeSpec } from '../config/products'
import { TEE_DEPTH_IN, TEE_SLEEVE_IN, UNITS_PER_INCH } from './dimensions'
import { useLiveCanvasTexture } from './useLiveCanvasTexture'

type Props = {
  spec: TeeSpec
  options: ChosenOptions
  bandProps?: ThreeElements['mesh']
} & ThreeElements['group']

const U = UNITS_PER_INCH

/**
 * The tee's outline in inches: x from the center, y down from the collar line. `dip` is how
 * deep the neckline goes (the front dips more than the back).
 */
function teeOutline(spec: TeeSpec, dip: number) {
  const half = spec.shirt.widthIn / 2
  const L = spec.shirt.lengthIn
  const sleeve = half + TEE_SLEEVE_IN
  // Right half, from the neckline's middle down around to the hem's middle.
  const right: [number, number][] = [
    [3.3, 0],
    [half - 2.2, 0.9],
    [sleeve, 6.2],
    [sleeve - 2.4, 10.4],
    [half, 8.6],
    [half + 0.3, L],
  ]
  const s = new THREE.Shape()
  // Shape coordinates: y up, centered on the shirt's middle.
  const P = (x: number, y: number) => new THREE.Vector2(x * U, (L / 2 - y) * U)
  s.moveTo(P(0, L).x, P(0, L).y)
  for (const [x, y] of [...right].reverse()) s.lineTo(P(x, y).x, P(x, y).y)
  s.quadraticCurveTo(P(0, dip * 2).x, P(0, dip * 2).y, P(-3.3, 0).x, P(-3.3, 0).y)
  for (const [x, y] of right.slice(1)) s.lineTo(P(-x, y).x, P(-x, y).y)
  s.lineTo(P(0, L).x, P(0, L).y)
  return s
}

/**
 * A puffy cartoon t-shirt, standing upright (front +Z), centered on its body. The print sits on
 * the front or the back panel; the fabric color shows wherever nothing is printed.
 */
export function TeeProduct({ spec, options, bandProps, ...groupProps }: Props) {
  const fabric = printBase(spec, options).color
  const back = options.side === 'back'
  const texture = useLiveCanvasTexture(spec.id)

  const depth = TEE_DEPTH_IN * U
  const bevel = depth * 0.45
  const { body, neck } = useMemo(() => {
    const extrude = (dip: number) => {
      const g = new THREE.ExtrudeGeometry(teeOutline(spec, dip), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel * 0.8,
        bevelSegments: 5,
        curveSegments: 12,
      })
      g.translate(0, 0, -depth / 2)
      return g
    }
    // The inside of the back of the neck, showing through the front's deeper neckline.
    return { body: extrude(1.2), neck: extrude(0.35) }
  }, [spec, depth, bevel])
  useEffect(
    () => () => {
      body.dispose()
      neck.dispose()
    },
    [body, neck],
  )

  const surfaceZ = depth / 2 + bevel + 0.002
  const printY = (spec.shirt.lengthIn / 2 - spec.printTopIn - spec.print.heightIn / 2) * U
  const shade = useMemo(() => new THREE.Color(fabric).multiplyScalar(0.8), [fabric])

  return (
    <group name={spec.id} {...groupProps}>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial color={fabric} roughness={0.95} />
      </mesh>
      <mesh geometry={neck} scale={[0.96, 0.995, 0.6]}>
        <meshStandardMaterial color={shade} roughness={0.95} />
      </mesh>
      <mesh
        position={[0, printY, back ? -surfaceZ : surfaceZ]}
        rotation-y={back ? Math.PI : 0}
        name="print-band"
        visible={!!texture}
        {...bandProps}
      >
        <planeGeometry args={[spec.print.widthIn * U, spec.print.heightIn * U]} />
        {/* A new texture needs a new material (map support is compiled in when it's built). */}
        <meshStandardMaterial key={texture?.uuid ?? 'none'} map={texture} transparent roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

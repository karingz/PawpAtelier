import { useEffect, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import type { CaseSpec, ChosenOptions, Cutout } from '../config/products'
import { UNITS_PER_INCH } from './dimensions'
import { useLiveCanvasTexture } from './useLiveCanvasTexture'

type Props = {
  spec: CaseSpec
  options: ChosenOptions
  bandProps?: ThreeElements['mesh']
} & ThreeElements['group']

const U = UNITS_PER_INCH

/** A rounded rectangle centered on the origin. */
function roundedRect<T extends THREE.Path>(path: T, w: number, h: number, r: number, cx = 0, cy = 0): T {
  const x = cx - w / 2
  const y = cy - h / 2
  r = Math.min(r, w / 2, h / 2)
  path.moveTo(x + r, y)
  path.lineTo(x + w - r, y)
  path.quadraticCurveTo(x + w, y, x + w, y + r)
  path.lineTo(x + w, y + h - r)
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  path.lineTo(x + r, y + h)
  path.quadraticCurveTo(x, y + h, x, y + h - r)
  path.lineTo(x, y + r)
  path.quadraticCurveTo(x, y, x + r, y)
  return path
}

/** Print inches (x right, y down from the top-left, seen from behind) to local units. */
const toLocal = (spec: CaseSpec, x: number, y: number): [number, number] => [(x - spec.print.widthIn / 2) * U, (spec.print.heightIn / 2 - y) * U]

function cutoutPath(spec: CaseSpec, c: Cutout) {
  const p = new THREE.Path()
  if (c.kind === 'circle') {
    const [x, y] = toLocal(spec, c.x, c.y)
    p.absarc(x, y, c.r * U, 0, Math.PI * 2, true)
    return p
  }
  const [x, y] = toLocal(spec, c.x + c.w / 2, c.y + c.h / 2)
  return roundedRect(p, c.w * U, c.h * U, c.r * U, x, y)
}

/**
 * A phone case seen from behind (the printed back faces +Z), centered on its body, with the phone
 * inside: its screen on the front, its camera showing through the cutouts. A clear case is
 * see-through, so the phone's color shows wherever nothing is printed.
 */
export function CaseProduct({ spec, options, bandProps, ...groupProps }: Props) {
  const w = spec.print.widthIn * U
  const h = spec.print.heightIn * U
  const d = spec.body.depthIn * U
  const r = spec.body.cornerIn * U
  const clear = options.finish === 'clear'
  const texture = useLiveCanvasTexture(spec.id)

  const { shell, print } = useMemo(() => {
    const outline = roundedRect(new THREE.Shape(), w, h, r)
    outline.holes = spec.cutouts.map((c) => cutoutPath(spec, c))
    const bevel = d * 0.25
    const shell = new THREE.ExtrudeGeometry(outline, { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 3, curveSegments: 16 })
    shell.translate(0, 0, -(d - bevel * 2) / 2)
    // The printed back: the outline minus the cutouts, with UVs spanning the whole print area.
    const print = new THREE.ShapeGeometry(outline, 24)
    const pos = print.attributes.position
    const uv = print.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5)
    uv.needsUpdate = true
    return { shell, print }
  }, [spec, w, h, d, r])
  useEffect(
    () => () => {
      shell.dispose()
      print.dispose()
    },
    [shell, print],
  )

  const inset = d * 0.18
  return (
    <group name={spec.id} {...groupProps}>
      <mesh geometry={shell} castShadow>
        {clear ? (
          <meshPhysicalMaterial color="#f4f8ff" roughness={0.12} transparent opacity={0.28} depthWrite={false} />
        ) : (
          <meshStandardMaterial color={spec.color} roughness={0.92} />
        )}
      </mesh>
      {/* The printed back, a hair outside the shell (once there is a print to show). A new
          texture needs a new material: three.js compiles map and transparency support in only when it's built. */}
      <mesh geometry={print} position-z={d / 2 + 0.0015} name="print-band" visible={!!texture} {...bandProps}>
        <meshStandardMaterial
          key={`${texture?.uuid ?? 'none'}-${clear}`}
          map={texture}
          transparent={clear}
          roughness={clear ? 0.2 : 0.9}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* The phone inside: its back (seen through a clear case and the cutouts) and its screen */}
      <mesh>
        <boxGeometry args={[w - inset * 2, h - inset * 2, d - inset * 2]} />
        <meshStandardMaterial color={spec.phoneColor} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position-z={-d / 2 - 0.001} rotation-y={Math.PI}>
        <planeGeometry args={[w - inset * 2.2, h - inset * 2.2]} />
        <meshStandardMaterial color="#14161a" roughness={0.15} />
      </mesh>
      {spec.lenses.map((l, i) => {
        const [x, y] = toLocal(spec, l.x, l.y)
        return (
          <group key={i} position={[x, y, d / 2 - inset * 0.6]} rotation-x={Math.PI / 2}>
            <mesh>
              <cylinderGeometry args={[l.r * U, l.r * U, inset * 1.6, 28]} />
              <meshStandardMaterial color="#8d9096" roughness={0.3} metalness={0.8} />
            </mesh>
            <mesh position-y={inset * 0.81}>
              <cylinderGeometry args={[l.r * U * 0.72, l.r * U * 0.72, 0.002, 28]} />
              <meshStandardMaterial color="#0c0d12" roughness={0.05} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

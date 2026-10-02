import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ZoneId } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { zoneOfMesh, type PlaceholderDef, type RoomDef } from './rooms'
import type { LoadedRoom } from './useRoom'

/** Pointer travel (px) beyond which a press is a drag, not a tap. */
const TAP_SLOP = 6

/**
 * The room itself. In the shop view, tapping furniture that belongs to a zone (shelves,
 * cabinet, dress form) flies the camera to that zone.
 */
export function Room({ room, loaded }: { room: RoomDef; loaded: LoadedRoom }) {
  const view = useDesignStore((s) => s.view)
  const zone = useUiStore((s) => s.zone)
  const setZone = useUiStore((s) => s.setZone)
  const dom = useThree((s) => s.gl.domElement)
  const { rigs, hovered } = useZoneMotion(room, loaded, view === 'shop', zone)

  // A zone you can go to from here (not the one you're already in). Only the nearest thing
  // under the pointer counts: events also reach the meshes behind it (the wall, say).
  const target = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (e.object !== e.intersections[0]?.object) return hovered.current
    const z = view === 'shop' ? zoneOfMesh(room, e.object.name) : null
    return z && z !== zone ? z : null
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > TAP_SLOP || e.object !== e.intersections[0]?.object) return
    const z = target(e)
    if (!z) return
    e.stopPropagation()
    rigs.get(z)?.kick(-9) // squash pop as the camera takes off
    dom.style.cursor = ''
    setZone(z)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const z = target(e)
    if (z === hovered.current) return
    hovered.current = z
    dom.style.cursor = z ? 'pointer' : ''
  }
  const onOut = () => {
    hovered.current = null
    dom.style.cursor = ''
  }

  useHideBlockers(room, loaded)

  return (
    <group>
      <group scale={room.scale} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut}>
        <primitive object={loaded.scene} />
      </group>
      {room.placeholders.map((p) => (
        <Placeholder key={p.marker} def={p} at={loaded.markers.get(p.marker)} yaw={loaded.viewYaw} />
      ))}
    </group>
  )
}

type ZoneRig = { kick: (v: number) => void }

/** Seconds between the idle "tap me" hops (zones take turns) while browsing the room. */
const IDLE_HOP_EVERY = 3.2
const GLOW = new THREE.Color('#ffb48c')

/**
 * Makes a zone's furniture feel touchable: on hover it glows warm and stretches up a little
 * (a springy squash about the zone's base), it pops when tapped, and in the room overview the
 * zones take turns giving a small idle hop so visitors see they can be tapped.
 */
function useZoneMotion(room: RoomDef, loaded: LoadedRoom, browsing: boolean, current: ZoneId | null) {
  const hovered = useRef<ZoneId | null>(null)
  const state = useMemo(() => {
    const zones = room.zones.map((z) => {
      const meshes: { mesh: THREE.Mesh; pos: THREE.Vector3; scale: THREE.Vector3; mats: THREE.MeshStandardMaterial[] }[] = []
      const box = new THREE.Box3()
      loaded.scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || zoneOfMesh(room, mesh.name) !== z.id) return
        // Own materials, so the glow doesn't light up every other wooden thing in the room.
        if (!mesh.userData.ownMaterial) {
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
          mesh.userData.ownMaterial = true
        }
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        mesh.updateMatrix()
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix))
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
        meshes.push({ mesh, pos: mesh.position.clone(), scale: mesh.scale.clone(), mats })
      })
      // Squash about the bottom center of the zone's furniture (in the room's own space).
      const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
      return { id: z.id, meshes, pivot, x: 0, v: 0, glow: 0, still: true }
    })
    const rigs = new Map<ZoneId, ZoneRig>(
      zones.map((z) => [
        z.id,
        {
          kick: (v: number) => {
            z.v += v
            z.still = false
          },
        },
      ]),
    )
    return { zones, rigs, nextHop: IDLE_HOP_EVERY, turn: 0 }
  }, [room, loaded])

  const k = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 1 / 30)
    // Idle hint: one zone at a time does a little hop while nothing is hovered.
    if (browsing && current === null && !hovered.current && clock.elapsedTime > state.nextHop) {
      state.zones[state.turn % state.zones.length].v += 3.5
      state.zones[state.turn % state.zones.length].still = false
      state.turn++
      state.nextHop = clock.elapsedTime + IDLE_HOP_EVERY
    } else if (hovered.current) {
      state.nextHop = clock.elapsedTime + IDLE_HOP_EVERY
    }
    for (const z of state.zones) {
      const on = browsing && hovered.current === z.id ? 1 : 0
      if (z.still && !on && z.glow === 0) continue
      // Underdamped spring: overshoots into a little wobble (like the products' hover).
      z.v += (180 * (on - z.x) - 9 * z.v) * dt
      z.x += z.v * dt
      z.glow += (on - z.glow) * Math.min(1, dt * 10)
      const settled = !on && Math.abs(z.x) < 1e-3 && Math.abs(z.v) < 1e-3 && z.glow < 1e-3
      if (settled) {
        z.x = z.v = z.glow = 0
        z.still = true
      }
      k.set(1 - 0.012 * z.x, 1 + 0.03 * z.x, 1 - 0.012 * z.x)
      for (const m of z.meshes) {
        m.mesh.position.copy(m.pos).sub(z.pivot).multiply(k).add(z.pivot)
        m.mesh.scale.copy(m.scale).multiply(k)
        for (const mat of m.mats) {
          if (!mat.emissive) continue
          mat.emissive.copy(GLOW)
          mat.emissiveIntensity = 0.25 * z.glow
        }
      }
    }
  })

  return { rigs: state.rigs, hovered }
}

/**
 * Hides props (e.g. the pendant lamp) while they sit in the middle of the view, so close-up
 * framings of a zone or the workbench aren't blocked. A prop group hides together.
 */
function useHideBlockers(room: RoomDef, loaded: LoadedRoom) {
  const groups = useMemo(
    () =>
      room.hideWhenBlocking.map((prefix) => {
        const meshes: THREE.Mesh[] = []
        loaded.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.name.startsWith(prefix)) meshes.push(o as THREE.Mesh)
        })
        return meshes
      }),
    [room, loaded],
  )
  const ray = useMemo(() => new THREE.Ray(), [])
  const sphere = useMemo(() => new THREE.Sphere(), [])
  useFrame(({ camera }) => {
    camera.getWorldDirection(ray.direction)
    ray.origin.copy(camera.position)
    for (const meshes of groups) {
      const blocking = meshes.some((m) => {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
        sphere.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld)
        // A cone around the view axis (a bit wider than the prop) counts as "in the way".
        sphere.radius = sphere.radius * 1.3 + 0.12 * ray.origin.distanceTo(sphere.center)
        return ray.intersectsSphere(sphere)
      })
      for (const m of meshes) m.visible = !blocking
    }
  })
}

/** Stand-ins for products that aren't editable yet (tee, phone cases). Tapping goes to their zone. */
function Placeholder({ def, at, yaw }: { def: PlaceholderDef; at?: THREE.Vector3; yaw: number }) {
  const view = useDesignStore((s) => s.view)
  const setZone = useUiStore((s) => s.setZone)
  const color = useMemo(() => (def.label.includes('iPhone') ? '#f4b6c6' : '#9bbf9a'), [def])
  if (!at) return null
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (view !== 'shop' || e.delta > TAP_SLOP) return
    e.stopPropagation()
    setZone(def.zone)
  }
  // The display tee is modeled on the dress form in the room itself (dressform_tee*).
  if (def.kind === 'tee') return null
  // Phone case standing on the cabinet's display tray, leaning back a little.
  return (
    <group position={at} rotation-y={yaw} onClick={onClick}>
      <RoundedBox args={[0.75, 1.55, 0.12]} radius={0.06} position-y={0.78} rotation-x={-0.18}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </RoundedBox>
    </group>
  )
}

/** Soft round shadow under a product (cheap, follows it around). */
export function BlobShadow({ radius }: { radius: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(59,47,47,0.35)')
    grad.addColorStop(1, 'rgba(59,47,47,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.02} renderOrder={1}>
      <planeGeometry args={[radius * 2.6, radius * 2.6]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

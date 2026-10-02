import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useDesignStore } from '../store/designStore'
import { useClerkStore } from './clerkStore'
import { askLeah, hello } from './script'

const URL = '/clerk/leah.glb'
const DRACO = '/draco/'
/** The model is in meters; the scene uses 10 cm units. */
const SCALE = 10
/** How far her head turns from her body toward the visitor (radians). */
const HEAD_TURN = 0.7

/**
 * Leah lying on her counter (art/scripts/leah_model.py). She breathes, turns her head toward
 * the visitor, wags her tail (harder while talking or hovered), and nods with a little hop when
 * she starts a new line. Tap her for help.
 */
export function ClerkLeah({ at, yaw }: { at: THREE.Vector3; yaw: number }) {
  const { scene } = useGLTF(URL, DRACO)
  const dom = useThree((s) => s.gl.domElement)
  const parts = useMemo(() => {
    const get = (name: string) => scene.getObjectByName(name)
    const body = get('leah_body')
    const head = get('leah_head')
    const tail = get('leah_tail')
    const earL = get('leah_ear_l')
    const earR = get('leah_ear_r')
    return {
      body,
      head,
      tail,
      earL,
      earR,
      rest: {
        head: head?.rotation.clone(),
        tail: tail?.rotation.clone(),
        earL: earL?.rotation.clone(),
        earR: earR?.rotation.clone(),
      },
    }
  }, [scene])

  const root = useRef<THREE.Group>(null)
  const hovered = useRef(false)
  const m = useMemo(
    () => ({ talk: useClerkStore.getState().talk, hop: 0, hopV: 0, nod: 0, nodV: 0, headYaw: 0, earV: 0, ear: 0, wag: 0, excite: 0 }),
    [],
  )
  const local = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, clock }, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const t = clock.elapsedTime
    const { body, head, tail, earL, earR, rest } = parts

    // A new line: hop and nod (kicks on two springs).
    const talk = useClerkStore.getState().talk
    if (talk !== m.talk) {
      m.talk = talk
      m.hopV += 6
      m.nodV += 7
    }
    m.hopV += (-160 * m.hop - 12 * m.hopV) * dt
    m.hop += m.hopV * dt
    m.nodV += (-120 * m.nod - 9 * m.nodV) * dt
    m.nod += m.nodV * dt
    const talking = useClerkStore.getState().lines.length > 0
    m.excite += ((talking || hovered.current ? 1 : 0) - m.excite) * Math.min(1, dt * 3)

    if (root.current) root.current.position.y = Math.max(0, m.hop) * 0.25
    // Breathing.
    if (body) body.scale.set(1 + Math.sin(t * 2.2) * 0.012, 1 + Math.sin(t * 2.2) * 0.02, 1)

    if (head && rest.head && root.current) {
      // Turn toward the camera (in her own frame), within what a neck can do.
      local.copy(camera.position)
      root.current.worldToLocal(local)
      const want = THREE.MathUtils.clamp(Math.atan2(local.x - head.position.x, local.z - head.position.z), -HEAD_TURN, HEAD_TURN)
      const prev = m.headYaw
      m.headYaw += (want - m.headYaw) * Math.min(1, dt * 3)
      head.rotation.set(
        rest.head.x + m.nod * 0.12 + Math.sin(t * 0.9) * 0.03,
        rest.head.y + m.headYaw,
        rest.head.z + Math.sin(t * 0.7) * 0.08, // a curious tilt now and then
      )
      // Ears lag behind head moves and settle with a flop.
      m.earV += (-(m.ear - (m.headYaw - prev) * 18 - m.nodV * 0.02) * 90 - 7 * m.earV) * dt
      m.ear += m.earV * dt
    }
    const sway = Math.sin(t * 1.6) * 0.04
    if (earL && rest.earL) earL.rotation.set(rest.earL.x + m.ear * 0.5, rest.earL.y, rest.earL.z + sway + Math.abs(m.ear) * 0.3)
    if (earR && rest.earR) earR.rotation.set(rest.earR.x + m.ear * 0.5, rest.earR.y, rest.earR.z - sway - Math.abs(m.ear) * 0.3)

    if (tail && rest.tail) {
      m.wag += dt * (5 + m.excite * 9)
      tail.rotation.set(rest.tail.x + 0.1 + m.excite * 0.15, rest.tail.y + Math.sin(m.wag) * (0.2 + m.excite * 0.35), rest.tail.z)
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    if (useDesignStore.getState().view === 'edit') askLeah()
    else useClerkStore.getState().say(hello())
  }

  return (
    <group position={at} rotation-y={yaw}>
      <group ref={root} scale={SCALE}>
        <primitive
          object={scene}
          onClick={onClick}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            hovered.current = true
            dom.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            hovered.current = false
            dom.style.cursor = ''
          }}
        />
      </group>
    </group>
  )
}

useGLTF.preload(URL, DRACO)

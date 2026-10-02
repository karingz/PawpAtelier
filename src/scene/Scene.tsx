import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import type { Scene as ThreeScene, WebGLRenderer } from 'three'
import { PRODUCTS } from '../config/products'
import { log } from '../debug/log'
import { ClerkLeah } from '../clerk/ClerkLeah'
import { Room } from '../room/Room'
import { ATELIER } from '../room/rooms'
import { useRoom } from '../room/useRoom'
import { useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { CameraRig, type Framing } from './CameraRig'
import { productSize } from './dimensions'
import { ProductSlot } from './ProductSlot'

const ROOM = ATELIER

type Props = {
  onReady?: () => void
  /** Fractions of the view covered by UI (shop picker, edit dock), which framing avoids. */
  bottomInset?: number
  leftInset?: number
}

export function Scene({ onReady, bottomInset = 0, leftInset = 0 }: Props) {
  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      camera={{ position: [40, 30, 40], fov: 30, near: 0.5, far: 400 }}
      gl={{ antialias: true }}
      onCreated={({ gl, scene }) => {
        logRenderer(gl)
        exposeForDebugging(scene)
      }}
    >
      <color attach="background" args={['#f6efe6']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 40, 25]} intensity={1.1} />

      {/* Soft studio env built from light cards, so nothing is fetched at runtime */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} position={[0, 3, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 0.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} color="#ffe2d6" />
        <Lightformer form="circle" intensity={1.5} position={[0, 1, -4]} scale={2} />
      </Environment>

      <Suspense fallback={null}>
        <Shop bottomInset={bottomInset} leftInset={leftInset} />
        {/* Inside Suspense: the loading screen waits for the room to be drawn. */}
        <FirstFrame onReady={onReady} />
      </Suspense>
    </Canvas>
  )
}

/** The room with its products, and the camera framing for where the visitor is. */
function Shop({ bottomInset, leftInset }: { bottomInset: number; leftInset: number }) {
  const loaded = useRoom(ROOM)
  const view = useDesignStore((s) => s.view)
  const productId = useDesignStore((s) => s.productId)
  const zone = useUiStore((s) => s.zone)
  const atCounter = useUiStore((s) => s.atCounter)
  const { markers, viewDir, viewYaw } = loaded
  const dir = viewDir.toArray() as [number, number, number]
  const workbench = markers.get('workbench') ?? new THREE.Vector3()
  const desk = markers.get('counter') ?? workbench
  const clerk = markers.get('clerk')
  // Customized at the workbench; brought to Leah's desk for the order.
  const stage = view === 'edit' && atCounter ? desk : workbench

  const framing = useMemo<Framing>(() => {
    const active = PRODUCTS.find((p) => p.id === productId)
    if (view === 'edit' && active && atCounter) {
      // The product on the desk with Leah behind it.
      const c = clerk ? desk.clone().lerp(clerk, 0.5) : desk.clone()
      return { key: 'counter', center: [c.x, desk.y + 1.8, c.z], width: 10, height: 7, dir, insetBottom: bottomInset }
    }
    if (view === 'edit' && active) {
      const { width, height } = productSize(active)
      return {
        key: `edit:${active.id}`,
        center: [stage.x, stage.y + height / 2, stage.z],
        width: width * 1.5,
        height: height * 1.45,
        dir,
        insetBottom: bottomInset,
        insetLeft: leftInset,
      }
    }
    const z = ROOM.zones.find((x) => x.id === zone)
    const zc = z && markers.get(z.marker)
    if (z && zc) {
      const center = zc.clone().add(new THREE.Vector3(...(z.shift ?? [0, 0, 0])))
      return { key: `zone:${z.id}`, center: center.toArray() as [number, number, number], width: z.size[0], height: z.size[1], dir: z.view, insetBottom: bottomInset }
    }
    const target = markers.get('room_target') ?? new THREE.Vector3(0, 8, 0)
    return { key: 'room', center: target.toArray() as [number, number, number], width: 46, height: 30, dir, insetBottom: bottomInset }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dir/stage derive from `loaded`
  }, [view, productId, zone, atCounter, loaded, bottomInset, leftInset])

  return (
    <>
      <CameraRig framing={framing} zoomable={view === 'edit' && !atCounter} />
      <Room room={ROOM} loaded={loaded} />
      {/* Her body lies along the counter (so her long back shows); her head turns to the visitor. */}
      {clerk && <ClerkLeah at={clerk} yaw={viewYaw - 0.75} />}
      {PRODUCTS.map((spec) => {
        const slot = ROOM.slots[spec.id]
        const home = slot && markers.get(slot.marker)
        if (!home) return null
        return <ProductSlot key={spec.id} spec={spec} home={home} stage={stage} viewYaw={viewYaw} homeYaw={slot.yaw} homeShadow={!slot.hangs} />
      })}
    </>
  )
}

/** Calls onReady once, after the first frame has actually been rendered. */
function FirstFrame({ onReady }: { onReady?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    requestAnimationFrame(() => onReady?.())
  })
  return null
}

function logRenderer(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  const info = ctx.getExtension('WEBGL_debug_renderer_info')
  log.info('scene', 'WebGL ready', {
    webgl2: gl.capabilities.isWebGL2,
    gpu: info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown',
    maxTexture: gl.capabilities.maxTextureSize,
    pixelRatio: gl.getPixelRatio(),
  })
  gl.domElement.addEventListener('webglcontextlost', () => log.error('scene', 'WebGL context lost'))
}

/** Dev only: `__pawpScene` in the browser console to inspect the three.js scene. */
function exposeForDebugging(scene: ThreeScene) {
  if (import.meta.env.DEV) Object.assign(window, { __pawpScene: scene })
}

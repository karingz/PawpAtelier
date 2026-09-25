import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, RoundedBox } from '@react-three/drei'
import type { Scene as ThreeScene, WebGLRenderer } from 'three'
import { PRODUCTS, type ProductSpec } from '../config/products'
import { log } from '../debug/log'
import { useDesignStore } from '../store/designStore'
import { CameraRig, type Framing } from './CameraRig'
import { cylinderSize } from './dimensions'
import { ProductSlot } from './ProductSlot'

/** Space between neighbouring products on the table, in scene units. */
const GAP = 0.7
const TABLE_DEPTH = 1.3

type Placed = { spec: ProductSpec; x: number; width: number; height: number; rest: [number, number] }

/** Line the products up along X, centered on the origin, bases at y = 0. */
function layoutProducts(products: ProductSpec[]): { placed: Placed[]; span: number; tallest: number } {
  const sized = products.map((spec) => ({ spec, ...cylinderSize(spec) }))
  const span = sized.reduce((sum, p) => sum + p.width, 0) + GAP * (sized.length - 1)
  let x = -span / 2
  const placed = sized.map((p) => {
    const item: Placed = {
      spec: p.spec,
      x: x + p.width / 2,
      width: p.width,
      height: p.height,
      // Print center to the front; a mug turns a little so its handle peeks out on the right.
      rest: [0.06, Math.PI / 2 - (p.spec.handle ? 0.8 : 0)],
    }
    x += p.width + GAP
    return item
  })
  return { placed, span, tallest: Math.max(...sized.map((p) => p.height)) }
}

type Props = {
  onReady?: () => void
  /** Fraction of the view covered by UI at the bottom (the shop picker). */
  bottomInset?: number
}

export function Scene({ onReady, bottomInset = 0 }: Props) {
  const view = useDesignStore((s) => s.view)
  const productId = useDesignStore((s) => s.productId)
  const { placed, span, tallest } = useMemo(() => layoutProducts(PRODUCTS), [])

  const framing = useMemo<Framing>(() => {
    const active = placed.find((p) => p.spec.id === productId)
    if (view === 'edit' && active) {
      return {
        key: `edit:${active.spec.id}`,
        center: [active.x, active.height / 2, 0],
        width: active.width * 1.5,
        height: active.height * 1.45,
      }
    }
    return {
      key: 'shop',
      center: [0, tallest * 0.45, 0],
      width: span + 0.4,
      height: tallest + 0.4,
      insetBottom: bottomInset,
    }
  }, [view, productId, placed, span, tallest, bottomInset])

  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      camera={{ position: [0, 1, 6], fov: 30 }}
      gl={{ antialias: true }}
      onCreated={({ gl, scene }) => {
        logRenderer(gl)
        exposeForDebugging(scene)
      }}
    >
      <color attach="background" args={['#f6efe6']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />

      {/* Soft studio env built from light cards, so nothing is fetched at runtime */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} position={[0, 3, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 0.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} color="#ffe2d6" />
        <Lightformer form="circle" intensity={1.5} position={[0, 1, -4]} scale={2} />
      </Environment>

      <CameraRig framing={framing} zoomable={view === 'edit'} />

      {placed.map((p) => (
        <ProductSlot key={p.spec.id} spec={p.spec} position={[p.x, 0, 0]} rest={p.rest} />
      ))}

      {/* Placeholder table until the baked Blender room lands (Phase 3) */}
      <RoundedBox args={[span + 1.2, 0.08, TABLE_DEPTH]} radius={0.03} position-y={-0.04}>
        <meshStandardMaterial color="#e2c29f" roughness={0.85} />
      </RoundedBox>
      <ContactShadows position-y={0.001} scale={[span + 1.2, TABLE_DEPTH]} opacity={0.4} blur={2.2} far={1.5} />

      <FirstFrame onReady={onReady} />
    </Canvas>
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

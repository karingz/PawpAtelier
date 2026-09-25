import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import type { Scene as ThreeScene, WebGLRenderer } from 'three'
import type { MugSpec } from '../config/products'
import { log } from '../debug/log'
import { IdleFloat } from './IdleFloat'
import { Mug } from './Mug'
import { SpringyControls } from './SpringyControls'

type Props = { spec: MugSpec }

export function Scene({ spec }: Props) {
  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 3.2], fov: 30 }}
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

      <SpringyControls rest={[0.08, Math.PI / 2 - 0.4]}>
        <IdleFloat>
          <Mug spec={spec} />
        </IdleFloat>
      </SpringyControls>

      <ContactShadows position={[0, -0.6, 0]} opacity={0.35} scale={3} blur={2.4} far={1.2} />
    </Canvas>
  )
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

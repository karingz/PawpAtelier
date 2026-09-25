import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

type Props = {
  children: ReactNode
  speed?: number
  /** Peak bob height in scene units. */
  height?: number
  /** Scales the gentle sway rotation. */
  sway?: number
}

/**
 * Gentle idle bob and sway, same motion as drei's <Float>. drei drives it from total elapsed
 * time, which keeps running while the tab is hidden, so the object jumps when you come back.
 * This keeps its own clock that only advances with rendered frames, so it resumes smoothly.
 */
export function IdleFloat({ children, speed = 1.6, height = 0.0105, sway = 0.15 }: Props) {
  const group = useRef<Group>(null)
  const t = useRef(Math.random() * 100)

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    t.current += Math.min(delta, 1 / 30)
    const phase = (t.current / 4) * speed
    g.rotation.set((Math.cos(phase) / 8) * sway, (Math.sin(phase) / 8) * sway, (Math.sin(phase) / 20) * sway)
    g.position.y = Math.sin(phase) * height
  })

  return <group ref={group}>{children}</group>
}

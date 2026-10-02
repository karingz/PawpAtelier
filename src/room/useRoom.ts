import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { RoomDef } from './rooms'

/** Draco decoder, self-hosted (copied from three's examples into public/draco). */
const DRACO = '/draco/'

export type LoadedRoom = {
  scene: THREE.Group
  /** Marker positions (scene units) by name: slots, zones, workbench, desk, clerk, … */
  markers: Map<string, THREE.Vector3>
  /** Direction from what the room camera looks at toward the camera (the Blender shot). */
  viewDir: THREE.Vector3
  /** Yaw of that direction around +Y (radians): products turn by this to face the camera. */
  viewYaw: number
}

/** Load a room GLB and read its named empties (positions scaled into scene units). */
export function useRoom(room: RoomDef): LoadedRoom {
  const { scene } = useGLTF(room.url, DRACO)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const markers = new Map<string, THREE.Vector3>()
    scene.traverse((o) => {
      if (o.name) markers.set(o.name, o.getWorldPosition(new THREE.Vector3()).multiplyScalar(room.scale))
    })
    const cam = markers.get('cam_room_landscape')
    const target = markers.get('room_target')
    const viewDir = cam && target ? cam.clone().sub(target).normalize() : new THREE.Vector3(0, 0.16, 1).normalize()
    return { scene, markers, viewDir, viewYaw: Math.atan2(viewDir.x, viewDir.z) }
  }, [scene, room.scale])
}

/** Start downloading a room before it's needed. */
export const preloadRoom = (room: RoomDef) => useGLTF.preload(room.url, DRACO)

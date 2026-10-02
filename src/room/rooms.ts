import type { ZoneId } from '../config/products'

/** A zone of a room: where the camera goes and which room meshes belong to it (tap = go there). */
export type ZoneDef = {
  id: ZoneId
  label: string
  /** Marker (empty) at the zone's center. */
  marker: string
  /** Area to frame, in scene units (width, height). */
  size: [number, number]
  /** Direction from the zone toward the camera (scene axes); a straight-on look at its wall. */
  view: [number, number, number]
  /** Shift of the framed center from the marker (scene units), e.g. to keep an open side out of view. */
  shift?: [number, number, number]
  /** Room mesh names starting with these belong to the zone. */
  meshPrefixes: string[]
}

/** Where a product rests in the room. */
export type SlotDef = {
  marker: string
  /** Face this way at home (absolute yaw, radians) instead of the camera, e.g. flat on a wall. */
  yaw?: number
  /** Hangs (no contact shadow at home). */
  hangs?: boolean
}

/** Not-yet-available products shown in the room ("coming soon"). */
export type PlaceholderDef = { marker: string; kind: 'tee' | 'phone-case'; zone: ZoneId; label: string }

export type RoomDef = {
  id: string
  name: string
  url: string
  /** Blender meters → scene units (1 unit = 10 cm). */
  scale: number
  zones: ZoneDef[]
  /** Product id → where it rests. */
  slots: Record<string, SlotDef>
  placeholders: PlaceholderDef[]
  /** Props (by name prefix) hidden while they block the camera's view, e.g. a hanging lamp. */
  hideWhenBlocking: string[]
}

export const ATELIER: RoomDef = {
  id: 'atelier',
  name: 'Pawp Atelier',
  url: '/rooms/atelier.glb',
  scale: 10,
  zones: [
    { id: 'drinkware', label: 'Mugs & Tumblers', marker: 'zone_drinkware', size: [15, 11], view: [0.15, 0.3, 1], meshPrefixes: ['shelf_'] },
    { id: 'apparel', label: 'T-shirts', marker: 'zone_apparel', size: [16, 12], view: [1, 0.3, 0.6], meshPrefixes: ['dressform', 'peg'] },
    { id: 'accessories', label: 'Phone cases', marker: 'zone_accessories', size: [11, 12], view: [-0.1, 0.35, 1], shift: [-3.5, 0, 0], meshPrefixes: ['cabinet', 'drawer'] },
  ],
  slots: {
    'mug-11oz': { marker: 'slot_mug_1' },
    'tumbler-20oz': { marker: 'slot_tumbler_1' },
    // Hangs flat on the pegboard (left wall), facing into the room.
    'tee-classic': { marker: 'slot_tee_peg', yaw: Math.PI / 2, hangs: true },
    'case-iphone-18-pro': { marker: 'slot_case_iphone' },
    'case-galaxy-s26-ultra': { marker: 'slot_case_galaxy' },
  },
  placeholders: [],
  hideWhenBlocking: ['lamp_'],
}

export function zoneOfMesh(room: RoomDef, meshName: string): ZoneId | null {
  return room.zones.find((z) => z.meshPrefixes.some((p) => meshName.startsWith(p)))?.id ?? null
}

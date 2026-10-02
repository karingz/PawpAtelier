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

/** Not-yet-available products shown in the room (R3 makes them real). */
export type PlaceholderDef = { marker: string; kind: 'tee' | 'phone-case'; zone: ZoneId; label: string }

export type RoomDef = {
  id: string
  name: string
  url: string
  /** Blender meters → scene units (1 unit = 10 cm). */
  scale: number
  zones: ZoneDef[]
  /** Product id → slot marker it rests on. */
  slots: Record<string, string>
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
    { id: 'apparel', label: 'T-shirts', marker: 'zone_apparel', size: [11, 15], view: [0.3, 0.3, 1], meshPrefixes: ['dressform', 'peg'] },
    { id: 'accessories', label: 'Phone cases', marker: 'zone_accessories', size: [11, 12], view: [-0.1, 0.35, 1], shift: [-3.5, 0, 0], meshPrefixes: ['cabinet', 'drawer'] },
  ],
  slots: { 'mug-11oz': 'slot_mug_1', 'tumbler-20oz': 'slot_tumbler_1' },
  placeholders: [
    { marker: 'slot_tee_1', kind: 'tee', zone: 'apparel', label: 'T-shirt' },
    { marker: 'slot_case_iphone', kind: 'phone-case', zone: 'accessories', label: 'iPhone case' },
    { marker: 'slot_case_galaxy', kind: 'phone-case', zone: 'accessories', label: 'Galaxy case' },
  ],
  hideWhenBlocking: ['lamp_'],
}

export function zoneOfMesh(room: RoomDef, meshName: string): ZoneId | null {
  return room.zones.find((z) => z.meshPrefixes.some((p) => meshName.startsWith(p)))?.id ?? null
}

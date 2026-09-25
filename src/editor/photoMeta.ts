// What a photo can tell us for the design: when and where it was taken, and whether it has
// enough pixels to print sharply at its current size.
//
// Privacy: location stays in the browser. Place names are only looked up when the user asks,
// which sends the coordinates to OpenStreetMap (Nominatim + Overpass).
// TODO(Phase 7): strip `meta` from designs/originals before they are uploaded with an order.

import exifr from 'exifr'
import { DESIGN_UNITS_PER_INCH } from '../config/products'
import { log } from '../debug/log'
import type { PhotoLayer } from '../store/designStore'

export type PhotoMeta = {
  /** Local wall-clock time the photo was taken, ISO without zone ("2024-08-24T18:12:58"). */
  takenAt?: string
  lat?: number
  lon?: number
}

const pad = (n: number) => String(n).padStart(2, '0')

function localIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Date taken and GPS position from the file's EXIF, if any. Never throws. */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    const data = await exifr.parse(file, { tiff: true, exif: true, gps: true, icc: false, iptc: false, xmp: false })
    if (!data) return {}
    const when: unknown = data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate
    const meta: PhotoMeta = {}
    if (when instanceof Date && !Number.isNaN(when.getTime())) meta.takenAt = localIso(when)
    if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude) && !(data.latitude === 0 && data.longitude === 0)) {
      meta.lat = data.latitude
      meta.lon = data.longitude
    }
    return meta
  } catch (err) {
    log.debug('meta', 'no readable EXIF', err)
    return {}
  }
}

// ---------------------------------------------------------------------------------------------
// Dates

const lang = () => navigator.language || 'en'

function season(month: number, southern: boolean) {
  const i = Math.floor(((month + 1) % 12) / 3) // 0 winter, 1 spring, 2 summer, 3 autumn (north)
  const k = southern ? (i + 2) % 4 : i
  return { en: ['Winter', 'Spring', 'Summer', 'Autumn'][k], ko: ['겨울', '봄', '여름', '가을'][k] }
}

/** Ready-to-print ways to write the date, most useful first, no duplicates. */
export function dateOptions(meta: PhotoMeta): string[] {
  if (!meta.takenAt) return []
  const d = new Date(meta.takenAt)
  const y = d.getFullYear()
  const s = season(d.getMonth(), (meta.lat ?? 1) < 0)
  const korean = lang().startsWith('ko')
  const options = [
    `${y}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    new Intl.DateTimeFormat(lang(), { dateStyle: 'long' }).format(d),
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d),
    korean ? `${y} ${s.ko}` : `${s.en} ${y}`,
    korean ? `${s.en} ${y}` : null,
  ]
  return [...new Set(options.filter((o): o is string => !!o))]
}

export function formatTakenAt(meta: PhotoMeta) {
  if (!meta.takenAt) return null
  return new Intl.DateTimeFormat(lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(meta.takenAt))
}

// ---------------------------------------------------------------------------------------------
// Places (OpenStreetMap; fair-use public APIs, see docs/PLAN.md go-live checklist)

const placeCache = new Map<string, Promise<string[]>>()

const NAMED_AREAS =
  'area.a[name][~"^(leisure|tourism|natural|landuse|amenity)$"~"^(park|garden|nature_reserve|beach|zoo|theme_park|dog_park|attraction|wood|forest|recreation_ground|camp_site)$"]'

/** Park or landmark areas that contain the point (Overpass), in the user's language if tagged. */
async function containingAreas(lat: number, lon: number): Promise<string[]> {
  const query = `[out:json][timeout:10];is_in(${lat},${lon})->.a;${NAMED_AREAS};out tags;`
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const { elements } = (await res.json()) as { elements: { tags: Record<string, string> }[] }
  const code = lang().split('-')[0]
  return elements.map((e) => e.tags[`name:${code}`] ?? e.tags.name).filter(Boolean)
}

/** Neighbourhood, city and country (Nominatim). */
async function address(lat: number, lon: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '16',
    'accept-language': `${lang()},en`,
  }).toString()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const { address: a = {} } = (await res.json()) as { address?: Record<string, string> }
  const area = a.quarter ?? a.neighbourhood ?? a.suburb ?? a.village
  const city = a.city ?? a.town ?? a.municipality ?? a.county ?? a.village
  return { area, city, country: a.country }
}

/** Place names for a photo's location, most specific first. One network lookup per spot. */
export function placeOptions(lat: number, lon: number): Promise<string[]> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
  let p = placeCache.get(key)
  if (!p) {
    p = (async () => {
      const [areas, addr] = await Promise.all([containingAreas(lat, lon).catch(() => []), address(lat, lon)])
      const options = [
        ...areas.slice(0, 2),
        addr.area,
        addr.city,
        addr.city && addr.country ? `${addr.city}, ${addr.country}` : addr.country,
      ]
      const result = [...new Set(options.filter((o): o is string => !!o))]
      log.info('meta', `place lookup ${key}`, result)
      return result
    })()
    p.catch(() => placeCache.delete(key))
    placeCache.set(key, p)
  }
  return p
}

// ---------------------------------------------------------------------------------------------
// Print quality

export type PrintQuality = { dpi: number; level: 'great' | 'good' | 'low'; label: string }

/** Source pixels per printed inch at the photo's current size on the product. */
export function printQuality(p: PhotoLayer): PrintQuality {
  const dpi = Math.round((p.naturalWidth * p.crop.width) / (p.width / DESIGN_UNITS_PER_INCH))
  if (dpi >= 250) return { dpi, level: 'great', label: 'Great' }
  if (dpi >= 150) return { dpi, level: 'good', label: 'Good' }
  return { dpi, level: 'low', label: 'Low: may print blurry. Try a bigger photo or make it smaller.' }
}

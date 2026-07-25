import { normalizePlace, type NormalizedPlace } from '../lib/places/normalize'
import italy from './italy.json'
import placeImagesJson from './placeImages.json'

export type Place = (typeof italy)[number]

/** All 103 places, normalized once at module load from the untouched italy.json source. */
export const PLACES: NormalizedPlace[] = italy.map(normalizePlace)

export type { NormalizedPlace }

/**
 * Offline-enriched place thumbnails (Wikipedia, Mapbox static fallback).
 * Built by `npm run fetch:place-images` — lookup only at runtime, no API calls.
 *
 * Mapbox entries are stored unsigned; read them through `placeImageUrl`.
 */
export const placeImages: Record<string, string> = placeImagesJson

const MAPBOX_STATIC_PREFIX = 'https://api.mapbox.com/'

/**
 * Resolves a thumbnail, signing the Mapbox static ones with the caller's token.
 * The token comes from `MAPBOX_API_KEY` at runtime rather than being baked into
 * `placeImages.json`, so rotating it does not mean rewriting checked-in data.
 * Returns undefined for an unsigned Mapbox URL, which Mapbox would reject
 * anyway — callers already fall back to a placeholder.
 */
export function placeImageUrl(placeId: string, mapboxToken?: string) {
  const url = placeImages[placeId]
  if (!url || !url.startsWith(MAPBOX_STATIC_PREFIX)) return url
  return mapboxToken ? `${url}?access_token=${mapboxToken}` : undefined
}

/** Fast id -> place lookup for resolving itinerary stops. */
export const PLACES_BY_ID: Map<string, NormalizedPlace> = new Map(
  PLACES.map((place) => [place.id, place]),
)

export function formatPlaceType(type: string) {
  return type.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

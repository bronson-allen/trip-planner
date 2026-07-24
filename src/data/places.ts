import { normalizePlace, type NormalizedPlace } from '../lib/normalize'
import italy from './italy.json'
import placeImagesJson from './placeImages.json'

export type Place = (typeof italy)[number]

/** All 103 places, normalized once at module load from the untouched italy.json source. */
export const PLACES: NormalizedPlace[] = italy.map(normalizePlace)

export type { NormalizedPlace }

/**
 * Offline-enriched place thumbnails (Wikipedia, Mapbox static fallback).
 * Built by `npm run fetch:place-images` — lookup only at runtime, no API calls.
 */
export const placeImages: Record<string, string> = placeImagesJson

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

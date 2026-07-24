import type { NormalizedPlace } from '../data/places'

export type RouteGeometry = GeoJSON.LineString

export type RouteResult = {
  geometry: RouteGeometry
  distanceMeters: number
  durationSeconds: number
}

export type RouteSegment = {
  from: NormalizedPlace
  to: NormalizedPlace
}

export type ItineraryRoute = {
  features: GeoJSON.Feature<RouteGeometry>[]
  distanceMeters: number
  durationSeconds: number
}

export type TravelEstimate = {
  distanceMeters: number
  durationSeconds: number
  straightLineMeters: number
}

const WALKING_SPEED_METERS_PER_SECOND = 1.4
const WALKING_WINDING_FACTOR = 1.2
const ROUTE_COLOR = '#22c55e'

const EARTH_RADIUS_METERS = 6_371_000

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

export function haversineMeters(
  from: Pick<NormalizedPlace, 'latitude' | 'longitude'>,
  to: Pick<NormalizedPlace, 'latitude' | 'longitude'>,
): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const dLat = lat2 - lat1
  const dLon = toRadians(to.longitude - from.longitude)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Instant walking estimate for between-card labels — no network. */
export function estimateTravel(
  from: Pick<NormalizedPlace, 'latitude' | 'longitude'>,
  to: Pick<NormalizedPlace, 'latitude' | 'longitude'>,
): TravelEstimate {
  const straightLineMeters = haversineMeters(from, to)
  const distanceMeters = straightLineMeters * WALKING_WINDING_FACTOR
  const durationSeconds = distanceMeters / WALKING_SPEED_METERS_PER_SECOND

  return { distanceMeters, durationSeconds, straightLineMeters }
}

export async function fetchRoute(
  places: NormalizedPlace[],
  accessToken: string,
): Promise<RouteResult | null> {
  if (places.length < 2) return null

  const coordinates = places
    .map((place) => `${place.longitude},${place.latitude}`)
    .join(';')

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}` +
    `?geometries=geojson&overview=full&access_token=${accessToken}`

  const response = await fetch(url)
  if (!response.ok) return null

  const data = (await response.json()) as {
    routes?: Array<{
      geometry: RouteGeometry
      distance: number
      duration: number
    }>
  }

  const route = data.routes?.[0]
  if (!route) return null

  return {
    geometry: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  }
}

/** Fetches one Mapbox walking route per itinerary leg. */
export async function fetchItineraryRoute(
  segments: RouteSegment[],
  accessToken: string,
): Promise<ItineraryRoute | null> {
  if (!segments.length) return null

  const results = await Promise.all(
    segments.map((segment) => fetchRoute([segment.from, segment.to], accessToken)),
  )

  if (results.some((result) => !result)) return null

  let distanceMeters = 0
  let durationSeconds = 0
  const features: GeoJSON.Feature<RouteGeometry>[] = []

  results.forEach((result) => {
    if (!result) return
    distanceMeters += result.distanceMeters
    durationSeconds += result.durationSeconds
    features.push({
      type: 'Feature',
      properties: { color: ROUTE_COLOR },
      geometry: result.geometry,
    })
  })

  return { features, distanceMeters, durationSeconds }
}

export function formatRouteDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

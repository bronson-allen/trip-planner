import rawItaly from '../../data/italy.json'
import { parseSeasonWindow } from './availability'
import { haversineMeters } from '../geo/directions'
import type { NormalizedPlace } from './normalize'

type RawPlace = (typeof rawItaly)[number]

export type DataAuditFinding = {
  category:
    | 'duration_exceeds_window'
    | 'booking_required_no_hours'
    | 'low_rating_outlier'
    | 'inferred_duration'
    | 'partial_hours'
    | 'unknown_hours_with_text'
    | 'geo_outlier'
    | 'seasonal_closure'
  placeId: string
  placeName: string
  detail: string
}

/** Distance beyond which a place is considered mislocated for its city (matches the scheduler). */
const GEO_OUTLIER_KM = 40

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Flags places sitting implausibly far from the median centre of their own city. */
function findGeoOutliers(normalized: readonly NormalizedPlace[]): DataAuditFinding[] {
  const byCity = new Map<string, NormalizedPlace[]>()
  for (const place of normalized) {
    const list = byCity.get(place.city) ?? []
    list.push(place)
    byCity.set(place.city, list)
  }

  const findings: DataAuditFinding[] = []
  for (const places of byCity.values()) {
    if (places.length < 3) continue // too few to establish a reliable centre
    const center = {
      latitude: median(places.map((p) => p.latitude)),
      longitude: median(places.map((p) => p.longitude)),
    }
    for (const place of places) {
      const km = haversineMeters(center, place) / 1000
      if (km > GEO_OUTLIER_KM) {
        findings.push({
          category: 'geo_outlier',
          placeId: place.id,
          placeName: place.name,
          detail: `${km.toFixed(0)}km from ${place.city} centre — coordinate (${place.latitude}, ${place.longitude}) contradicts its city`,
        })
      }
    }
  }
  return findings
}

export type DataAuditReport = {
  placeCount: number
  missingFields: {
    hours: number
    duration: number
    neighborhood: number
    bookingRequired: number
  }
  hoursConfidence: {
    parsed: number
    partial: number
    unknown: number
  }
  inferredDurations: number
  findings: DataAuditFinding[]
}

function longestWindowMinutes(place: NormalizedPlace): number | null {
  if (place.hours.windows.length === 0) return null
  return Math.max(
    ...place.hours.windows.map((window) => window.endMinutes - window.startMinutes),
  )
}

/**
 * Read-only audit over raw + normalized places. Surfaces dataset gotchas without mutating
 * italy.json or "correcting" source values.
 */
export function auditPlaces(
  raw: readonly RawPlace[] = rawItaly,
  normalized: readonly NormalizedPlace[],
): DataAuditReport {
  const findings: DataAuditFinding[] = []

  const missingFields = {
    hours: raw.filter((place) => place.hours == null).length,
    duration: raw.filter((place) => place.duration_minutes == null).length,
    neighborhood: raw.filter((place) => place.neighborhood == null).length,
    bookingRequired: raw.filter((place) => place.booking_required == null).length,
  }

  const hoursConfidence = { parsed: 0, partial: 0, unknown: 0 }
  let inferredDurations = 0

  for (let i = 0; i < normalized.length; i++) {
    const place = normalized[i]
    const source = raw[i]
    if (!source || source.id !== place.id) {
      throw new Error(`auditPlaces: raw/normalized mismatch at index ${i}`)
    }

    hoursConfidence[place.hours.confidence]++

    if (place.duration.inferred) {
      inferredDurations++
      findings.push({
        category: 'inferred_duration',
        placeId: place.id,
        placeName: place.name,
        detail: `duration_minutes missing — defaulted to ${place.duration.minutes}m by type "${place.type}"`,
      })
    }

    const windowMinutes = longestWindowMinutes(place)
    if (
      windowMinutes != null &&
      !place.duration.inferred &&
      place.duration.minutes > windowMinutes
    ) {
      findings.push({
        category: 'duration_exceeds_window',
        placeId: place.id,
        placeName: place.name,
        detail: `duration_minutes ${place.duration.minutes} exceeds longest parsed window (${windowMinutes}m) — "${place.hours.raw}"`,
      })
    }

    if (place.bookingRequired && place.hours.confidence === 'unknown') {
      findings.push({
        category: 'booking_required_no_hours',
        placeId: place.id,
        placeName: place.name,
        detail: source.seasonal_notes
          ? `booking_required with no parseable hours — seasonal_notes: "${source.seasonal_notes}"`
          : 'booking_required with no parseable hours',
      })
    }

    if (place.hours.confidence === 'partial') {
      findings.push({
        category: 'partial_hours',
        placeId: place.id,
        placeName: place.name,
        detail: `only some comma segments parsed — "${place.hours.raw}"`,
      })
    }

    if (place.hours.confidence === 'unknown' && place.hours.raw) {
      findings.push({
        category: 'unknown_hours_with_text',
        placeId: place.id,
        placeName: place.name,
        detail: `unparseable hours text — "${place.hours.raw}"`,
      })
    }

    if (place.rating < 3) {
      findings.push({
        category: 'low_rating_outlier',
        placeId: place.id,
        placeName: place.name,
        detail: `rating ${place.rating} — tags: ${place.tags.join(', ')}`,
      })
    }

    const window = parseSeasonWindow(place.seasonalNotes)
    if (window) {
      findings.push({
        category: 'seasonal_closure',
        placeId: place.id,
        placeName: place.name,
        detail: `open months ${window.startMonth}–${window.endMonth} only — "${place.seasonalNotes}"`,
      })
    }
  }

  findings.push(...findGeoOutliers(normalized))

  return {
    placeCount: normalized.length,
    missingFields,
    hoursConfidence,
    inferredDurations,
    findings,
  }
}

/** Dev-only console summary. */
export function logDataAudit(report: DataAuditReport) {
  const grouped = new Map<DataAuditFinding['category'], DataAuditFinding[]>()
  for (const finding of report.findings) {
    const list = grouped.get(finding.category) ?? []
    list.push(finding)
    grouped.set(finding.category, list)
  }

  console.group('[trip-planner] italy.json data audit')
  console.log(`${report.placeCount} places · source: italy.json (untouched)`)
  console.log('Missing fields:', report.missingFields)
  console.log('Hours confidence:', report.hoursConfidence)
  console.log(`Inferred durations: ${report.inferredDurations}`)

  for (const [category, items] of grouped) {
    console.groupCollapsed(`${category} (${items.length})`)
    for (const item of items) {
      console.log(`${item.placeName} [${item.placeId}]: ${item.detail}`)
    }
    console.groupEnd()
  }

  console.groupEnd()
}

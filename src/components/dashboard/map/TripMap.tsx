import mapboxgl from 'mapbox-gl'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getCityLocation } from '../../../data/cities'
import {
  formatDuration,
  formatPlaceType,
  placeImages,
  type NormalizedPlace,
} from '../../../data/places'
import {
  fetchItineraryRoute,
  formatRouteDistance,
  formatRouteDuration,
  type RouteSegment,
} from '../../../lib/geo/directions'

const ROUTE_SOURCE = 'trip-route'
const ROUTE_LAYER = 'trip-route-line'
const ROUTE_CASING = 'trip-route-casing'

export type MapStop = {
  place: NormalizedPlace
  stopNumber: number
  day: number
}

type TripMapProps = {
  city: string
  stops: MapStop[]
  dayLabel?: string
  routePlaces?: NormalizedPlace[]
  segments: RouteSegment[]
  routeVisible: boolean
  focusPlaceId?: string | null
  focusToken?: number
  /** Pin to pulse without moving the camera — driven by hover in the day timeline. */
  highlightPlaceId?: string | null
}

function buildPopupContent(place: NormalizedPlace) {
  const root = document.createElement('div')
  root.className = 'map-popup'

  const imageUrl = placeImages[place.id]
  if (imageUrl) {
    const img = document.createElement('img')
    img.className = 'map-popup__media'
    img.src = imageUrl
    img.alt = place.name
    img.loading = 'lazy'
    img.decoding = 'async'
    root.appendChild(img)
  }

  const content = document.createElement('div')
  content.className = 'map-popup__content'

  const name = document.createElement('p')
  name.className = 'map-popup__name'
  name.textContent = place.name
  content.appendChild(name)

  const meta = document.createElement('p')
  meta.className = 'map-popup__meta'
  meta.textContent = [
    formatPlaceType(place.type),
    place.neighborhood,
    place.priceRange,
  ]
    .filter(Boolean)
    .join(' · ')
  content.appendChild(meta)

  const description = document.createElement('p')
  description.className = 'map-popup__body'
  description.textContent = place.description
  content.appendChild(description)

  const details = document.createElement('p')
  details.className = 'map-popup__details'
  const durationLabel = place.duration.inferred
    ? `~${formatDuration(place.duration.minutes)} (estimated)`
    : formatDuration(place.duration.minutes)
  details.textContent = [durationLabel, `Rating ${place.rating}`].join(' · ')
  content.appendChild(details)

  const hours = document.createElement('p')
  const hoursUnclear = place.hours.confidence !== 'parsed'
  hours.className = hoursUnclear
    ? 'map-popup__hours map-popup__hours--unknown'
    : 'map-popup__hours'
  hours.textContent =
    place.hours.confidence === 'unknown'
      ? place.hours.raw
        ? `Hours unclear ("${place.hours.raw}") — check ahead`
        : 'Hours not listed — check ahead'
      : place.hours.confidence === 'partial'
        ? `Hours partially parsed ("${place.hours.raw}") — check ahead`
        : `Hours: ${place.hours.display}`
  content.appendChild(hours)

  if (place.bookingRequired) {
    const badge = document.createElement('p')
    badge.className = 'map-popup__badge'
    badge.textContent = 'Booking required'
    content.appendChild(badge)
  }

  if (place.seasonalNotes) {
    const seasonal = document.createElement('p')
    seasonal.className = 'map-popup__seasonal'
    seasonal.textContent = place.seasonalNotes
    content.appendChild(seasonal)
  }

  root.appendChild(content)
  return root
}

function createNumberedMarkerElement(stop: MapStop): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'map-marker'
  el.dataset.placeId = stop.place.id
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Stop ${stop.stopNumber}, ${stop.place.name}`)
  el.textContent = String(stop.stopNumber)
  return el
}

function stopKey(stop: MapStop) {
  return `${stop.day}-${stop.place.id}`
}

function clearRoute(map: mapboxgl.Map) {
  if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER)
  if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING)
  if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE)
}

function drawRoute(
  map: mapboxgl.Map,
  features: GeoJSON.Feature<GeoJSON.LineString>[],
) {
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  }

  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }

  map.addSource(ROUTE_SOURCE, { type: 'geojson', data })

  map.addLayer({
    id: ROUTE_CASING,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#fff',
      'line-width': 8,
      'line-opacity': 0.9,
    },
  })

  map.addLayer({
    id: ROUTE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-opacity': 0.95,
    },
  })
}

export default function TripMap({
  city,
  stops,
  dayLabel,
  routePlaces = [],
  segments,
  routeVisible,
  focusPlaceId = null,
  focusToken = 0,
  highlightPlaceId = null,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const token = import.meta.env.MAPBOX_API_KEY as string | undefined
  const [routeSummary, setRouteSummary] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!token) return

    const { center, zoom } = getCityLocation(city)

    const map = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current,
      center,
      zoom,
    })
    const markers = markersRef.current

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    return () => {
      markers.forEach((marker) => marker.remove())
      markers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [token, city])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !stops.length) return
    const activeMap: mapboxgl.Map = map
    const markers = markersRef.current

    function addMarkers() {
      markers.forEach((marker) => marker.remove())
      markers.clear()

      const bounds = new mapboxgl.LngLatBounds()

      stops.forEach((stop) => {
        const { place } = stop
        const lngLat: [number, number] = [place.longitude, place.latitude]
        bounds.extend(lngLat)

        const popup = new mapboxgl.Popup({
          offset: 18,
          maxWidth: '200px',
          className: 'map-popup-shell',
        }).setDOMContent(buildPopupContent(place))

        const marker = new mapboxgl.Marker({ element: createNumberedMarkerElement(stop) })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(activeMap)

        markers.set(stopKey(stop), marker)
      })

      if (stops.length === 1) {
        activeMap.flyTo({ center: bounds.getCenter(), zoom: 14 })
      } else {
        activeMap.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
      }
    }

    if (activeMap.isStyleLoaded()) addMarkers()
    else activeMap.once('load', addMarkers)

    return () => {
      markers.forEach((marker) => marker.remove())
      markers.clear()
      activeMap.off('load', addMarkers)
    }
  }, [stops, city])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !token) return
    const activeMap: mapboxgl.Map = map
    const accessToken: string = token

    let cancelled = false

    async function updateRoute() {
      if (!routeVisible || segments.length === 0) {
        clearRoute(activeMap)
        setRouteSummary(null)
        return
      }

      const result = await fetchItineraryRoute(segments, accessToken)
      if (cancelled) return

      if (!result) {
        clearRoute(activeMap)
        setRouteSummary('Route unavailable')
        return
      }

      const apply = () => {
        drawRoute(activeMap, result.features)
        setRouteSummary(
          `${formatRouteDistance(result.distanceMeters)} · ${formatRouteDuration(result.durationSeconds)}`,
        )

        const boundsPlaces = routePlaces.length > 0 ? routePlaces : stops.map((stop) => stop.place)
        const bounds = new mapboxgl.LngLatBounds()
        for (const place of boundsPlaces) {
          bounds.extend([place.longitude, place.latitude])
        }
        activeMap.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 800 })
      }

      if (activeMap.isStyleLoaded()) apply()
      else activeMap.once('load', apply)
    }

    void updateRoute()

    return () => {
      cancelled = true
    }
  }, [segments, routeVisible, token, stops, routePlaces])

  useEffect(() => {
    if (!focusPlaceId || focusToken === 0) return

    const map = mapRef.current
    const stop = stops.find((item) => item.place.id === focusPlaceId)
    const marker = [...markersRef.current.values()].find(
      (entry) => entry.getElement().dataset.placeId === focusPlaceId,
    )
    if (!map || !stop || !marker) return

    markersRef.current.forEach((other) => {
      if (other !== marker) other.getPopup()?.remove()
    })

    map.flyTo({
      center: [stop.place.longitude, stop.place.latitude],
      zoom: 15,
      essential: true,
    })

    const popup = marker.getPopup()
    if (popup && !popup.isOpen()) marker.togglePopup()
  }, [focusPlaceId, focusToken, stops])

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const element = marker.getElement()
      element.classList.toggle('map-marker--pulse', element.dataset.placeId === highlightPlaceId)
    })
  }, [highlightPlaceId, stops])

  return (
    <div className="trip-map" ref={containerRef} aria-label={`Map of ${city}`}>
      {!token && (
        <p className="trip-map__error">
          Missing MAPBOX_API_KEY. Add a public Mapbox token (pk.*) to .env.
        </p>
      )}
      {dayLabel ? (
        <p className="trip-map__day-label">{dayLabel}</p>
      ) : null}
      {routeSummary && (
        <p className="trip-map__route-summary" role="status">
          {routeSummary}
        </p>
      )}
    </div>
  )
}

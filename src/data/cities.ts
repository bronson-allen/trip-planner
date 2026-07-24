/** Map centers [lng, lat] for planner base cities. */

export type CityLocation = {
  center: [number, number]
  zoom: number
}

export const CITY_LOCATIONS: Record<string, CityLocation> = {
  Rome: { center: [12.4964, 41.9028], zoom: 12 },
  Florence: { center: [11.2558, 43.7696], zoom: 13 },
  Venice: { center: [12.3155, 45.4408], zoom: 13 },
  Milan: { center: [9.19, 45.4642], zoom: 12 },
}

export function getCityLocation(city: string): CityLocation {
  return CITY_LOCATIONS[city] ?? CITY_LOCATIONS.Rome
}

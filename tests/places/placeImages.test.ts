import { describe, expect, it } from 'vitest'
import placeImagesJson from '../../src/data/placeImages.json'
import { placeImageUrl } from '../../src/data/places'

const entries = Object.entries(placeImagesJson as Record<string, string>)
const mapboxId = entries.find(([, url]) => url.startsWith('https://api.mapbox.com/'))?.[0]
const wikipediaId = entries.find(([, url]) => url.includes('upload.wikimedia.org'))?.[0]

describe('place image urls', () => {
  it('never commits a Mapbox token to the dataset', () => {
    const leaked = entries.filter(([, url]) => url.includes('access_token'))
    expect(leaked).toEqual([])
  })

  it('signs Mapbox urls with the caller token', () => {
    expect(mapboxId).toBeDefined()
    expect(placeImageUrl(mapboxId!, 'pk.test')).toContain('?access_token=pk.test')
  })

  it('withholds unsignable Mapbox urls rather than serving a 401', () => {
    expect(placeImageUrl(mapboxId!, undefined)).toBeUndefined()
  })

  it('leaves non-Mapbox urls untouched, token or not', () => {
    expect(wikipediaId).toBeDefined()
    const url = placeImagesJson[wikipediaId! as keyof typeof placeImagesJson]
    expect(placeImageUrl(wikipediaId!, undefined)).toBe(url)
    expect(placeImageUrl(wikipediaId!, 'pk.test')).toBe(url)
  })

  it('returns undefined for an unknown place', () => {
    expect(placeImageUrl('place_nope', 'pk.test')).toBeUndefined()
  })
})

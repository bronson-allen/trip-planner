/**
 * One-time offline enrichment: resolve a thumbnail URL for every place in
 * italy.json and write src/data/placeImages.json.
 *
 * Strategy per place:
 *   1. Wikipedia search (name + city) → page summary thumbnail
 *   2. If no usable image, Mapbox Static Images URL at the place coordinates
 *
 * Not part of the app bundle. Re-run only when places are added/renamed.
 *
 * Usage:
 *   npm run fetch:place-images
 *   npm run fetch:place-images -- --from=27          # 1-based index (skip 1–26)
 *   npm run fetch:place-images -- --from=place_027   # same, by id
 *   npm run fetch:place-images -- --force --from=27  # re-resolve even if Wikipedia URL exists
 *
 * Wikimedia rate limits (2026, https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits):
 *   - Compliant User-Agent bots: 200 req/min (Action + REST, global)
 *   - Unidentified: 10 req/min
 *   - Robot policy: concurrency 1 for Action API; stay under 5 req/s
 *
 * This script paces at 150 req/min (400ms min gap, concurrency 1) so a manual
 * run should not sit waiting on 429s. 429/503 still honor Retry-After.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ITALY_PATH = join(ROOT, 'src/data/italy.json')
const OUT_PATH = join(ROOT, 'src/data/placeImages.json')

/** Official ceiling for User-Agent-only bots. We stay under this. */
const WIKI_LIMIT_PER_MIN = 200
/** Headroom under the 200/min ceiling (~75%). */
const RATE_LIMIT_PER_MIN = 150
const MIN_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MIN) // 400ms
const MAX_RETRIES = 8

const USER_AGENT =
  'RoamTripPlanner/1.0 (offline place-image enrichment; educational take-home; https://github.com/local/trip-planner)'
const WIKI_SEARCH =
  'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch='
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/'

const MAPBOX_STYLE = 'mapbox/streets-v12'
const MAPBOX_SIZE = '480x320@2x'
const MAPBOX_ZOOM = 15

/**
 * Wikimedia only allows hotlinking of specific thumb widths
 * (https://w.wiki/GHai): 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840.
 */
const WIKI_THUMB_WIDTH = 500

/** Types where a loose Wikipedia hit is usually fine (famous landmarks). */
const LENIENT_TYPES = new Set([
  'historic_site',
  'museum',
  'viewpoint',
  'park',
  'neighborhood',
  'market',
])

function printHelp() {
  console.log(`Usage: node --env-file=.env scripts/fetch-place-images.mjs [options]

Options:
  --from <n|place_id>   Start at 1-based index or place id (e.g. 27 or place_027)
  --force               Re-resolve even when a Wikipedia URL already exists
  -h, --help            Show this help

Rate limit: ${RATE_LIMIT_PER_MIN} req/min (Wikimedia ceiling for UA bots is ${WIKI_LIMIT_PER_MIN}/min).
`)
}

function parseArgs(argv) {
  const args = { force: false, from: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') args.force = true
    else if (a === '--help' || a === '-h') args.help = true
    else if (a.startsWith('--from=')) args.from = a.slice('--from='.length)
    else if (a === '--from' || a === '--start') {
      args.from = argv[++i]
      if (!args.from) throw new Error(`${a} requires a value (e.g. --from=27)`)
    } else if (a.startsWith('--start=')) args.from = a.slice('--start='.length)
    else throw new Error(`Unknown argument: ${a} (try --help)`)
  }
  return args
}

function resolveStartIndex(from, places) {
  if (from == null || from === '') return 0

  if (/^place_\d+$/i.test(from)) {
    const idx = places.findIndex((p) => p.id === from)
    if (idx === -1) throw new Error(`Unknown place id: ${from}`)
    return idx
  }

  const n = Number(from)
  if (!Number.isInteger(n) || n < 1 || n > places.length) {
    throw new Error(`--from must be 1..${places.length} or a place id (got ${JSON.stringify(from)})`)
  }
  return n - 1 // 1-based → 0-based
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sliding-window limiter: ≤ perMinute in any 60s window, plus a min gap
 * between requests (keeps us under robot-policy 5 req/s and concurrency 1).
 */
class RateLimiter {
  constructor({ perMinute, minIntervalMs }) {
    this.perMinute = perMinute
    this.minIntervalMs = minIntervalMs
    /** @type {number[]} */
    this.timestamps = []
    this.lastAt = 0
  }

  async acquire() {
    for (;;) {
      const now = Date.now()
      this.timestamps = this.timestamps.filter((t) => now - t < 60_000)

      const waitInterval = Math.max(0, this.minIntervalMs - (now - this.lastAt))
      let waitWindow = 0
      if (this.timestamps.length >= this.perMinute) {
        waitWindow = 60_000 - (now - this.timestamps[0]) + 5
      }

      const wait = Math.max(waitInterval, waitWindow)
      if (wait > 0) {
        await sleep(wait)
        continue
      }

      const at = Date.now()
      this.lastAt = at
      this.timestamps.push(at)
      return
    }
  }

  /** After a 429, pause long enough that the window has room again. */
  async backoff(waitMs) {
    await sleep(waitMs)
    this.timestamps = []
    this.lastAt = 0
  }
}

const rateLimiter = new RateLimiter({
  perMinute: RATE_LIMIT_PER_MIN,
  minIntervalMs: MIN_INTERVAL_MS,
})

function isWikipediaUrl(url) {
  return typeof url === 'string' && url.includes('upload.wikimedia.org')
}

function isMapboxUrl(url) {
  return typeof url === 'string' && url.includes('api.mapbox.com')
}

function toAllowedWikiImageUrl(url) {
  if (!url) return null
  if (!/\/\d+px-/.test(url)) return url
  return url.replace(/\/\d+px-/, `/${WIKI_THUMB_WIDTH}px-`)
}

function mapboxStaticUrl(lat, lon, token) {
  const center = `${lon},${lat},${MAPBOX_ZOOM}`
  const pin = `pin-s+8b4513(${lon},${lat})`
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${pin}/${center}/${MAPBOX_SIZE}?access_token=${token}`
}

function searchQuery(place) {
  const name = place.name
    .replace(/\s+Neighborhood$/i, '')
    .replace(/\s+at Dawn$/i, '')
    .replace(/\s+by Night$/i, '')
    .replace(/\s+\(Exterior\)$/i, '')
    .replace(/^Gelato at\s+/i, '')
    .replace(/^Aperitivo at\s+/i, '')
    .trim()
  return `${name} ${place.city}`
}

function significantTokens(text) {
  const stop = new Set([
    'the', 'a', 'an', 'at', 'of', 'in', 'on', 'by', 'and', 'or', 'to', 'for',
    'al', 'alla', 'alle', 'del', 'della', 'delle', 'dei', 'di', 'da', 'dal',
    'la', 'il', 'lo', 'le', 'gli', 'san', 'santa', 'via', 'day', 'trip',
    'climb', 'walk', 'ride', 'bike', 'tour', 'early', 'morning', 'night',
    'exterior', 'culture', 'traditional', 'tasting',
  ])
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t))
}

/**
 * Reject obviously wrong hits (e.g. "Da Enzo al 29" → "Enzo Carnebianca").
 * Lenient for landmark-ish types; strict for restaurants/cafes/shops/experiences.
 */
function isPlausibleMatch(place, title, extract) {
  const placeTokens = significantTokens(place.name)
  const titleTokens = new Set(significantTokens(title))
  const extractLower = (extract ?? '').toLowerCase()
  const city = place.city.toLowerCase()

  if (placeTokens.length === 0) return Boolean(extractLower.includes(city))

  const overlap = placeTokens.filter((t) => titleTokens.has(t)).length
  const overlapRatio = overlap / placeTokens.length
  const cityOk =
    extractLower.includes(city) ||
    title.toLowerCase().includes(city) ||
    titleTokens.has(city)

  if (LENIENT_TYPES.has(place.type)) {
    return overlap >= 1 || (cityOk && overlapRatio >= 0.25)
  }

  return overlapRatio >= 0.5 && (cityOk || overlap >= 2)
}

async function fetchJson(url) {
  let attempt = 0
  while (true) {
    await rateLimiter.acquire()

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (res.status === 429 || res.status === 503) {
      attempt++
      if (attempt > MAX_RETRIES) {
        throw new Error(`HTTP ${res.status} for ${url} (gave up after ${MAX_RETRIES} retries)`)
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(60_000, 5_000 * 2 ** (attempt - 1))
      console.warn(`  rate-limited (${res.status}), backing off ${Math.round(waitMs / 1000)}s…`)
      await rateLimiter.backoff(waitMs)
      continue
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`)
    }
    return res.json()
  }
}

async function wikipediaImageFor(place) {
  const query = searchQuery(place)
  const search = await fetchJson(`${WIKI_SEARCH}${encodeURIComponent(query)}`)
  const hits = search?.query?.search ?? []

  for (const hit of hits) {
    const title = hit.title
    if (!title) continue

    let summary
    try {
      summary = await fetchJson(`${WIKI_SUMMARY}${encodeURIComponent(title)}`)
    } catch {
      continue
    }

    if (summary.type === 'disambiguation') continue
    if (!isPlausibleMatch(place, title, summary.extract)) continue

    const raw =
      summary.thumbnail?.source ??
      summary.originalimage?.source ??
      null
    const image = toAllowedWikiImageUrl(raw)
    if (image) {
      return { image, title, source: 'wikipedia' }
    }
  }

  return null
}

// --- main ---

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

if (args.help) {
  printHelp()
  process.exit(0)
}

const mapboxToken = process.env.MAPBOX_API_KEY
if (!mapboxToken) {
  console.error('MAPBOX_API_KEY missing. Run with: node --env-file=.env scripts/fetch-place-images.mjs')
  process.exit(1)
}

const places = JSON.parse(readFileSync(ITALY_PATH, 'utf8'))

/** @type {Record<string, string>} */
const existing = existsSync(OUT_PATH)
  ? JSON.parse(readFileSync(OUT_PATH, 'utf8'))
  : {}

let startIndex
try {
  startIndex = resolveStartIndex(args.from, places)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const out = { ...existing }
let wikiCount = 0
let mapboxCount = 0
let skippedKeep = 0
let skippedBefore = 0
let failures = 0

const startPlace = places[startIndex]
console.log(
  `Rate limit: ${RATE_LIMIT_PER_MIN}/min (Wikimedia UA ceiling ${WIKI_LIMIT_PER_MIN}/min), min gap ${MIN_INTERVAL_MS}ms, concurrency 1`,
)
console.log(
  `Resolving images for places ${startIndex + 1}–${places.length}` +
    (args.from ? ` (from ${startPlace.id} ${startPlace.name})` : '') +
    (args.force ? ' [force]' : '') +
    '…\n',
)

for (let i = 0; i < places.length; i++) {
  const place = places[i]
  const label = `[${String(i + 1).padStart(3, '0')}/${places.length}] ${place.id} ${place.name}`
  const prev = existing[place.id]

  if (i < startIndex) {
    if (prev) out[place.id] = prev
    skippedBefore++
    continue
  }

  if (!args.force && isWikipediaUrl(prev)) {
    out[place.id] = prev
    wikiCount++
    skippedKeep++
    console.log(`${label} → keep wikipedia`)
    continue
  }

  try {
    const wiki = await wikipediaImageFor(place)
    if (wiki) {
      out[place.id] = wiki.image
      wikiCount++
      console.log(`${label} → wikipedia (${wiki.title})`)
    } else {
      out[place.id] = mapboxStaticUrl(place.latitude, place.longitude, mapboxToken)
      mapboxCount++
      console.log(`${label} → mapbox fallback`)
    }
  } catch (err) {
    out[place.id] = isMapboxUrl(prev)
      ? prev
      : mapboxStaticUrl(place.latitude, place.longitude, mapboxToken)
    mapboxCount++
    failures++
    console.warn(`${label} → mapbox fallback (error: ${err.message})`)
  }

  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
}

writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8')

console.log(`\nWrote ${OUT_PATH}`)
console.log(
  `Done: ${Object.keys(out).length} keys — ${wikiCount} Wikipedia (${skippedKeep} kept), ${mapboxCount} Mapbox` +
    (skippedBefore ? `, ${skippedBefore} left untouched (--from)` : '') +
    (failures ? `, ${failures} errored into Mapbox` : ''),
)

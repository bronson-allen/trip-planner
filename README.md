# 3 Days in Italy — Trip Planner

Pick a base city, a start date and a few preferences. A deterministic engine builds a 3-day
itinerary from the 103-place dataset in `src/data/italy.json`. Refine it by hand, or by asking
**Navi** — an assistant that changes your trip only through the same functions the buttons call.

React 19 · TypeScript · Vite · Mapbox GL · Vercel Functions · OpenAI `gpt-4.1`

**Live demo:** _add URL_

---

## Quick start

```bash
npm install
cp .env.example .env    # add your two keys
npm run dev
```

| Variable | Purpose |
|---|---|
| `MAPBOX_API_KEY` | Map tiles, walking routes, place thumbnails. **Public `pk.` token** — it reaches the browser, but it is never committed: `placeImages.json` stores Mapbox URLs unsigned and `placeImageUrl()` signs them at read time. |
| `OPENAI_API_KEY` | The Navi assistant. Server-side only, never bundled into the client. |
| `APP_ORIGIN` | CORS allowlist. Optional locally; set to the deployed origin in production. |

`npm run dev` serves the frontend and `/api/assistant` from one process — no `vercel dev` needed.

Without `OPENAI_API_KEY` the app still works completely; you just lose Navi. Planning and every
manual edit run client-side with no network call.

### Scripts

```bash
npm run dev       # frontend + assistant API
npm run build     # typecheck + production build
npm test          # 88 unit tests
npm run lint      # oxlint
```

---

## Features

**Plan** — choose Rome, Florence, Venice or Milan, a start date, interest chips, pace and budget.
Places are ranked by a weighted score (preference match, rating, authenticity, budget fit), then
scheduled into days that are geographically clustered and follow a real rhythm: morning sight,
lunch, afternoon, evening, dinner. Pace controls how densely sights pack between the fixed meals.

**Map view** — Mapbox pins numbered per day, click to focus, toggle a real walking route for any
day.

**List view** — detailed stop cards with images, hours, duration, price, rating and tags.

**Day at a glance** — the selected day laid out on a wall clock, so an over- or under-packed day
is visible at a glance.

**Explore** — browse the full dataset, search by name, neighborhood, type or tag, filter by price,
and add anything to a specific day.

**Edit** — drag to reorder, remove stops, add from Explore. Travel estimates and day themes
recompute immediately.

**Navi** — an assistant scoped to the trip on screen, for the things buttons can't express:

| | |
|---|---|
| Questions | *"Why is my first stop before lunch?"* · *"What's near my Day 1 dinner?"* |
| Compound edits | *"Swap the museum for something outdoorsy near the coast, under budget"* |
| Re-plans | *"Make Day 2 lighter and move something to Day 3"* |

---

## How it works

```
 UI buttons ─┐
             ├─► pure tool functions (TripState → TripState) ─► TripState
 Navi chat ──┘     searchPlaces · explainStop · nearbyPlaces · addStop
                   removeStop · swapStop · reorderStop · rebalanceDay
```

The itinerary is one small serializable object — `{ city, startDate, prefs, days: [{ placeId,
slot }] }`. Ids only. It's simultaneously the React state, the sessionStorage format and the API
wire format. Everything displayed (resolved places, walking times, dates) is derived on render,
so it can't go stale.

Both the buttons and the assistant mutate it through the same pure functions in
`src/lib/trip/tools.ts`. Delete the chat box and every edit still works.

**The LLM is never in the correctness path.** It interprets requests and picks tools; the tools
decide what's real, what's open and what's reachable. The model never types a place id from
memory — it gets candidates from `searchPlaces` and passes those exact ids on, and every write
tool re-validates them against the dataset before mutating. The loop is capped at five tool steps,
and `removeStop` is withheld unless the instruction explicitly asks to remove something.

Server-side: zod request validation, a 500-character instruction cap, per-IP rate limiting, CORS,
and structured per-request logging.

**Data** — `italy.json` is never mutated. A one-way `normalize()` pass parses ~8 hours formats
(including overnight windows), defaults missing durations, and canonicalizes tags — attributing
every inference rather than hiding it, so unparseable hours reach the card as "check ahead"
instead of an invented time. A `auditPlaces()` pass logs data-quality findings at startup in dev.

---

## Project structure

```
server/assistant.ts      Source for the tool-calling loop (bundled to api/assistant.js for Vercel)
api/assistant.js         Emitted at build time — the production Vercel Function entry
src/
  config/mapbox.ts       the only client-side read of the public Mapbox token
  data/                  italy.json (source of truth), normalized places, trip plan
  lib/
    places/              the dataset and what it means
      normalize.ts       raw → attributed typed view
      tags.ts            tag taxonomy
      score.ts           weighted ranking
      availability.ts    opening-hours and seasonal checks
      explore.ts         browse/filter the catalog against a trip
      audit.ts           data-quality report
    trip/                the planning engine
      planPrefs.ts       TripPlan → TripPrefs
      itinerary.ts       the scheduler
      tripState.ts       TripState, initTripState, resolveTrip
      tools.ts           shared tool layer (UI + assistant)
      dayGlance.ts       wall-clock layout
    geo/directions.ts    distance estimates + Mapbox walking routes
    dates.ts             date parsing and formatting
  components/
    home/                Hero, planner form
    dashboard/
      shell/             header, sidebar
      shared/            Panel, icons and small presentational parts
      itinerary/         list and compact views, stop cards, day at a glance
      calendar/          month calendar
      map/               Mapbox view
      explore/           catalog browser and place detail
      assistant/         Navi
  pages/                 HomePage · DashboardPage
tests/                   unit tests, mirroring lib/ (places · trip · geo)
```

## Deployment

Deploys to Vercel as-is: `vercel.json` rewrites everything except `/api/` to `index.html`. Set
`OPENAI_API_KEY`, `MAPBOX_API_KEY` and `APP_ORIGIN` in the project environment.

# 3 Days in Italy — submission note

**Live:** [https://trip-planner-bronson.vercel.app](https://trip-planner-bronson.vercel.app) · **Repo:** [https://github.com/bronson-allen/trip-planner](https://github.com/bronson-allen/trip-planner)
React 19 · TypeScript · Vite · Mapbox GL · Vercel Functions · OpenAI `gpt-4.1` · Vitest unit tests

## What I built

A smart 3-day trip planner. You pick a base city, a start date, and a few preference chips, and a deterministic engine builds the itinerary. The chips become a `TripPrefs` object, `rankPlaces` scores all 103 places in `italy.json` against it, and `buildItinerary` schedules the winners into three days with a real rhythm — morning sight, lunch, afternoon, evening, dinner — clustered geographically so you're not crossing town between courses. Then you refine it by hand or through **Navi**, an assistant that can only act through the same deterministic functions the buttons call.

Before building, I asked friends and family what they'd actually want from a short Italy trip. The answers clustered around pace (chill vs packed), budget, and not wasting a day in transit — so the planner surfaces those as first-class controls, and the scheduler refuses itineraries the travel model can't support.

The start date is required on purpose. Seasonal closures and day-of-week hours are load-bearing for correctness; making it optional would mean volunteering places that are closed on the day you visit.

**Try on the live app:** *"Why is my first stop before lunch?"* (read-only) · *"Swap the museum for something outdoorsy, and make day 2 lighter"* (compound edit).

## Scoping it down: why one city, three days?

The dataset's density is lopsided. Rome, Florence, Venice and Milan hold most of the 103 entries; the rest are 1–9 places in day-trip towns. Ranking the whole country would ship Rome → Venice → Florence in 72 hours. So the scheduler anchors on a base city.

Travel time is haversine distance and a walking speed. An unguarded Rome→Venice leg is about **90 hours on foot**. The engine has no intercity transit model and the dataset gives me nothing to build one from, so I'd rather refuse that trip than hand you an impossible day. Pace follows the same logic: relaxed drops the evening stop, packed adds an afternoon one, and lunch and dinner never move — "relaxed" means fewer things, not no lunch. Walking-only stuck for the same reason: Venice made driving look wrong, and most same-day hops are sub-kilometer anyway.

## Things that tripped me up

**Two sources of truth.** My first design regenerated the itinerary from preferences. Delete the Colosseum by hand, then ask Navi to make day 2 lighter, and regeneration puts it back — prefs never knew you removed it. The fix was one serializable `TripState` — `{ city, startDate, prefs, days: [{ placeId, slot }] }` — as React state, sessionStorage, and the API wire format. Buttons and Navi both mutate it through the same pure `TripState → TripState` functions in `src/lib/trip/tools.ts`. Everything displayed derives on render. **Delete the chat box and every edit still works, offline, with no network call.**

**Browse said yes, the engine said no.** Explore offered Add on all 103 places, but `addStop` rejects anything outside the base city. Explore now runs the engine's own eligibility check, and tests assert the two surfaces agree. That audit also surfaced real day trips (Burano, Padua, Como) inside the distance radius but blocked by the city-name gate. I left them blocked — Venice→Burano is a two-hour walk across a lagoon — and stopped flattening the explanation: they read "Day trip," and the detail pane says the round trip would eat most of one of three days.

## Messy data: normalize, don't clean

`italy.json` is never mutated. A one-way `normalize()` builds a typed parallel view and attributes every gap: hours carry `confidence: 'parsed' | 'partial' | 'unknown'`, inferred durations are flagged, and unparseable hours reach the card as "check ahead." Enrichment follows the same line — Wikimedia images (with attribution) and Mapbox static fallbacks are fair; using an outside source to *correct* facts the file states is not. Images lazy-load.

Tags needed modeling, not a bag of strings. About thirty tags sit on roughly five axes (quiet↔lively, hidden-gem↔tourist-heavy, budget↔splurge, …), so the scorer reads signed scalars. Navi sees those scalars too — contradictory adjectives are what a model misreads.

Tests iterate the real file, not fixtures. The first run caught my overnight-hours bug (`8:00-01:00`). A startup `auditPlaces()` pass caught a planted coordinate error — Brera Antique Market says Milan but sits 156 km away — so the scheduler uses each city's median center and drops candidates past a sane radius instead of overwriting the file. Seasonal wording is gated the same way ("open April–October **only**" closes; "**best** April–October" doesn't), and "third Sunday of the month" is surfaced rather than faked.

The unit suite (~96 tests) proves normalize, score, schedule, explore eligibility, and the tool layer against real data. It does **not** cover Navi's prompt behavior or React rendering — those are the honest gaps.

## How I used AI: both, with a hard line

**As a product feature.** If removing the call wouldn't make the product worse at its job — only less impressive to describe — I don't make it. Named add / delete / reorder are buttons. Navi earns the call on requests a button can't express: *"swap the museum for something outdoorsy near the coast, and make day 2 lighter,"* and on read-only questions like *"why is this stop before lunch?"*

```
 UI buttons ─┐
             ├─► pure tool functions (TripState → TripState) ─► TripState
 Navi chat ──┘     searchPlaces · explainStop · nearbyPlaces · addStop
                   removeStop · swapStop · reorderStop · rebalanceDay
```

The model never types a place id from memory — it gets candidates from `searchPlaces` and write tools re-validate them. Tools return structured errors so the model recovers; the loop is capped; `removeStop` is withheld in code unless the instruction asks to remove something. Context is the last three exchanges, capped server-side, with the current itinerary winning if chat and schedule disagree. No session store. Server-side key, zod validation, instruction cap, per-IP rate limit, CORS, structured logging.

I deliberately skipped letting the LLM build the itinerary from raw JSON (hallucinations + hours + this dataset's mess), and skipped embeddings — 103 structured records want in-memory filtering, not a vector store. I'd reconsider past ~10k. The API returns `toolCalls`; the UI discards them on purpose. Navi's reply already narrates the mutation in plain language, and a mechanical tool trail would mostly repeat that for reviewers.

**As a building tool.** I leaned into AI-assisted development the way I'd use a strong pair: to accelerate turning decisions into working code, and as a sounding board for tradeoffs, security, scope, and build calls. I used both Cursor and Claude Code — for architecture discussions, planning, scaffolding, writing and refining code, running CLI commands, and working through TDD on the normalize/score/schedule pipeline. The judgment calls stayed mine: what to cut, what the engine must guarantee, and when a patch was papering over the wrong layer.

That last part mattered on the assistant. My first build failed three tests (invalid JSON, a no-op compound request, leaked function-call syntax). I'd stacked prompt-space patches; the pile was the tell. Diagnosis — with the agents, against the failing cases — showed the tool layer was fine and orchestration was the problem, so I took my own escape hatch: swap models, hold everything else constant, and delete patches based on the re-test. One survived on merit: the `removeStop` gate, because it's enforced in code.

## Shipping it

Vercel's function runtime isn't Vite's compiler, so cross-folder `.ts` imports into `src/` worked locally and broke in production. Source lives in `server/assistant.ts`; esbuild emits `api/assistant.js`. Zero-config detects `/api` *before* `npm run build`, so a gitignored bundle 404s while the static build is green — the bundle stays committed. Mapbox `pk.` tokens that were baked into image URLs are unsigned in data and signed at read time, with a test that fails if a token reappears. React + Vite over Next was deliberate: no SSR story worth a framework. Tried Stripe Projects for provisioning; shipped on Vercel CLI + Git.

## What I'd do with more time

- **Multi-city trips** — day-level city anchoring plus a rail-duration matrix so `estimateTravel` returns transit instead of refusing to walk 400 km. Touches tools, scheduler, and timeline; deserves a real build. Driving comes with it.
- **Offline / bad signal** — cache itinerary reads, precompute map needs, edge CDN. Everything except Navi already runs client-side; I just couldn't prove it on a throttled connection in time.
- **Shared trips** — persistence, identity, conflict resolution on a shared `TripState`. Real product; cut so the core loop got the hours.
- **An eval harness for Navi** — labeled instructions → expected tool calls, the way the unit suite catches engine regressions. Biggest real gap.
- **An error boundary on the dashboard** — Navi replaces trip state wholesale; a render throw after a swap is a white screen. Known, not done.
- **Auth and saved trips** — cut knowingly; nothing in the brief required them.

# 3 Days in Italy — Project Review & Next Steps

> Generated against `plan_proposal.md` on 2026-07-23. Use this as the working doc for
> scoping decisions, the take-home write-up, and the demo walkthrough.

---

## Executive summary

The **deterministic core is strong and largely complete**: normalization, scoring, scheduling,
availability checks, data audit, and 65 passing unit tests. The **UI has outpaced the plan** —
there is a polished dual-view dashboard (map + list) with drag-reorder, images, and Mapbox
routing that goes beyond what v1 scoped.

The **LLM layer is entirely unbuilt**: no API routes, no Anthropic SDK, no intent parsing, no
grounded rationale, no server-side security. This is the single largest gap relative to the
plan and the take-home brief's "how AI was used" requirement.

**Recommendation:** Stop adding UI polish. Ship Phase 3 (LLM + security + observability),
tighten a few loose ends in existing functionality, then do a minimal deploy + write-up. Treat
everything in `thoughts.md` (Stripe subscriptions, multi-user sharing, loading animations) as
explicitly out of scope.

---

## What the app is today

A Vite + React SPA that plans a **3-day, single-city trip** across Rome, Florence, Venice, or
Milan using a **pure deterministic engine** over 103 places from `italy.json`.

### User flow

1. **Landing** (`/`) — Hero with CTA opens the planner modal.
2. **Planner form** — User picks start date, base city, interest chips, pace, budget, and an
   optional free-text notes field.
3. **Dashboard** (`/dashboard`) — Renders the generated itinerary with:
   - **Map view** — Mapbox GL map with numbered pins, popups, optional per-day walking routes.
   - **List view** — Tab-per-day detailed cards with images, hours confidence, seasonal notes.
   - **Sidebar** — Mini calendar and selected-place detail panel.
4. Plan persists in `sessionStorage` for the browser session.

### Architecture (as built)

```
italy.json (immutable)
    │
    ▼
normalize() ──► PLACES[] (module load)
    │
    ▼
PlannerCard chips ──► planToPrefs() ──► TripPrefs
    │
    ▼
buildItinerary(places, prefs, { city, tripDates })
    │   rankPlaces → geo filter → availability filter → cluster → slot
    ▼
buildDayPlans() ──► Dashboard (map / list / calendar / details)
```

**Not in the pipeline:** `plan.notes` (collected but discarded), LLM intent parse, LLM
rationale.

---

## Feature inventory

### ✅ Implemented and aligned with plan

| Area | What exists |
|------|-------------|
| **Data normalization** | `normalizePlace()` with attributed gaps (`hours.confidence`, `duration.inferred`). `italy.json` untouched. Tests iterate all 103 real places. |
| **Hours parsing** | Tolerant parser for ~8 formats, overnight wraparound, partial/unknown confidence. |
| **Tag canonicalization** | `local_favorite` → `local-favorite`, etc. |
| **Data audit** | `auditPlaces()` flags duration/window mismatches, booking+no-hours, low-rating outliers, geo outliers, seasonal closures. Logs in dev on load. Regression tests for planted gotchas. |
| **Scoring** | Tag overlap + rating + budget fit + authenticity/tourist-heavy axis. Transparent `ScoreBreakdown`. |
| **Scheduling** | Single-city anchor, geo clustering (nearest-neighbour), daypart ordering, pace templates (relaxed/balanced/packed), meal slots, id-based dedup. |
| **Availability** | Day-of-week from parsed hours; seasonal month windows from closure prose only; excludes places closed for entire trip when dates given. Conservative by design. |
| **Geo sanity gate** | 40 km radius from city median centre — catches Brera Antique Market coordinate typo. |
| **Travel estimates** | Haversine + walking speed for between-stop labels (instant, no network). |
| **Preference UI** | City picker (4 dense cities), interest chips, pace, budget, date picker, notes textarea (500 char cap). |
| **Itinerary display** | Per-day stops with type, hours, duration, price, rating, travel legs, seasonal notes, booking flag, tag badges. |
| **Hours honesty** | "Hours unclear" / partial badges on cards and map popups. |
| **Tests** | 7 test files, 65 tests — normalize, tags, score, planPrefs, availability, itinerary, directions. All passing. |

### ⚠️ Implemented but diverges from plan (scope decisions needed)

| Feature | Plan said | Built instead | Verdict |
|---------|-----------|---------------|---------|
| **Map** | Stretch: react-leaflet + OSM, no API key | Mapbox GL + live walking route API | **Keep for demo** — strong visual, but document as scope expansion. Requires `MAPBOX_API_KEY` in client. |
| **Images** | v1 skip external enrichment; mention in "more time" | Wikimedia + Mapbox static script, lazy-loaded thumbnails | **Keep** — legitimate enrichment (no image field in dataset). Offline at runtime. |
| **Start date** | Optional, unset by default | Required field, defaults to today | **Tighten** — make optional per plan; availability logic already handles both modes. |
| **Dashboard UI** | "3-day itinerary board" | Full dashboard: map/list toggle, calendar, details panel, accordion + tabs, 1200+ lines CSS | **Freeze** — sufficient for demo; don't add more UI chrome. |
| **Drag reorder** | "Swap/remove a stop (re-runs the pure engine)" | Drag reorder only; cosmetic state change, no engine re-run, no remove/swap/regenerate | **Tighten or cut** — either wire remove/swap/regenerate to engine, or drop reorder to avoid implying engine-backed edits. |
| **Notes field** | Free text → LLM intent parse → structured prefs | Collected, saved to sessionStorage, **never read** | **Wire or hide** — dead UI erodes trust in the "adjusted for" story. |

### ❌ Not implemented (in plan, required for submission)

| Area | Plan reference | Status |
|------|----------------|--------|
| **LLM intent parsing** | §3 — `/api/parse-intent`, structured output → `exclude[]`, `mustInclude[]`, `dayConstraints[]`, `notes` | Not started |
| **"Adjusted for" readout** | §3, §7 — separate strip showing LLM parse results | Not started |
| **LLM grounded rationale** | §3 — `/api/rationale`, per-day narrative, anti-hallucination name check | Not started |
| **API security** | §4 — key in env, serverless only, input validation (zod), rate limit, CORS | Not started |
| **Observability** | §5 — structured server logs (request id, model, tokens, latency) | Not started |
| **Graceful LLM degradation** | §5 — itinerary renders even if LLM fails | N/A until LLM exists |
| **zod** | §9 stack addition | Not installed |
| **@anthropic-ai/sdk** | §9 stack addition | Not installed |
| **Component test** | §6 — one happy-path test with mocked API | Not started (`@testing-library/react` not installed) |
| **Regenerate day** | §7 interactions | Not started |
| **Swap/remove stop** | §7 interactions | Not started |
| **Error boundary** | §5 | Not started |
| **Deployment** | §8 — Stripe Projects → Vercel | Not started |
| **Write-up** | §11 — 1–2 page note | Not started |

---

## Scope creep analysis

### Justified additions (keep, mention in write-up)

1. **Geo-outlier filtering** — Discovered via real testing (Brera Antique Market 156 km from
   Milan). Directly addresses a planted data gotcha the plan didn't originally list. Good
   engineering judgment story.

2. **Place images** — Dataset has no image field; offline Wikimedia enrichment is explicitly
   allowed. Adds polish without runtime dependency.

3. **Map view** — Plan listed as stretch; you've built it. Valuable for the demo video. Note
   the tradeoff: Mapbox API key in client vs plan's zero-dependency haversine approach.

### Unjustified / premature (skip for v1)

From `thoughts.md` and in-flight ideas — **do not pursue before submission:**

| Idea | Why skip |
|------|----------|
| Stripe subscription / pro tier | Pure scope creep; unrelated to brief |
| Multi-user trip sharing | Requires auth, backend, real-time — weeks of work |
| User research phase | Nice for video mention, not a build task |
| Fiat/Vespa loading animation | Polish with no grading value |
| CDN/edge caching for bad wifi | Premature optimization; static SPA is already light |
| React vs Next tradeoff essay | Write-up material only, not a feature |
| Multi-city with driving between cities | Correctly deferred in plan §11 "more time" |
| Swap list/map detail levels further | UI rabbit hole; current split is fine |

### Accidental scope creep (tighten)

1. **Dead notes field** — UI promises LLM value that doesn't exist. Either implement parse or
   remove/hide until Phase 3 lands.

2. **Drag reorder without engine integration** — Implies user control the engine doesn't
   support. Reorder doesn't violate constraints (hours, availability) because it's cosmetic,
   but it also doesn't re-optimize the day.

3. **Required start date** — Adds friction the plan explicitly avoided. The engine already
   supports date-agnostic mode.

4. **Mapbox routing in browser** — Nice, but adds external dependency and token management.
   Haversine labels already work. Consider making Mapbox routes opt-in or demo-only.

---

## What to add (prioritized)

### P0 — Required for a complete submission

1. **Serverless API layer** — Move to Vercel-compatible `/api` routes (or add `vercel.json`
   + adapter). Even a thin Express proxy works for local dev.

2. **`/api/parse-intent`** — Anthropic Haiku, structured JSON output (zod schema):
   `exclude[]`, `mustInclude[]`, `dayConstraints[]`, `notes`. Merge into `TripPrefs` /
   `BuildOptions`. Cap input at 500 chars.

3. **`/api/rationale`** — Stream per-day narrative from chosen place names. Validate every
   emitted name against `PLACES_BY_ID`. Degrade gracefully on failure.

4. **"Adjusted for" strip** — Read-only UI showing LLM parse results, separate from chips.

5. **Security basics** — API key in env only, zod validation server-side, simple per-IP rate
   limit, CORS to own origin.

6. **Observability** — Structured `console.log` per request: id, model, tokens, latency,
   outcome.

7. **Write-up** — 1–2 pages covering what/why, hybrid engine tradeoff, how AI was used,
   what you'd do with more time.

### P1 — High value, low effort

8. **Regenerate day** — Re-run `buildItinerary` for one day with used-ids excluded. Pure
   engine, instant, matches plan §7.

9. **Remove stop** — Drop a stop and optionally backfill from ranked pool. Simpler than
   full swap.

10. **Wire notes → parse-intent** — On form submit, call parse-intent if notes non-empty;
    show adjusted-for strip on dashboard.

11. **Error boundary** — Wrap dashboard; show itinerary even if rationale fails.

12. **One component test** — Happy path with mocked `/api/*`.

### P2 — If time remains

13. **Deploy** — Stripe Projects → Vercel. Good demo talking point.

14. **Make start date optional** — Align with plan; show seasonal notes as advisory when unset.

15. **Audit panel in UI** — Dev-only or collapsible "data quality" section for walkthrough
    (currently console-only).

---

## What to skip

| Item | Reason |
|------|--------|
| Stripe subscription model | Not in brief; distracts from core story |
| Multi-city / inter-city travel | Plan's "more time" section |
| Real routing API beyond Mapbox walking | Haversine is adequate for 3-day single-city |
| react-leaflet migration | Mapbox already works; switching is waste |
| Saved/shareable itineraries | Needs backend + auth |
| Eval harness for LLM prompts | "More time" — mention, don't build |
| Further CSS/dashboard polish | Diminishing returns |
| Loading animations | Fun but not graded |
| `@testing-library/react` exhaustive coverage | One happy-path test is enough per plan |

---

## What to tighten in existing functionality

### 1. Notes field — wire or hide

`plan.notes` is saved to `sessionStorage` but never consumed. The dashboard has no "adjusted
for" strip. **Action:** Either call parse-intent on submit and surface results, or hide the
textarea until the API exists.

### 2. Start date — optional by default

Plan §7: "unset by default… zero added friction." Currently required with `min={today}`.
**Action:** Allow empty date; pass `tripDates: undefined` to engine; show seasonal notes as
informational only.

### 3. Interactions — align with plan language

Plan promises "regenerate a day, swap/remove a stop (re-runs the pure engine)." Current drag
reorder is UI-only. **Action:** Add regenerate-day (P1 above). Either add remove with
engine backfill, or document reorder as manual override and remove the drag handle to avoid
overpromising.

### 4. Mapbox dependency — document the tradeoff

Walking routes call Mapbox Directions API from the browser. Plan v1 explicitly chose
haversine to avoid external deps. **Action:** Keep for demo, but note in write-up. Ensure
`.env.example` documents the public token requirement. Map already degrades gracefully when
token is missing.

### 5. Availability gaps — honest limits

Ordinal rules ("third weekend of each month", Vatican last-Sunday exception) are intentionally
not parsed. Brera Antique Market is excluded by geo filter, not by its seasonal note.
**Action:** Don't try to parse ordinals for v1. Surface `seasonalNotes` prominently on
affected cards (already done). Mention conservative parsing as a deliberate tradeoff in the
write-up.

### 6. `TripPrefs` shape — extend for LLM output

Current `TripPrefs` has `interests`, `budget`, `authenticityPref`, `pace`. Plan's LLM parse
adds `exclude[]`, `mustInclude[]`, `dayConstraints[]`. **Action:** Extend `TripPrefs` and
filter/rank logic to honor exclusions and must-includes before scheduling.

---

## Phased build status (from plan §10)

| Phase | Status | Notes |
|-------|--------|-------|
| **1. Data + engine** | ✅ Complete | Exceeds plan with geo-outlier gate |
| **2. UI shell** | ✅ Complete | Exceeds plan with full dashboard |
| **3. LLM layer** | ❌ Not started | **Critical path** |
| **4. Polish** | 🟡 Partial | Reorder yes; regenerate/swap/remove no; map yes; error states partial |
| **5. Write-up + deploy** | ❌ Not started | |

---

## Suggested path to finish

```
Week/day 1 (now)     Phase 3: API routes + zod + Anthropic SDK + parse-intent + rationale
                     Wire notes on submit; add "adjusted for" strip; error boundary
Week/day 2           Regenerate day + remove stop; one component test
                     Make start date optional
Week/day 3           Deploy (Stripe Projects → Vercel); write-up; record demo video
```

**Do not start** any new UI features, Stripe billing, or multi-user work until Phase 3 ships.

---

## Demo walkthrough talking points

Use these to connect built work to plan decisions:

1. **Show dev console audit** — "Here's what the normalization layer caught in the planted
   dataset" (Osteria Francescana, Hard Rock Cafe, booking+no-hours, Brera geo outlier).

2. **Show hours confidence badges** — "We normalize, don't cleanse — unclear hours are
   flagged, not invented."

3. **Milan + October 1 trip** — Brera Antique Market excluded by coordinate sanity check,
   not by parsing "third weekend of each month."

4. **Chip-only planning works offline** — Interests/pace/budget need zero AI.

5. **Free text earns its LLM call** — (once built) show notes → adjusted-for strip, distinct
   from chips.

6. **Hybrid boundary** — "The LLM never picks places or checks hours; the engine does."

---

## Appendix: test coverage map

| Module | Tests | Plan requirement |
|--------|-------|------------------|
| `normalize.ts` / `parseHours` | ✅ Extensive | ✅ |
| `tags.ts` | ✅ | ✅ (normalizeTags) |
| `score.ts` | ✅ | ✅ |
| `availability.ts` | ✅ | ✅ |
| `audit.ts` | ✅ Via normalize.test | ✅ |
| `itinerary.ts` | ✅ Including geo + seasonal gates | ✅ |
| `directions.ts` | ✅ | (haversine) |
| `planPrefs.ts` | ✅ | (adapter) |
| zod LLM output validation | ❌ | Planned |
| Component happy path | ❌ | Planned |

---

## Appendix: stack delta from plan

| Planned | Installed | Action |
|---------|-----------|--------|
| `zod` | ❌ | Add |
| `@anthropic-ai/sdk` | ❌ | Add |
| `vitest` | ✅ | — |
| `@testing-library/react` | ❌ | Add for one test |
| `react-leaflet` + `leaflet` | ❌ (used Mapbox instead) | Skip |
| Vercel serverless `/api` | ❌ | Add |

# 3 Days in Italy — Build Plan & Design Notes

> Working doc for the Stripe AI Engineer take-home. Doubles as raw material for the
> required 1–2 page write-up. Captures decisions + the *why*.

## 1. The product thesis (the judgment call being graded)

**3 days is not enough for Rome + Florence + Venice.** The dataset spreads 103 places
across 16 cities, but density is concentrated: Rome (30), Florence (20), Milan (15),
Venice (15); every other "city" has 1–9 (day-trip towns like Bellagio, Burano, Pienza).

A naive planner that picks the 9 highest-rated places nationwide sends the traveler on
impossible cross-country hops. So the core decision:

- **Anchor the trip on one base city** (Rome / Florence / Venice / Milan — the four dense
  enough to fill 3 days).
- **Cluster each day geographically** using lat/long to minimize travel, with a realistic
  daily rhythm (morning sight → lunch → afternoon → aperitivo/evening → dinner).

This is the "right thought and tradeoffs" the brief rewards, at small scale.

## 2. The data (source of truth) — and its messiness

103 places. Fields: name, type, city, region, neighborhood, description, lat, long, hours,
duration_minutes, price_range (€–€€€€), rating (2.1–5.0), tags, seasonal_notes,
booking_required.

Realistic-not-clean issues to handle in a **normalization layer**:
- `hours`: 33 null + ~8 formats (`9:00-19:00`, `8am-7pm`, `Mon-Sat 12:30-14:30, 19:30-22:30`,
  `Daily 9:00-23:00`, `Evenings`, even `7:30-24:00`). Tolerant parser → structured
  `{open, close}` per weekday; unknown/`Evenings` handled gracefully (don't crash, flag it).
- Tag inconsistency: `local-favorite` (43) vs `local_favorite` (1) → normalize/canonicalize.
- Missing: `duration_minutes` ×9 (default by type), `neighborhood` ×19, `booking_required` ×1.
- lat/long complete for all 103 → geographic clustering + travel estimates are viable.

### Concrete planted gotchas found via audit (why this dataset is shaped this way)

The JD explicitly frames the role around engineering judgment over AI novelty ("not for
novelty, but measurable productivity improvement," "AI is a tool in your belt, not a
substitute for judgment"). This dataset reads like a proxy test for exactly that — a naive
"feed the raw JSON to an LLM and ask it to plan" approach gets several of these wrong
silently; a deliberate deterministic layer catches them structurally:

- **Rating trap**: `Hard Rock Cafe Rome` — 2.1★, tagged only `tourist-heavy`. Biggest outlier
  in the dataset (next-lowest is 3.8). A scorer that weights rating naturally excludes it;
  an LLM given the raw list has no structural reason to unless it reads carefully.
- **Internal inconsistency**: `Osteria Francescana` — `duration_minutes: 240` but its longest
  single opening window is 120 min (`Tues-Sat 12:30-14:00, 20:00-22:00`). Policy: treat
  `duration_minutes` as time-to-block on the schedule; the hours window constrains *start*
  time, not full containment (a tasting menu can run past a nominal "seating" window).
- **`booking_required: true` + `hours: null`** on 4 experiences (Chianti bike day, balsamic
  tasting, cheese/prosciutto tour, gondola ride) — the real scheduling info lives in
  `seasonal_notes` prose instead ("Tours run weekday mornings only"). Needs a fallback chain:
  `hours` → `seasonal_notes` text → sensible default — never "null hours = open anytime."
- **`seasonal_notes` sometimes overrides availability, not just flavor**: Vatican Museums
  closed Sundays except the last Sunday of the month; several Lake Como / rooftop entries
  only open April–October regardless of what `hours` says. A pure hours-string parser misses
  this entirely. → **Decision: add an optional trip-start-date field** (see §7) so the
  scheduler can check day-of-week and seasonal windows against real dates when provided, and
  fall back to day-agnostic scheduling when it isn't.
- **Neighborhood name collision**: `"San Marco"` exists in both Florence and Venice — never
  key/group by neighborhood without scoping by city first.
- **Same-coordinates, different-id pairs**: `Trevi Fountain` (day) / `Trevi Fountain by Night`
  (evening); `Mercato Centrale Firenze` (ground-floor market) / `Mercato Centrale` (upstairs
  food hall, different id). Dedup must be by `id`, never by name-similarity or coordinate
  proximity — collapsing these loses real, distinct, legitimately pairable stops (bookending a
  day with Trevi at dawn and by night is a genuinely good move, not a duplicate to eliminate).
- **`tourist-heavy` correlates with the worst ratings** in the dataset (the only three
  historic/restaurant entries under 4.0 are all tagged `tourist-heavy`) — a real, usable
  signal worth weighting in the scorer, and the concrete mechanism behind an "avoid touristy"
  preference (chip or free-text).

**Make this legible, not just handled:** ship a small data-audit function that runs once at
load time and logs exactly these categories (duration > window, `booking_required` with no
hours, missing-field counts, price/type oddities) — a concrete artifact to point to in the
walkthrough video ("here's the validation pass, here's what it caught"), not something the
reviewer has to trust silently happened.

### Normalize, don't cleanse — the non-destructive contract

`italy.json` stays untouched on disk — it is "the source of truth," not raw material to
mutate. The pipeline is a pure, one-way transform: `normalize(rawPlace) → NormalizedPlace`,
producing a parallel typed view the engine/UI consume, where every filled gap or resolved
conflict is **attributed, not hidden** (e.g. `hoursConfidence: 'parsed' | 'inferred' |
'unknown'`, `durationInferred: boolean`). A test diffs `normalize()` output against raw input
per place to prove nothing was silently overwritten.

Failures degrade **gracefully and visibly**, never silently: unparseable hours or missing
duration never crash the app and never get invented — they carry `confidence: 'unknown'`
through to a small honest badge on that stop's card ("hours unclear — check ahead"), not a
guessed value presented as fact.

**External enrichment** ("you may enrich... but must use this dataset") is for capabilities the
source genuinely lacks — no `image` field exists at all, so a per-city image lookup is
legitimate; real routing for travel time is another candidate. It is **not** license to
cross-reference an external source to "correct" facts already stated (e.g. fixing Osteria
Francescana's duration, or inventing real hours for the null-hours entries) — that would erase
the exact messiness the exercise is testing against. **Decision: skip external enrichment for
v1.** Haversine distance + a fixed walking-speed assumption gives adequate travel-time
estimates with zero external dependency, zero added latency, zero new attack surface — keeps
scope simple/explainable per the project's own stated constraint. Real routing/images become a
"what I'd do with more time" write-up line, not a v1 feature.

## 3. Architecture — hybrid engine (keep the LLM out of the hard-constraint path)

```
Free-text intent ─►[LLM: parse → structured prefs]┐
Dataset(103)─►normalize─►filter─►score─►schedule──►itinerary
                         (deterministic, pure, unit-tested)│
                              itinerary─►[LLM: grounded rationale]┘
```

**Deliberate boundary:** a deterministic, pure-function engine owns everything that must be
*correct* — opening hours, no double-booking, realistic day packing, geo clustering. The LLM
handles only the fuzzy-human parts it's good at. This means:
- The LLM can't invent a restaurant or book a closed museum (correctness stays in code).
- The interesting logic is unit-testable (parsers + scorer + scheduler are pure).
- Answers "AI as building tool vs product feature" = **both**, with a mature justification.

### LLM touchpoints (both grounded, both cheap)
1. **Intent parsing** — free text must earn its LLM call by extracting things a fixed chip UI
   *cannot* express, not by re-deriving what chips already set. Chips own `interests[] / pace /
   budget` directly, zero AI involved. Free text is optional enrichment layered on top, parsed
   into fields with no chip equivalent: `exclude[]` ("already did the Colosseum," "no seafood"),
   `mustInclude[]`, `dayConstraints[]` ("keep day 3 light, 6pm flight," "one splurge dinner"),
   and `notes` (dietary/accessibility/occasion context fed into the rationale prompt). Structured
   Outputs (`output_config.format` + json_schema) keeps this a guaranteed-valid, bounded object —
   never free-form instructions the engine has to trust blindly. If free text contains nothing
   outside the chip-expressible space, the parse is a harmless no-op — same as any unused
   optional field, not a duplicated mechanism.
   - **Don't reflect the parse back into the same chip toggles** — that visually confirms "I
     could've just clicked this." Surface it instead as a separate read-only strip (e.g.
     *"Adjusted for: no stairs, vegetarian, lighter day 3"*) so it's visibly doing something
     clicking can't.
2. **Grounded rationale** — given the places the engine already chose, write a warm per-day
   narrative. Validate every place name it emits exists in the dataset (anti-hallucination).

### Model choice
- Provider: **Anthropic Claude** (SDK `@anthropic-ai/sdk`).
- Default to **Claude Haiku 4.5** (`claude-haiku-4-5`) for both calls — the tasks are simple,
  grounded, latency-sensitive, and cost-conscious (a good production signal). Structured
  outputs are supported. Can bump the rationale call to **Sonnet 5** for nicer prose if
  desired — thin provider interface makes it a one-line change.
- Adaptive thinking not needed here (simple extraction/generation); keep calls fast.

## 4. Security (production thinking at small scale)

The threat surface is the LLM proxy. Defenses:
- **Key never in the client** — Anthropic call lives in a serverless function (`/api/*`),
  key from env. The React bundle never sees it.
- **Prompt injection** — user free-text is treated as *data*. The intent-parse call
  constrains output to a strict enum schema, so injected instructions can at worst mis-set
  a preference (low blast radius) — they cannot change behavior. Rationale output is plain
  text rendered by React (auto-escaped), and place names are validated against the dataset.
- **Input validation** — cap free-text length (≈500 chars), reject oversize; validate the
  city/pref payload against a zod schema server-side.
- **Rate limiting** — per-IP token bucket in the function (note: Upstash/Redis for real prod).
- **CORS** — restrict to own origin. No secrets/PII in URLs, query strings, or logs.

## 5. Observability

- Structured server logs per request: request id, model, latency, input/output tokens,
  outcome (ok/refusal/error). (`response.usage` gives token counts.)
- Client error boundary; graceful degradation — if the LLM call fails, the deterministic
  itinerary still renders (LLM only adds parsing convenience + narrative).

## 6. Testing (Vitest + React Testing Library)

Pure functions make this cheap and high-value:
- `parseHours` across all the messy formats + nulls, including the `hours → seasonal_notes →
  default` fallback chain for `booking_required` experiences with null hours.
- `normalizeTags` / `normalizePlace`.
- `scorePlace` (tag overlap + rating + budget fit + tourist-heavy penalty).
- `resolveAvailability(place, date?)` — day-of-week + seasonal window check when a trip date is
  provided (Vatican Sunday exception, Apr–Oct-only entries); pass-through when it isn't.
- `auditDataset()` — the load-time data-quality pass; test it against the known planted cases
  (Osteria Francescana duration > window, the 4 null-hours booking_required experiences) so the
  audit itself has regression coverage.
- `buildItinerary` (3 days, no dupes **by id**, respects durations & meal slots, clusters by
  location) — include a same-coordinates-different-id fixture (Trevi day/night) to prove dedup
  is id-based, not name/coordinate-based.
- zod validation of LLM output (accept good, reject malformed).
- One component test of the happy path with the API mocked.

## 7. UX / UI

- City picker (required) + lightweight preference controls (interest chips, pace, budget) that
  work standalone with zero AI. An optional free-text box layers on top for exclusions,
  must-haves, schedule constraints, and context chips can't express (see §3) — shown back to
  the user as a distinct "adjusted for" readout, not as pre-toggled chips.
- **Optional trip-start-date field** (small date picker, unset by default). When set, the
  scheduler resolves day-of-week + seasonal windows against real dates (Vatican Sunday
  exception, Apr–Oct-only entries) and can flag/exclude closed places per day. When unset,
  falls back to day-agnostic scheduling and surfaces `seasonal_notes` as informational text
  only. Zero added friction for users who don't care about exact dates, correct behavior for
  those who do.
- 3-day itinerary board: per-day cards, each stop showing type, hours, duration, price,
  rating, travel time to next; per-day AI rationale.
- Interactions: regenerate a day, swap/remove a stop (re-runs the pure engine — instant).
- **Stretch (optional enrichment):** map with pins per day via react-leaflet + OSM tiles
  (no API key). Adds a strong visual; keep behind a clean boundary so it's cuttable.

## 8. Deployment — Stripe Projects → Vercel (deferred, revisit at the end)

Experiment talking point for the walkthrough video. Flow:
`stripe plugin install projects` → `stripe projects init` → `stripe projects add vercel/project`
→ `stripe projects env --pull` → push → Vercel deploys. Vite + `/api` serverless functions
map cleanly onto Vercel. Commit `.projects/state.json`; `.env` and vault stay gitignored.

## 9. Stack additions to the scaffold

- `zod` (schema validation, shared client/server).
- `@anthropic-ai/sdk` (serverless function only).
- `vitest`, `@testing-library/react`, `jsdom`.
- (stretch) `react-leaflet` + `leaflet`.

## 10. Phased build

1. **Data + engine** — types, `normalize()`, `parseHours`, scorer, `buildItinerary`; unit tests.
2. **UI shell** — city + preferences, itinerary board rendering the engine output.
3. **LLM layer** — `/api/parse-intent` (structured), `/api/rationale` (streamed, grounded);
   client wiring; security (validation, rate limit, CORS); observability logging.
4. **Polish** — swap/regenerate interactions, empty/error states, optional map.
5. **Write-up + deploy** — the note (what/why, more-time, how AI was used) + Stripe Projects.

## 11. Write-up angles (for the required note)
- What/why: the anchor-city + hybrid-engine decision and its tradeoffs.
- More time: multi-city with inter-city travel, real routing API, saved/shareable itineraries,
  richer seasonal-hours handling, eval harness for the LLM prompts.
- How AI was used: **both** — building tool (this workflow) and product feature (intent parse
  + grounded rationale), with the deliberate "LLM out of the constraint path" boundary.
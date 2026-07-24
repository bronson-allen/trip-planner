# AI integration plan — assistant over a deterministic tool layer

> Supersedes the AI portion of `plan_proposal.md` (§3's two-endpoint parse-intent/rationale
> design) and `DEFINITION_OF_DONE.md`'s LLM section. Those are now stale for the AI layer.

## Thesis

The itinerary is one shared state: a list of stops. Both the **CRUD buttons** and the **chat
assistant** mutate it by calling the *same deterministic tool functions*. The LLM never writes
itinerary state and never invents a place — it only (a) translates fuzzy intent into a
structured call to a tool that already exists, and (b) turns the structured result back into
natural language. The deterministic tools own every real decision: validating IDs against the
dataset, checking hours/geography, recomputing feasibility. If you deleted the chat box, the
buttons still call the identical functions — that is what makes the AI load-bearing, not decor.

```
CRUD buttons ─┐
              ├─► pure tool functions (TripState → TripState) ─► TripState (single source of truth)
Chat input  ──┘        searchPlaces, swapStop, rebalanceDay, explainStop, …
```

## Why tool-calling, not a single structured-output call

A single "parse instruction → operations" call can't do *search-then-decide-then-act*
("swap the museum for something outdoorsy near the coast under budget" = find candidates, pick
one, swap), and can't do read-only Q&A. Tool-calling handles all chat through one path: the
model picks a tool, the tool returns real data, the model reacts. Justified, not novelty.

## Where chat has real leverage over buttons (demo priorities, in build order)

1. **Read-only Q&A** — "why is this before lunch?", "what's near dinner?" A *different
   capability* from CRUD (queries state, never mutates). Zero mutation risk → build first.
2. **Compound multi-constraint requests** — "swap the museum for something outdoorsy, near the
   coast, under budget." Combinatorially impossible to pre-build as UI controls.
3. **Cross-cutting re-plans** — "make day 2 lighter, move something to day 3." One instruction
   = a re-optimization across the whole itinerary the scheduler already knows how to do.

**Not chat's job:** "delete the Colosseum", "add this specific place" — one unambiguous action,
a button is faster and more reliable. Chat may parse them, but they aren't the centerpiece.

---

## Data & state schema changes (do this FIRST — it unblocks everything)

The place schema (`NormalizedPlace`) is **already correct and needs no changes** — leave
`normalize.ts` alone. The change is in how the *itinerary* is represented in app state, so the
tools have a clean, serializable, id-based thing to mutate.

### The problem in the current code

- `DashboardPage` holds `DayPlan[]` as the source of truth — a heavy view-model fusing full
  place objects, travel estimates, and date metadata (`data/tripView.ts`).
- `prefs` (`TripPrefs`) is computed inside `buildDayPlans` and **discarded** — but
  `searchPlaces` / `rebalanceDay` need it to re-rank candidates the way the plan was built.
- A stop is addressable only by array position — no stable handle for "swap *this* stop."

### The fix: split source-of-truth (light) from rendered view (derived)

```ts
// The single serializable source of truth. Ids only — no resolved place objects and no
// travel estimates (both are DERIVED for rendering). Doubles as the API wire format.
export type PlannedStop = { placeId: string; slot: SlotKind }
export type TripState = {
  city: string
  startDate: string     // ISO; drives calendar dates + seasonal availability
  prefs: TripPrefs      // the SAME prefs that generated the plan; tools reuse them
  days: { day: number; stops: PlannedStop[] }[]
}
```

- `initTripState(plan)` — runs `planToPrefs` + `buildItinerary`, projects to ids. (Replaces the
  build half of `buildDayPlans`.)
- `resolveTrip(state, places)` → `DayPlan[]` — resolves ids via `PLACES_BY_ID`, computes travel
  estimates, adds date metadata + theme. Returns the **same `DayPlan[]` shape the components
  already consume**, so no component changes. (Replaces the view half of `buildDayPlans`.)
- `DashboardPage` holds `TripState`; derives `DayPlan[]` with `useMemo(() => resolveTrip(...))`.

### Why this is simpler, not more complex (talking points)

- **Stop identity is free**: `placeId` uniquely identifies a stop — the scheduler already
  guarantees no place repeats per itinerary; every tool preserves that invariant.
- **No serialize seam**: `TripState` is already ids-only, so it *is* the API wire format —
  client holds it, sessionStorage persists it, the API receives it, tools mutate it. One
  representation end to end; nothing to convert or keep in sync.
- **Derived data can't go stale**: travel estimates are recomputed on every render, so reorder
  and swap update walking times automatically (also fixes the earlier "cosmetic reorder" issue).
- **Dataset stays server-side**: the payload is ~15 tiny `{placeId, slot}` entries, not 15
  nested place objects; the server rehydrates from its own copy of `italy.json`.

### File structure

- New `src/lib/tripState.ts` — `TripState`, `initTripState`, `resolveTrip` (absorbs and then
  retires `src/data/tripView.ts`; state logic belongs in `lib/`, not `data/`).
- New `src/lib/tools.ts` — the pure tool functions (below).
- New `/api/assistant.ts` — the serverless endpoint (Vercel convention).
- Cleanup pass: remove `src/data/dummyTrip.ts` if unreferenced after the refactor.

---

## The tool layer (shared, pure, tested — the load-bearing part)

`src/lib/tools.ts`. Every function is pure and id-based: `(state, places, args) → state | result`.
No component state, no I/O. Imported by **both** the client (buttons call directly, no network)
and the serverless function (LLM calls via tool-calling). Reuses the existing engine
(`rankPlaces`, `scorePlace`, `isClosedForTrip`, `estimateTravel`, the city/radius helpers).

| Tool | Kind | Purpose | Enforces |
|---|---|---|---|
| `searchPlaces` | read | candidates matching `{tags?, maxPrice?, type?, nearPlaceId?}`, ranked | returns only real dataset ids not already in the trip |
| `explainStop` | read | `{scoreBreakdown, slot, daypartReason, travelFromPrev}` for a stop | placeId is in the trip |
| `nearbyPlaces` | read | dataset places within radius of a stop | anchor stop exists |
| `addStop` | write | insert `placeId` into `day` at its scored position | ▼ shared invariants |
| `removeStop` | write | drop `placeId` | placeId is in the trip |
| `swapStop` | write | replace one stop's place with another | ▼ shared invariants |
| `reorderStop` | write | move a stop within its day | placeId is in the trip |
| `rebalanceDay` | write | drop/move lowest-value stop(s) toward "lighter"/"fuller" | ▼ shared invariants |

**Shared invariants** every write tool enforces (the same gates `buildItinerary` applies, so an
edit can never produce a plan the builder wouldn't): place is real, in the base city, within the
city radius, open on the trip dates, and not a duplicate of a place already in the trip. On any
violation the tool returns a **structured error** (never throws) so the model can recover
("that's closed that day — pick another") instead of the loop crashing.

## The structural safety model (not prompt-based)

- **The model never types an id from memory.** It gets candidate ids only from `searchPlaces`
  output, then passes those exact ids to `addStop`/`swapStop`, which re-validate against the
  dataset. Hallucinated ids are rejected by the tool, not trusted.
- **`max_iterations` cap** on the agent loop (e.g. 5) — bounds runaway tool loops and cost.
- Standard API security: key server-side only, zod-validate the request body, cap instruction
  length (~500 chars), per-IP rate limit, CORS to own origin.
- Structured logging per request: id, model, latency, tokens, **tool calls made**, outcome.

## Server shape — stateless, one endpoint

`/api/assistant`. Request `{ tripState, instruction }`. `tripState` is the light id-based state
(= the wire format, no conversion). The tool-calling loop runs entirely server-side: tools are
closures over a *copy* of `tripState` + the server's `PLACES`/`PLACES_BY_ID`; the model calls
them; the loop caps at `max_iterations`; final assistant text = the answer or change
explanation. Response `{ tripState: updated, message, toolCalls }`. Client swaps its `TripState`,
re-derives the view via `resolveTrip`, renders `message` in the assistant panel, and can surface
`toolCalls` ("here's what it did"). On failure or a tool error, **the client's current
`TripState` is left untouched** — never a broken state.

## Model

Build against **Claude Haiku 4.5** (`claude-haiku-4-5`) — tool use supported, low latency,
cost-conscious. One-line swap to **Sonnet 5** if tool-selection on compound requests
underperforms.

---

## Build phases — each independently shippable; the phasing IS the scope control

- **Phase 0 — state refactor (pure, no behavior change, no AI).** Introduce `TripState` +
  `resolveTrip`; `DashboardPage` holds `TripState` and derives `DayPlan[]`. Verify the app
  renders identically and the existing tests still pass; add one test asserting
  `resolveTrip(initTripState(plan))` matches the old `buildDayPlans(plan)` output. **This is the
  enabling refactor — do it first, confirm green, then move on.**
- **Phase 1 — tool functions + CRUD buttons (still no AI).** Build `tools.ts` as pure,
  unit-tested functions. Wire add / remove / swap / reorder buttons on the cards to call them
  client-side. Completes *manual* editing and gives full graceful degradation. Fixes the
  cosmetic-reorder honesty issue.
- **Phase 2 — `/api/assistant` with READ tools only (minimum shippable AI demo).** Tool-calling
  loop + full security/observability, wired to `explainStop` + `nearbyPlaces`. Q&A chat, zero
  mutation risk. use openai gpt-5.6-luna **This alone is a complete, honest, defensible AI demo.**
- **Phase 3 — write tools in the loop.** Add `swapStop` + `searchPlaces`/`addStop`. Unlocks
  compound multi-constraint requests (leverage #2).
- **Phase 4 — `rebalanceDay`.** Cross-cutting re-plan (leverage #3). Most complex — build last.

**Cut line: after Phase 2 you have a submittable AI story.** Under deadline pressure, cut from
Phase 4 downward — never below Phase 2. Do not add tools beyond the table above.

## Graceful degradation

CRUD buttons and chat call the same tools, but buttons run them client-side with no network. So
the entire app — plan generation *and* manual editing — works with zero AI availability. The
assistant is strictly additive.

## The assistant surface (NaviAssistant, already scaffolded)

Keep it docked to the dashboard (contextual to the plan on screen), not a floating oracle. Keep
the suggestion-chip pattern — it teaches the bounded scope by example. Chips should map to the
three leverage areas ("Why is X first?" / "What's near dinner?" / "Make day 2 lighter" /
"Something outdoorsy instead of X"). Change the "Ask me anything…" placeholder to a scoped one
("Ask about or refine your trip…") — the tool should look bounded, not like a general assistant.

## Open decisions to confirm before building

1. Streaming the assistant's final message (nicer for Q&A) vs. render-on-complete (simpler).
   Recommend render-on-complete for v1; note streaming as a "more time" item.
2. Whether `toolCalls` is surfaced in the UI or just logged. Recommend a small "what changed"
   line under the assistant message — cheap, and the clearest "not novelty" demo signal.

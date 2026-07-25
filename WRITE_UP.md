# 3 Days in Italy — submission note

> **Draft.** Structure and architecture claims are accurate to the shipped code as of
> 2026-07-24. Placeholders marked `«…»` need your input. Target: 1–2 pages — cut before you add.
>
> Raw material worth lifting: `thoughts.md` (process notes on normalization, the Brera coordinate
> bug, the Venice driving-routes decision) and `docs/legacy/write-up-v1.md` (the data-messiness
> section, which is still the strongest prose in the earlier draft).

**Live app:** https://trip-planner-bronson.vercel.app · **Repo:** https://github.com/bronson-allen/trip-planner

**Deployment.** I tried Stripe Projects first to provision Vercel from the Stripe CLI — a natural fit
for a Stripe take-home, and cleaner than juggling provider dashboards by hand. Account ownership
and Projects setup blocked that path, so I fell back to the Vercel CLI / Git integration: same
hosting target, less ceremony. Env vars (`OPENAI_API_KEY`, `MAPBOX_API_KEY`, `APP_ORIGIN`) live in
Vercel, not the repo. The production `/api/assistant` entry is an esbuild bundle of the shared
engine — Vite's local middleware and Vercel's function runtime are not the same compiler, and the
cross-folder `.ts` imports only work once they're bundled.

---

## What I built and why

A trip planner over the provided 103-place dataset. You pick a base city, a start date, and a few
preference chips; a deterministic engine builds a 3-day itinerary; then you refine it — by hand
through the UI, or in natural language through an assistant that can only act through the same
functions the UI buttons call.

**The core judgment call was scope, not features.** The dataset's density is concentrated: Rome,
Florence, Venice and Milan hold most of the 103 places, and everything else is 1–9 entries for
day-trip towns. A planner that picks the nine highest-rated places nationwide sends someone on
impossible cross-country hops. So the scheduler anchors on one base city and geo-clusters each day
around it, rather than pretending to be a general multi-city router. Days follow a real rhythm —
morning sight, lunch, afternoon, evening, dinner — with pace controlling how densely sights pack
between the fixed meals.

**One city per trip — and what happens when you want another.** That constraint is load-bearing,
not cosmetic: travel time is a walking estimate, so an unguarded Rome→Venice leg computes as about
90 hours on foot and lands on a card as a straight-faced number. The engine has no concept of
intercity transit, and the dataset has no data for one. Rather than let the planner produce
confidently infeasible schedules, the city gate stays.

What I did fix was the seam around it. Explore browses all 103 places — seeing the whole catalog is
the point of that surface — but it used to offer an "Add" button on every row and only fail *after*
the click, because the engine rejected the place. It now runs the same eligibility gate the engine
does, so it can only offer adds that will succeed, and everything else moves to a browse-only
"Elsewhere in Italy" section. Out-of-city places get a "Plan Venice" button that starts a fresh
trip anchored there instead of a dead end. Tests assert the two surfaces agree, so they can't drift.

Auditing that gate turned up a real edge I hadn't planned for: **three places sit inside my own
reachability radius but are still rejected.** Burano is 8km from Venice, Padua 36km, Como 39km —
all within the 40km radius the scheduler already uses to mean "reachable on this trip" — but the
city check runs first, so a city-name comparison overrules the geography. On travel merit these
are real day trips; Burano is a classic Venice vaporetto run.

I left them blocked, deliberately. Travel time here is a walking estimate, so Venice→Burano would
compute as a two-hour walk across a lagoon you can't walk, and Venice→Padua as roughly eight.
Opening the gate without a transit model reproduces the exact failure the gate exists to prevent,
just at 8km instead of 400. What I did instead was stop flattening them: those rows now read
**"Day trip"** rather than the same "Not in this trip" as somewhere 116km away, and the detail
pane says plainly that the round trip would cost most of one of only three days — left off for
that reason, not because it isn't worth seeing. The constraint is the same; the user can now tell
which kind of "no" they're getting.

The honest multi-city version needs day-level city anchoring plus a transit model — worth building,
not worth half-building. It's in "more time" below.

**The messy data is the actual test, so I normalized rather than cleaned.** `italy.json` is never
mutated. A one-way `normalize()` pass produces a parallel typed view, and every gap it fills is
*attributed* rather than hidden: hours carry `confidence: 'parsed' | 'partial' | 'unknown'`,
inferred durations carry `duration.inferred: true`, and unparseable hours reach the card as an
honest "check ahead" note instead of an invented time. Tests iterate the real 103-place file, not
fixtures — which is how they caught a genuine bug in my own hours parser on the first run: an
overnight window (`8:00-01:00`) that the regex read as closing before it opened.

There is also a load-time `auditPlaces()` pass that logs what the dataset actually contains:
durations exceeding their own opening window, `booking_required` entries with null hours, rating
outliers, seasonal closures, and geographic outliers. That last category found a planted
coordinate error — Brera Antique Market is tagged Milan but sits 156 km away, which had produced a
"7-hour walk" as the first stop of a Milan trip. «Keep or cut depending on length — this is a
strong concrete detail.»

## Architecture — the LLM is never in the constraint path

```
 UI buttons ─┐
             ├─► pure tool functions (TripState → TripState) ─► TripState (one source of truth)
 Navi chat ──┘     searchPlaces · explainStop · nearbyPlaces · addStop
                   removeStop · swapStop · reorderStop · rebalanceDay
```

The itinerary is one small serializable object — `{ city, startDate, prefs, days: [{ placeId,
slot }] }` — that is simultaneously the client state, the sessionStorage format, and the API wire
format. Ids only; everything rendered (travel times, dates, day themes) is derived on every
render, so it can't go stale.

Both the buttons and the assistant mutate it through the *same* pure tool functions. That's what
makes the AI load-bearing rather than decorative: **delete the chat box and every edit still
works, offline, with no network call.** The assistant is strictly additive.

The safety model is structural, not prompt-based. The model never types a place id from memory —
it gets candidate ids only from `searchPlaces` output and passes those exact ids to
`swapStop`/`addStop`, which re-validate against the dataset before mutating. Every write tool
enforces the same invariants `buildItinerary` does: the place is real, in the base city, within
the city radius, open on the trip dates, not already scheduled. Violations return structured
errors rather than throwing, so the model can recover instead of the loop crashing. The tool loop
is capped at five steps plus one tool-free step for the final answer, and the destructive
`removeStop` tool is withheld from the model entirely unless the instruction explicitly asks to
remove, delete or drop something.

Around that: key server-side only, zod validation on the request body, every incoming itinerary
state re-validated against the dataset, a 500-character instruction cap, per-IP rate limiting,
CORS restricted to the app's own origin, and structured per-request logging with request id,
model, latency, token usage, tool calls made, and outcome.

## How I used AI

**Both — as a building tool and as a product feature — with a deliberate boundary between them.**

As a building tool: «your workflow — Claude Code for architecture discussion, TDD on the
normalize/score/schedule pipeline, the data audit pass. One or two sentences.»

As a product feature, the test I applied was: *if I removed this call, would the product be worse
at its job, or just less impressive to describe?* That test rules out most itinerary edits.
Adding a named place, deleting a stop, reordering a day — those are one unambiguous action each,
and a button is faster and more reliable than a sentence. Building AI into that path would be
novelty.

Where it earns its call is the class of request a button structurally cannot express: *"swap the
museum for something outdoorsy near the coast, and make day 2 lighter."* That's search, then
decide, then act, twice, across two days — combinatorially impossible to pre-build as UI controls.
Tool-calling handles it in one path: the model picks a tool, the tool returns real data, the model
reacts. It also handles read-only questions the UI has no surface for at all — *"why is this stop
before lunch?"* — which mutate nothing.

I deliberately did **not** let the LLM generate the itinerary from the raw JSON. At this scale
that's the tempting shortcut and the wrong one: it hallucinates places, ignores opening hours, and
produces infeasible schedules — and the messiness of this particular dataset makes all three
worse. I also skipped embeddings/RAG entirely; 103 structured records don't need a vector store,
and in-memory filtering isn't just sufficient, it's the correct choice at this size. I'd
reconsider past ~10k records.

## What I'd do with more time

- **Multi-city trips.** The real design is day-level city anchoring (`days: [{ day, city, stops }]`)
  plus an intercity transit model — a rail-duration matrix between city pairs, since the dataset
  has none — so `estimateTravel` returns a transit leg instead of refusing to walk 400 km. That
  touches every tool signature, the scheduler, and the day timeline. For three days the
  single-city anchor is still the right answer; it's a longer trip that needs this.
- **Driving routes.** Walking-only is deliberate — Venice isn't drivable, and within a single base
  city most stops are walkable — but a multi-city version would need driving legs.
- **An eval set for the assistant.** Correctness is currently enforced structurally by the tools
  and verified by hand. A labeled set of instructions → expected tool calls would catch prompt
  regressions the way the 78 unit tests catch engine regressions.
- **Multi-turn memory.** Each instruction is evaluated independently against current state; a
  longer refinement session would benefit from conversational context.
- **Ordinal date rules.** A few entries close on rules like "third Sunday of the month." I parse
  day-of-week and month windows but deliberately don't attempt ordinal-in-month parsing, and say
  so on the affected cards rather than guessing.
- «Anything else you want to claim — keep this list short and specific.»

# 3 Days in Italy — submission note

**Live:** [https://trip-planner-bronson.vercel.app](https://trip-planner-bronson.vercel.app) · **Repo:** [https://github.com/bronson-allen/trip-planner](https://github.com/bronson-allen/trip-planner)
React 19 · TypeScript · Vite · Mapbox GL · Vercel Functions · OpenAI `gpt-4.1` · Vitest unit tests

## What I built

A smart 3 day trip planner. You pick a base city, a start date, and a few preference chips, and a deterministic engine builds a 3-day itinerary. The chips become a `TripPrefs` object, `rankPlaces` scores all 103 places in `italy.json` against it, and `buildItinerary` schedules the winners into three days with a real rhythm — morning sight, lunch, afternoon, evening, dinner — clustered geographically so you're not crossing town between courses, or driving from Milan to Rome for lunch. Then you refine it, either by hand through the UI or in natural language through **Navi**, an AI powered assistant that can only act through the same deterministic functions the buttons call, as tool calls.

## Scoping it down: Why one city, three days?

The dataset's density is lopsided. Rome, Florence, Venice and Milan hold most of the 103 entries and the
rest are 1–9 places in day-trip towns. If I just took the nine highest-rated places in the country I'd
be sending someone Rome → Venice → Florence in 72 hours, which is a worse trip than any one of those
cities alone. So the scheduler anchors on a base city and clusters each day around it.

Travel time is a haversine distance and a walking speed, so an unguarded Rome→Venice leg computes as
about **90 hours on foot** and renders on a card as a straight-faced number. The engine has no concept
of intercity transit and the dataset gives me nothing to build one from. I'd rather ship a planner
that's upfront about what it won't do than one that hands you an impossible day and acts like it's
fine. Pace follows the same logic: relaxed drops the evening stop, packed adds an afternoon one, and
lunch and dinner never move, because "relaxed" should mean fewer things, not no lunch.

## Some things that tripped me up along the way

Both of these came from using the app and asking why.

**Two sources of truth.** My first design held the user's preferences and regenerated the itinerary from them. Then I walked a scenario out loud: I delete the Colosseum by hand, and the next day I ask Navi to make day 2 lighter. That regeneration puts the Colosseum back in, because the prefs have no idea I removed it, and every AI edit would unknowingly overwrite a manual one. The fix was to make the itinerary the only state, ids and slots with no resolved objects, and have the buttons and the assistant both mutate it through the same pure `TripState → TripState` functions. Walking times, dates and day themes derive on render, so nothing goes stale and there's no second copy to drift. That change is the only reason manual and AI editing coexist, and I'm glad I caught it while building instead of in a bug report.

**Browse said yes, the engine said no.** The Explore search listed all 103 places with an Add button on every row, but `addStop` rejects anything outside the base city, so you'd pick a place, pick a day, then get an error toast. My instinct was that the one-city rule was too strict. It wasn't, for the 90-hours reason above. Explore and the engine just disagreed with each other, so Explore now runs the engine's own eligibility check and tests assert the two surfaces agree. Auditing that turned up something I hadn't planned for: Burano (8 km), Padua and Como sit inside the scheduler's own 40 km radius but get rejected anyway, because the city-name check runs before the distance check. Those are real day trips. I left them blocked, since Venice→Burano computes as a two-hour walk across a lagoon, but I stopped flattening the explanation. They read "Day trip" now, and the detail pane says the round trip would eat most of one of three days.

## The data is messy on purpose, so I normalized instead of cleaning

`italy.json` never gets mutated. A one-way `normalize()` builds a typed parallel view and attributes
every gap it fills instead of hiding it. Hours carry `confidence: 'parsed' | 'partial' | 'unknown'`,
inferred durations are flagged as inferred, and hours I can't parse reach the card as "check ahead"
rather than an invented time. That drew my line on enrichment too: adding images the dataset doesn't
have is fair, using an outside source to *correct* facts the file states is not.

The tags needed real modeling. There are about 30 and some look contradictory — quiet vs lively,
hidden-gem vs tourist-heavy, budget vs splurge. They aren't contradictions, they're opposite ends of
roughly five axes, so I mapped them that way and gave the scorer signed values to read. Navi never sees
raw tags, only resolved scalars, because a bag of contradictory adjectives is what a model misreads.

Tests iterate the real file rather than fixtures, and the first run caught a bug in my own hours parser:
an overnight window (`8:00-01:00`) my regex read as closing before it opened. Win for the tests. A
startup `auditPlaces()` pass reports what's actually in there, and its geographic check caught a planted
coordinate error: Brera Antique Market says Milan but sits 156 km away, which had put a seven-hour walk
as the first stop of a Milan trip. Rather than overwrite a stated fact, I fixed it by using each city's
median center, which is robust to its own outliers, and dropping candidates past a sane radius. Where
parsing stops being reliable, so do I. Seasonal closures are gated on real closure wording ("open
April–October **only**" closes a place, "**best** April–October" doesn't), and a rule like "third Sunday
of the month" gets surfaced for the traveler instead of faked.

## How I used AI: both, with a hard line between them

**As a product feature.** My test was: if I removed this call, would the product be worse at its job, or
just less impressive to describe? That rules out most itinerary edits. Adding a named place, deleting a
stop, reordering a day are one unambiguous action each, and a button beats a sentence.

It earns the call on requests a button structurally can't express: *"swap the museum for something
outdoorsy near the coast, and make day 2 lighter."* That's search, then decide, then act, twice, across
two days. You can't pre-build that as controls. Tool-calling handles it in one path, and it answers
read-only questions the UI has no surface for, like *"why is this stop before lunch?"*

```
 UI buttons ─┐
             ├─► pure tool functions (TripState → TripState) ─► TripState
 Navi chat ──┘     searchPlaces · explainStop · nearbyPlaces · addStop
                   removeStop · swapStop · reorderStop · rebalanceDay
```

That one `TripState` object is also the sessionStorage format and the API wire format, so there's a
single shape to reason about end to end. **Delete the chat box and every edit still works, offline, with
no network call.**

The model never types a place id from memory. It gets candidates
from `searchPlaces` and passes those exact ids to `addStop`/`swapStop`, which re-validate against the
dataset before mutating. Every write tool enforces the same invariants `buildItinerary` does and returns
structured errors instead of throwing, so the model recovers rather than crashing the loop. The loop is
capped, and `removeStop` is withheld unless the instruction actually asks to remove something — the
prompt says so too, but the gate is in code. Context is bounded the same way: the last three exchanges,
capped again server-side, with the current itinerary riding along and winning if an older reply
disagrees. No session store. Plus the expected hygiene — server-side key, zod validation, an instruction
cap, per-IP rate limiting, CORS, structured per-request logging.

Two things I skipped deliberately. I never let the LLM build the itinerary from raw JSON, because it
hallucinates places, ignores hours, and this dataset's messiness makes both worse. And no embeddings.
103 structured records don't need a vector store, and in-memory filtering is correct at that size, not a
compromise. I'd reconsider past ~10k.

**As a building tool.** Throughout, for architecture discussion and TDD on the normalize/score/schedule
pipeline. My first assistant build actually failed three tests: invalid JSON, a compound request that
burned the whole tool loop doing nothing, and one that leaked raw function-call syntax into the chat.
I'd already stacked four fixes on it, and the pile was the tell — nearly all were prompt-space patches
propping up a model that wasn't doing its job. So I stopped patching and had the code diagnosed
properly: the tool layer was fine, the failure was concentrated in
orchestration. My own plan had written the escape hatch, swap models if tool selection underperforms, so
I took it, changed that one variable, held everything else constant, and deleted the patches based on
what the re-test showed instead of what I predicted. One survived on merit, the `removeStop` gate,
because it's enforced in code rather than asked for in a prompt.

## Shipping it

Deploy is where the real bugs were. Vercel's function runtime isn't Vite's compiler, so cross-folder
`.ts` imports into `src/` worked locally and broke in production. The source lives in
`server/assistant.ts` now and esbuild emits a self-contained `api/assistant.js`. Then zero-config
detects `/api` *before* `npm run build` runs, so a gitignored bundle registers too late and
`/api/assistant` 404s while the static build is perfectly green. That's why the bundle is committed. I
also caught the Mapbox `pk.` token baked into 42 image URLs in committed data — those are stored
unsigned now and signed at read time, with a test that fails if a token reappears. React + Vite over
Next was deliberate: no server-rendering story here worth a framework, so it's one client bundle and one
function endpoint. I tried Stripe Projects first for provisioning and fell back to Vercel CLI + Git.

## What I'd do with more time

These are things I actually wanted to build and cut for time.

- **Multi-city trips.** Day-level city anchoring plus an intercity transit model — a rail-duration
matrix, since the dataset has none — so `estimateTravel` returns a transit leg instead of refusing to
walk 400 km. It touches every tool signature, the scheduler and the day timeline, so it deserves being
built properly instead of squeezed in near a deadline. Driving comes with it. I dropped driving once Venice made it obvious
a canal city and sub-km hops don't want a car, and that simplification removed code *and* improved
correctness, which is why it stuck.
- **Offline and bad signal.** The person using this is standing in Italy on hotel wifi or roaming data.
I'd cache the itinerary for offline reads, precompute what the map needs, and put assets on an edge
CDN. Everything except Navi already runs client-side with no network call, so this is closer than it
sounds. I just couldn't prove it on a throttled connection in the time I had.
- **Shared trips.** Two people planning one trip is the real use case, and it's a real backend project:
persistence, identity, conflict resolution on a shared `TripState`. Cut on purpose — nothing asked for
it and the core loop was worth more than half of this.
- **An eval harness for Navi.** Labeled instructions → expected tool calls, catching prompt regressions
the way the 89 unit tests catch engine regressions. Biggest real gap.
- **An error boundary around the dashboard.** Navi replaces trip state wholesale from a server response,
so a render throw after a swap is a white screen. Known, tracked, not done.
- **Polish I cut knowingly.** Auth and saved trips. A Stripe-powered pro tier, which I wanted to build
and skipped as scope. And a loading screen with a vespa and a rotating "Rome wasn't built in a day, but
your itinerary was." That one costs an afternoon and it's a lot of the distance between a demo and a
product, so it's the first thing I'd add back.


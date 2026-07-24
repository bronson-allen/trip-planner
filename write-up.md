# 3 Days in Italy — Write-up

## What I built and why

A trip planner over the provided 103-place dataset that generates a 3-day, single-city
itinerary (Rome, Florence, Venice, or Milan) from a few chip selections, then lets the user
refine it — some refinements as direct manual edits, some through natural language.

**The core judgment call was scope, not features.** The dataset's density is concentrated —
Rome, Florence, Venice, and Milan hold the vast majority of the 103 places; everything else
is 1-9 entries for day-trip towns. A planner that just picks the 9 highest-rated places
nationwide would send someone on impossible cross-country hops in three days. So the plan
anchors on one base city and geo-clusters each day around it, rather than trying to be a
general multi-city router.

**The data is intentionally messy, and I treated that as the actual test, not an obstacle.**
Hours arrive in ~8 different formats, 33 are null, some duration/hours pairs don't agree
(a tasting-menu restaurant's stated duration exceeds its stated seating window), and a few
entries are clear traps — one restaurant sits at 2.1★ with a single `tourist-heavy` tag,
the only real outlier in the dataset. Rather than "cleaning" this data, I built a one-way
`normalize()` layer: the source JSON is never mutated, and every filled gap is attributed
(`confidence: 'unknown'`, `duration.inferred: true`) instead of silently guessed. A test
suite iterates the real 103-place file — not synthetic fixtures — and on its first run it
caught a genuine bug in my own hours parser (an overnight-closing restaurant, "8:00-01:00,"
that my regex read as closing before it opened). That's the story I'd tell about data
handling: the tests weren't decorative, they found something real.

**The engine is deterministic; the itinerary state is a single shared list of stops** that
both manual edits and AI-driven edits operate on directly — never a full regeneration from
abstract preferences. That single decision is what let me reason cleanly about how manual
and AI-assisted editing coexist (below) without one silently undoing the other.

## How I used AI

**Both, with a hard boundary between them.** I used Claude Code as a building tool throughout
— architecture discussion, TDD-style development of the normalize/score/schedule pipeline,
and a deliberate data audit pass before writing any UI. As a product feature, AI shows up in
exactly one place: a natural-language revision channel on the itinerary, and I spent real
effort making sure it earns that place rather than existing for its own sake.

The test I applied: if I removed this AI call, would the product actually be worse at its
job, or just less impressive to describe? That test says most itinerary edits don't need AI
at all. Adding a specific, named place back to the plan, deleting a specific stop, and
reordering cards are all manual, deterministic interactions — a user who wants the Colosseum
back on the trip should tap "add," not phrase a request to an assistant. Building AI into
that path would be novelty, not utility.

Where AI earns its call is the class of edits a button structurally can't express: *"we're
vegetarian"* or *"make day 2 lighter"* name an outcome, not a specific stop to touch.
Satisfying either could mean editing several stops across multiple days — tedious and
error-prone by hand, one sentence by voice. So the LLM's job is narrow and constrained: parse
the sentence into a structured constraint (schema-validated, never trusted blind), and a
deterministic function — the same scorer and scheduler that built the original plan —
decides which specific stops to insert, remove, or swap to satisfy it. Those changes apply
as the same targeted operations manual edits use, so anything the user already rearranged by
hand is left untouched, and the result is a diffable, explainable change ("removed the
Colosseum, swapped in a vegetarian-friendly trattoria") rather than a black-box regeneration.
The LLM never picks a place or checks an hour — it only ever produces a constraint; the
already-tested engine still owns every actual decision.

## What I'd do with more time

- **Multi-city trips with real inter-city travel** — currently deliberately out of scope; the
  single-city anchor was the right call for three days, but a longer trip needs it.
- **A real routing API** in place of the haversine + fixed-walking-speed estimate, for
  accurate travel times rather than straight-line approximations.
- **Ordinal/seasonal date logic** — a few entries close on rules like "third weekend of the
  month" or "closed Sundays except the last Sunday"; I parse day-of-week and month windows but
  deliberately don't attempt ordinal-in-month parsing, and say so on the affected cards rather
  than guessing.
- **An eval set for the revision prompt** — right now correctness is verified by schema
  validation and manual testing; a small labeled set of instructions → expected constraints
  would catch prompt regressions the way the unit tests catch engine regressions.
- **Multi-turn memory in the revision channel** — each instruction is currently parsed
  independently against the current plan state; a longer session with several related
  refinements ("also, no more art museums") would benefit from short conversational context.

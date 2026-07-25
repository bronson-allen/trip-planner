# What I chose to build, and the judgment calls along the way

*Extracted from the design/planning session — the decisions made while scoping the product,
handling the dataset, and shaping where AI belongs. (A companion file, `document.md`, covers a
later session debugging the assistant.) Written in first person so I can speak to it directly;
it foregrounds the calls I drove or corrected myself, since those show judgment rather than
just execution.*

---

## What I chose to build

A **3-day, single-city Italy itinerary planner** with a deterministic core and a narrowly
scoped AI assistant on top. The shape came from a few deliberate choices:

- **Anchor the trip on one base city, not the whole country.** The dataset spreads ~100 places
  across 16 cities, but the density is concentrated in four. A planner that picks the highest-
  rated places nationwide would send someone on impossible cross-country hops in three days. So
  I anchor on one city and cluster each day geographically. This was the core product judgment —
  scoping the problem down to something a 3-day trip can actually be.
- **A hybrid architecture: the deterministic engine owns correctness, the LLM only touches the
  fuzzy edges.** The engine (scoring, scheduling, availability, geo-clustering) is pure,
  testable, and never involves a model. The LLM's job is narrow: translate messy human intent
  into a structured, validated call to a function that already exists.
- **Deploy via Stripe Projects → Vercel.** I chose to set up hosting with Stripe's own new
  Projects tooling — partly a genuine fit (it provisions Vercel and syncs credentials cleanly),
  partly a deliberate choice to experiment with something the company just shipped and be able
  to speak to it.

## The judgment calls I made along the way

**Normalize the messy data, don't cleanse it.** My first instinct question was whether I was
even *allowed* to clean the intentionally-messy data. I decided the right move was a one-way,
non-destructive transform: the source JSON is never mutated, and every gap I fill is
*attributed* (an inferred duration is flagged as inferred; unparseable hours are marked
"unknown" and shown honestly, never guessed). Cleansing would have destroyed the exact evidence
of messiness the exercise is testing, and would have quietly made the file no longer the source
of truth. This also drew the line on "enrichment": adding a capability the data lacks (it has no
image field) is fair; cross-referencing an external source to *correct* facts the data states is
not.

**Treat the planted data traps as the actual test.** Rather than assume the data was clean, I
went looking and found the seams: a restaurant rated 2.1 (a trap for anything that filters
naively), a place whose stated duration exceeds its own opening window, "booking required" items
with null hours where the real schedule hid in prose, seasonal closures that override the hours
string, a neighborhood name shared by two cities, and same-coordinate/different-id pairs. Each
became a specific decision — for example, **dedup by id, never by name or coordinates**, so
"Trevi Fountain" and "Trevi Fountain by Night" both survive as legitimately distinct stops.

**Test against the real dataset, and let it find bugs.** I wrote the normalization tests to
iterate the actual ~100-place file, not synthetic fixtures — so passing proves correctness
against the real source, not against my own assumptions. On its first run it caught a genuine
bug in my hours parser: a restaurant closing at 01:00 that my regex read as closing *before* it
opened. I'd rather show that the tests earned their keep than that they were decorative.

**Make the AI earn its place — this is where I pushed back on myself the most.**
- I first planned to let free text pre-fill the same preference chips the user could already
  click. I caught that this is novelty: an LLM call to arrive at something a click already does.
  I re-scoped free text to only capture what chips *structurally can't* — exclusions, relative
  priorities, schedule constraints.
- I considered scrapping the deterministic app for a chat-native "build my whole trip by
  conversation" interface, and decided against it: it would throw away a tested engine for an
  unproven pattern and bury the hard constraint-logic inside prompts, right before a deadline.
- Working through a concrete scenario ("I delete the Colosseum by hand; a day later a friend
  wants it back — am I forced to ask the AI?") exposed a real architecture flaw in my own design:
  I had two competing sources of truth (the current itinerary vs. the preferences that
  regenerate it), and every AI edit would silently blow away manual changes. I fixed it by
  making the itinerary a single shared state that both buttons and the AI edit through the *same*
  targeted operations — never a wholesale regeneration.
- Where I landed: manual controls win for specific, named edits (delete this, add that); the
  assistant earns its call only for **compound, cross-cutting, or outcome-based** requests a
  button can't express in one click ("we're vegetarian," "make day 2 lighter"). And the
  assistant should *look* bounded — an itinerary refiner docked to the plan, not a generic "ask
  me anything" travel oracle whose suggestion chips promise flights and hotels it can't deliver.

**Keep the LLM structurally unable to do harm, not just prompted not to.** The model never
writes itinerary state and never types a place ID from memory — it can only select IDs a search
tool handed it, and every tool re-validates against the real dataset before acting. Output is
schema-validated (untrusted input, like any form submission), the key stays server-side, and the
agent loop is capped. The safety comes from the architecture, not from asking the model nicely.

**Right-size the model.** I defaulted to a small, fast, cheap model for these grounded tasks with
a one-line path to a larger one if tool-selection quality demanded it — rather than reflexively
reaching for the most powerful option.

## How I worked (process judgment)

- **I named my own failure mode and built a guardrail against it.** My recurring problem is
  scope creep — AI makes every "wouldn't it be cool if…" cheap to build, so projects bloat and
  never ship. I wrote an explicit definition-of-done, a hard deadline, and a "not doing" list,
  and encoded a scope-lock into an agent-instructions file so the tooling itself pushes back on
  new ideas. I kept it deliberately provider-agnostic rather than tied to one AI tool.
- **I interrogated recommendations instead of accepting them.** I pushed back, asked "why," and
  made the final calls myself — including overriding a suggestion (I made the trip date a
  required field with a 3-day cap, against a proposal to leave it optional). The AI was a tool
  for reasoning faster, not a substitute for the judgment.
- **I checkpointed before risk.** Before the larger refactor I snapshotted the working state to
  a private repo — and when a Mapbox token turned up embedded in a data file, I chose the
  conservative handling rather than pushing it out.

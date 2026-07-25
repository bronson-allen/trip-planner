# What I chose to build and the judgment calls I made — the planning engine session

> Raw material for the required write-up. This captures a single working session and the
> decisions made *in it*: the deterministic planning engine, the UI wiring, and three
> data/edge-case problems I hit and reasoned through. It's about *choices and judgment*, not a
> feature tour. (A separate document covers the Navi AI-assistant session.)

---

## What I chose to build

In order, this session produced:

1. **A tag taxonomy** (`tags.ts`) — one declarative map assigning each of the dataset's ~30 tags
   to a meaning, plus a few pure helpers.
2. **A scoring engine** (`score.ts`) — a deterministic function that ranks places against a
   user's preferences and returns a transparent per-signal breakdown.
3. **A scheduler** (`buildItinerary` in `itinerary.ts`) — turns ranked places into a day-by-day
   plan: which day, which slot, in what order, clustered geographically.
4. **The end-to-end UI wiring** — replaced placeholder data so the real engine drives the
   dashboard, map, list, calendar, and detail views.
5. **A pace control** — relaxed / balanced / packed changes how densely each day is packed.
6. **Two data-integrity fixes and one routing decision**, prompted by bugs I found while
   manually testing (a place 156 km from its own city; a place closed on the trip dates; and
   Venice, where driving directions are meaningless).

Everything above is deterministic and unit-tested. No LLM is in the loop for any of it — that
was a deliberate boundary (below).

---

## The judgment calls (decision → alternative rejected → why)

### On the messy tags

- **Treated 30 tags as ~5 orthogonal axes, not one flat filter.**
  *Rejected:* showing all tags as filter chips / feeding them raw to a model.
  *Why:* the tags that look contradictory — `quiet`↔`lively`, `hidden-gem`↔`tourist-heavy`,
  `budget`↔`splurge` — aren't contradictions; they're opposite ends of the same axis. Modeling
  them as signed axes makes the "contradiction" disappear and gives the scorer clean levers.

- **Collapsed near-synonyms and deferred redundant tags to structured fields.**
  `scenic`/`views`/`photogenic` became one concept; `budget`/`free`/`splurge` defer to the
  numeric `price_range` field. *Why:* fewer, cleaner signals; don't duplicate a fact the
  structured data already states better.

- **Cards show 1–2 *earned* badges, not the tag array.**
  *Why:* eight tags on a card is noise. Only the tags a traveler actually wants flagged
  (`💎 local secret`, `⚠️ very touristy`) get pixels; the rest work invisibly in scoring.

- **The model never sees raw tags.**
  *Why:* a bag of contradictory adjectives is what confuses an LLM. It gets resolved scalars and
  short labels, so there's nothing to misread.

### On the architecture / where AI belongs

- **Kept the LLM out of the correctness path entirely.** The scorer + scheduler *are* the
  planner; they run with zero AI. Delete the model and the app still produces a correct
  itinerary from chips alone.
  *Rejected:* "give the model 103 places and ask it to plan."
  *Why:* that silently books the closed museum and the 2.1★ tourist trap. Correctness lives in
  testable code that can't hallucinate; the model only bookends it (parse fuzzy free-text into
  preferences beforehand, narrate the finished plan afterward).

- **One shared `TripPrefs` contract, filled by chips today and by the LLM later.**
  *Why:* the engine never needs to know whether a preference came from a click or a sentence.
  The `planToPrefs` adapter is the single seam, keeping the future AI layer a clean add-on
  rather than a rewrite.

- **The scorer returns a *breakdown*, not just a number.**
  *Why:* explainability is cheap and valuable — the ranking can be justified ("matched food +
  wine, local favorite") instead of being a black box.

### On the scheduler

- **Anchored the whole trip on one base city.**
  *Why:* 3 days isn't enough for cross-country hops; a naive "top 9 nationwide" sends the
  traveler on impossible journeys. Clustering each day geographically (nearest-neighbor from a
  high-scored anchor) keeps days tight.

- **Dedup by `id`, never by name or coordinates.**
  *Why:* the dataset has legitimately-distinct pairs (a fountain by day and by night) that a
  fuzzy dedup would wrongly collapse and lose.

- **Skipped external routing; used haversine + a walking-speed assumption.**
  *Why:* right-sized for a few-hours take-home — adequate estimates, zero dependency/latency/
  attack-surface. Real routing is a "more time" item, not a v1 requirement.

### On wiring it up

- **Wired the real engine before adding any AI ("meat and potatoes first").**
  *Why:* a working deterministic planner is the thing worth demoing; the AI layer is enrichment
  on top, not a prerequisite.

- **Broadened preference-matching so *every* chip counts.** When I found that picking "Scenic"
  or "Quiet" scored nothing, I widened matching to the soft-preference axes and renamed the
  function honestly.
  *Why:* a chip that does nothing is a lie to the user. Honesty over dead controls.

- **Deleted dead code as I went** (dummy data, unused slice helpers) and **flagged a
  pre-existing build error instead of fixing it inline.**
  *Why:* keep the change focused and the tree clean; don't silently expand scope into unrelated
  code.

### On pace

- **Pace changes day density, keeping meals constant.** Relaxed drops the evening stop; packed
  adds an afternoon one; lunch and dinner always stay.
  *Why:* "relaxed" should mean *fewer things*, not *no lunch*. Fewer stops = more relaxed — what
  the word actually promises.

### On the bugs I found while testing (the strongest judgment signals)

- **The 156 km "drive" (coordinates contradicting the city label).** I treated this as a
  data-integrity problem, not a routing problem: compute each city's *median* center (robust to
  the outlier itself) and drop candidates beyond a sane radius.
  *Rejected:* "correcting" the coordinate from an external source.
  *Why:* fixing stated source facts erases the exact messiness the exercise is testing. Detect
  and exclude the contradiction structurally instead — and make it visible in the data audit.

- **A place scheduled while closed on the trip dates.** With a start date now available, I used
  it — but only for constraints I could parse *reliably* (day-of-week, and seasonal
  month-windows). The key distinction: **advisory prose vs. real closure.** "Open April–October
  **only**" closes a place; "**Best** April–October" does not. I gated the parser on closure
  wording so the trap (e.g. "Best April-October. Road closed to cars on Sundays only") is
  correctly ignored.
  *Rejected:* fake-parsing one-off ordinal prose like "third weekend of each month."
  *Why:* brittle, high-false-positive parsing for single cases. **Handle what's reliable;
  surface the rest for the traveler to verify rather than guess.** That boundary *is* the answer
  to "how do you reason about messy temporal data."

- **Venice, where driving directions are meaningless.** I reframed it: this isn't a Venice bug —
  driving was never the right model for a tight single-city plan (sub-km hops between a museum
  and a trattoria). Venice just made it undeniable.
  *Rejected:* (a) faking a vaporetto/water-transit mode with no data — inventing facts; (b)
  ripping routing out entirely — discarding real spatial signal to kill one bad part.
  *Chosen:* go walking-first and drop driving — a **simplification that improves correctness**,
  fixing Venice and the earlier "500 m drive in Milan" oddity in one move, with *less* code.
  Real multi-modal routing (metro, vaporetto) becomes a specific, honest "more time" line.

---

## The through-line

Three principles recur across every call above — the real answer to "the judgment calls you
made":

1. **Keep the LLM out of anything that must be correct.** Determinism where correctness matters;
   AI only for the fuzzy-human edges.
2. **Never invent or "fix" the data.** Normalize and attribute; detect contradictions and
   degrade visibly; don't paper over messiness the exercise deliberately planted.
3. **Right-size, and prefer the simplifying decision.** The best fixes this session
   (walking-first, dropping the driving mode) removed code while improving correctness — and
   what I chose *not* to build (ordinal-date parsing, external routing, faked transit) was as
   deliberate as what I did.

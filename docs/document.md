# What I chose to build and the judgment calls I made

*Extracted from a working session debugging the Navi AI assistant after its first three
tests failed. This documents decisions made **in that session** — not the project's
static design.*

---

## The situation I walked into

I had implemented the AI assistant per my integration plan and run three tests. All three
failed in ways that felt like the whole approach was wrong: invalid JSON responses, a
compound request that exhausted the tool loop without doing anything, and a broad request
that removed real stops and leaked internal function-call syntax into the chat. My instinct
that "it's not going great" was the starting point.

## Judgment call 1 — Diagnose before patching again

My test log showed I'd already responded to each failure with a stack of fixes: a
sanitizer regex, a search cap, a keyword gate on removals, "strengthened" prompt
instructions. Rather than add a fourth layer of patches, I chose to stop and get the
system diagnosed from the actual code. This surfaced the key finding: **the tool layer was
correct and the problem was concentrated entirely in the orchestration layer.** That
reframed the work from "the architecture is failing" to "one component is failing."

## Judgment call 2 — Recognize my fixes were fighting my own thesis

The diagnosis exposed that nearly every fix I'd made was *prompt-based* — exactly what my
plan's "structural safety model (**not** prompt-based)" section said to avoid. The
`to=functions.X code:{…}` sanitizer I'd written was the tell: I was suppressing a symptom
(a model emitting tool calls as raw text) instead of fixing the cause. I accepted that the
band-aids weren't fixing behavior, they were hiding a bad model's output — and that several
of them (like gating `removeStop` on a keyword regex) were themselves new correctness bugs.

## Judgment call 3 — Take the escape hatch my own plan wrote

My plan anticipated this exact failure: *"one-line swap to a stronger model if
tool-selection on compound requests underperforms."* Tool-selection was underperforming, so
I took the swap rather than continuing to compensate in prompt-space. This was choosing to
trust my earlier design judgment over the sunk cost of the patches I'd already written.

## Judgment call 4 — Minimize infrastructure churn under a deadline

Offered a choice of models, I chose **to keep the existing OpenAI setup and move to a real,
capable tool-calling model** rather than adopt a different provider (which would mean a new
dependency, a new API key, and new config). This was a deliberate risk trade: I changed the
*one variable* most likely to fix the failures (the model) while holding everything else
constant, so that when I re-test I know exactly what moved the needle.

## Judgment call 5 — Sequence the cleanup behind evidence

I chose **not** to rip out the band-aids immediately. Because they were written to prop up a
model I was replacing, I decided to re-run the three tests on the new model *first*, then
delete based on observed behavior rather than prediction — with one exception I flagged for
removal now (the removal-keyword gate) because it was a correctness bug independent of the
model. Deleting on evidence, not on hope.

## Judgment call 6 — Interrogate the diagnosis instead of accepting it

When told the new model was "good at tool-calling but not reasoning," I didn't take it at
face value. I pushed on it: *Will it misinterpret the input and call the wrong tools? Will
it give weird responses? Are there supposed to be two models — a reasoning one that talks
and a tool one that acts?* This forced a correction of imprecise framing (the old model's
failure was a tool-call **format** break, not a reasoning-depth deficit) and confirmed the
current design runs **one** model through one loop — with a clear, evidence-gated condition
for when a second "response-writer" model would be justified (only if the single model picks
tools well but phrases poorly).

## Judgment call 7 — Reconcile against the architecture I remembered

I remembered an earlier two-model design and asked whether it had been lost. It hadn't been
lost by accident — my current plan had *deliberately superseded* the original two-endpoint
(parse-intent / rationale) design with a single tool-calling loop. Surfacing that let me
confirm the simplification was an intentional decision I still stood behind, not drift.

---

## What this says about how I work

- I treat a pile of my own patches as a smell, not as progress.
- I fix causes structurally and reserve prompt/heuristic patches for what genuinely needs
  them.
- I change one variable at a time so results are attributable.
- I sequence deletion behind evidence, and I interrogate a diagnosis — including my
  helper's framing and my own past decisions — before acting on it.

---
---

# Session 2 — polish, scope, and what not to build

*A later session, with the app already feature-complete. Almost every decision here is about
**what not to build**, which is the part of the process that leaves no trace in a repo.*

## What I chose to build

1. Removed a dead input from the planner — a "notes" textarea that collected text nothing read.
2. Fixed a browse/add mismatch in Explore: the catalog offered "Add" on places the engine would
   reject, failing only *after* the click.
3. Added a "Plan a trip to Venice" path, so an out-of-city place has a next step instead of a
   dead end.
4. Split "can't add this" into three distinct explained reasons instead of one flat refusal.
5. Restructured the docs: archived five stale planning files, wrote one source of truth for
   remaining work, rewrote the README, started the write-up.

Tests went 78 → 83. No new features. That was the point.

## Judgment call 1 — Audit my own scope contract instead of trusting it

I'd written a `DEFINITION_OF_DONE.md` earlier as a deliberate scope-freeze. I opened this session
by having it checked against the actual code, and about half of it was **superseded rather than
incomplete** — the AI layer had moved from the planned two-endpoint design to tool-calling, which
made several "must ship" items meaningless.

I reconciled the list into *done / superseded-by-a-better-design / genuinely open* rather than
grinding through obsolete items or quietly deleting them. A plan that no longer matches reality is
worse than no plan; pretending it still matches is the failure mode.

## Judgment call 2 — The repo is a product; the write-up is the narrative

My first README draft had an archived-docs table, a judgment-calls essay, a data-handling deep
dive, and a testing-philosophy section. I cut it roughly in half.

The brief says a reviewer is looking at what I built and how I executed. The README's job is
*run it and understand it*; reasoning belongs in the write-up, where it's actually being asked
for. Mixing them makes both worse. Same logic drove moving the planning docs to `docs/legacy/` —
a reviewer shouldn't have to guess which of six markdown files is current.

## Judgment call 3 — Delete the dead input, don't wire it up

The planner collected a free-text "anything else?" field that nothing consumed — a leftover from
the abandoned intent-parsing design. I removed it rather than wiring it into the assistant. A text
box that silently discards what you type is worse than no text box, and the assistant already
covers that intent space. Wiring it would have been building a feature to justify a leftover.

## Judgment call 4 — The constraint wasn't the bug; the seam was

I noticed while *using* the app that Explore browses all 103 places Italy-wide while the engine
only accepts places in the trip's base city. Browse said yes, engine said no, and the user found
out last — via an error toast after a day picker.

My instinct was that the one-city rule was too restrictive. On investigation it's load-bearing:
travel time is a walking estimate, so an unguarded Rome→Venice leg computes as roughly **90 hours
on foot** and renders on a card as a straight-faced number. The engine has no concept of intercity
transit and the dataset has no data for one. Removing the gate would let the planner produce
confidently infeasible schedules — the exact failure the deterministic layer exists to prevent.

So: **keep the constraint, fix the inconsistency around it.** Explore now runs the same eligibility
gate the engine does, so it can only offer adds that will succeed. I'd have shipped a worse product
by "fixing" what looked like the problem.

## Judgment call 5 — Enforce the contract with a test, not a comment

The old code had a comment explaining that Explore deliberately skipped the city check. The comment
was accurate and the behavior was still wrong.

Tests now assert that **every addable row survives a real `addStop` call and every blocked one
fails it.** The two surfaces can't drift apart again without going red. That guarantee is a more
durable artifact than the fix.

Related: I used the engine's own `isPlaceEligibleForTrip` rather than writing a
`place.city !== trip.city` check in the UI — a parallel check that's *almost* the same as the real
one is how these bugs come back. When the same question came up again in the detail pane, I pulled
it into one shared classifier so the row and the card can't give different answers.

## Judgment call 6 — Interrogate my own output

Both real findings this session came from using the app and asking why, not from reading code.

The second one: after the fix, some rows said "Plan Venice" and others "Not in this trip", and I
asked what the actual difference was. It turned out **three places — Burano 8km, Padua 36km, Como
39km — sit inside the scheduler's own 40km reachability radius** but are blocked anyway, because
the city-name comparison runs before the distance check. Geography says reachable; a string
comparison overrules it.

## Judgment call 7 — Fix the explanation, not the engine — and say so

Those three are genuine day trips; Burano is a classic Venice vaporetto run. But unblocking them
recreates the same problem at small scale: Venice→Burano would compute as a two-hour walk across a
lagoon you cannot walk.

I left the gate closed and stopped flattening the explanation. Those rows now read **"Day trip"**
rather than the same "Not in this trip" as somewhere 116km away, and the detail card says the round
trip would cost most of one of only three days — *left off for that reason, not because it isn't
worth seeing.* The constraint is unchanged; the user can now tell which kind of "no" they're getting.

I asked for this to go in the write-up explicitly as a recognized tradeoff. An unexplained
limitation reads as an oversight; a stated one reads as a decision.

## Judgment call 8 — Check the deploy target against the actual architecture

Researching Stripe Projects, Railway was available and could deploy a repo in one command. It
wouldn't have worked: the API is written as Vercel Function web handlers with a `vercel.json` SPA
rewrite, so Railway would have needed a hand-written server wrapper. Chose Vercel.

Also confirmed Stripe Projects *provisions and syncs credentials* — it doesn't build or deploy. The
honest description is "Stripe Projects handled provisioning; Vercel CLI deployed." Worth getting
right before saying otherwise on camera.

## Where I overrode the recommendation

Rubber-stamping an assistant's suggestions isn't judgment, so these matter:

- Advice was that the day-trip copy change was optional and the write-up alone might do. **I did
  both** — the difference between an 8km day trip and a city 116km away is visible to anyone
  clicking around, and I'd rather the app show it than only claim it.
- The day-trip label came back styled as a colored pill. **I made it plain text** — it's a minor
  informational state, not a warning.
- The README first included a full history of why each archived doc existed. **Cut entirely.**
- Recommended priority was commit → deploy → everything else. **I chose these two product fixes
  first**, accepting the risk knowingly rather than by drift.

## What I chose not to build

- **Multi-city trips.** The real design is day-level city anchoring plus an intercity transit model
  (a rail-duration matrix, since the dataset has none), touching every tool signature, the
  scheduler, and the day timeline. Worth building; not worth half-building near a deadline.
- **Unblocking the three in-radius day trips.** Same root cause, smaller scale.
- **Wiring the notes field.** Deleted instead.

## How I used AI in this session

As a **reviewer**, not a code generator. It opened with "where are we at, what needs polish"
rather than "build X" — using the model to audit my work against my own stated scope, which found
the stale write-up and the plan/implementation divergence faster than re-reading everything myself.

The division held: it investigated and recommended, I decided scope. It found the single-city gate
was load-bearing; I decided to keep it and fix the seam. It surfaced the three in-radius places; I
decided how to label them. It called the copy change optional; I did it anyway.

For the "how well you execute it" half: **every change was verified running**, not assumed. The
assistant's compound tool-calling was exercised against the live API; the Explore fix was confirmed
in the browser by asserting on the rendered DOM — zero add buttons inside blocked rows, correct
counts per section, and the full "Plan Venice" round trip ending in a rebuilt Venice itinerary.

## Lines worth reusing

- "A plan that no longer matches reality is worse than no plan."
- "A text box that silently discards what you type is worse than no text box."
- "The constraint wasn't the bug — the seam around it was."
- "Rome→Venice computes as ~90 hours on foot. The city gate is what keeps the planner honest."
- "Three places sit inside my own reachability radius, blocked by a string comparison."
- "An unexplained limitation reads as an oversight; a stated one reads as a decision."

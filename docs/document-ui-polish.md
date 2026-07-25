# What I chose to build, and the judgment calls I made — UI/UX polish pass

*Extracted from a working session focused on getting the dashboard ready to submit: chat UI
for the AI assistant, search/filter for the full dataset, and whether the map and list views
were pulling their own weight. (Companion files: `document-design-session.md` covers the
original product/architecture scoping; `document.md` covers a later debugging session.) This
one documents a live, iterative design conversation — including a detour I talked myself into
and then talked myself out of, because catching that in the moment is itself a judgment call
worth showing.*

---

## What I chose to build

- **A browse/search surface over the full ~100-place dataset**, added to the list view, backed
  by the `searchPlaces` tool that already existed for the AI assistant. Before this, a reviewer
  could only ever see the ~12 places already scheduled into the trip — the dataset itself, which
  the brief calls the actual source of truth, was invisible in the UI.
- **A "what changed" surface for the assistant's tool calls**, so a mutation Navi makes to the
  itinerary is visible as a discrete, attributable action, not just a change that silently
  happened.
- **A single `activeDay` selector driving the map, the itinerary list, and route display
  together**, replacing two separately-tracked pieces of state that could disagree about which
  day was "current."
- **A master-detail push pattern for place details** in the browse panel, rather than a modal or
  an inline accordion, so reading detail and deciding to add stay in one continuous flow.

## The judgment calls I made along the way

**1. Ground the redesign in the code that already existed, not in generic UX advice.** My
starting worries were about chat UI, missing search, and view redundancy. Before proposing
anything, I checked the tool layer and found `searchPlaces` was already built and fully
functional — it just had no button UI. That reframed "add search/filter" from a new feature to
"expose a capability I'd already built for the AI but never gave to the manual UI." It also gave
me the sharpest reviewer-facing line in the whole session: the manual add flow and Navi's
"find me something outdoorsy" call the *same* function underneath.

**2. Recognize that two of my three worries shared one root cause.** The map view and list view
looked and behaved almost identically — both rendered day-grouped stop cards with the same
remove/reorder actions. I chose not to treat "no search UI" and "views feel redundant" as
separate problems. Folding discovery into the list view fixed both at once: it gave the list a
job the map couldn't do, and it closed the biggest visible gap in the app.

**3. Catch my own framing before it became load-bearing.** I initially split the views as
"read vs. update" — map/list as separate planning and reading modes. When I pushed on that split
myself (if the list view lets you search, filter, and add, isn't that also planning?), the
framing broke immediately: both views already mutate the same state through the same tools.
There is no read-only surface, by design — `TripState` is a single source of truth edited from
multiple surfaces. I re-anchored the split on *vantage point* instead of *capability*: map
answers "does this day work in space," list answers "what should I add and is it worth it." That
distinction survives scrutiny in a way "read vs. update" didn't.

**4. Rule out layout options that contradicted decisions I'd already made.** Considering where
to put a browse/search panel, I ruled out a floating Navi popup because my own integration plan
explicitly said Navi should be "docked, not a floating oracle" — and a floating chat bubble is
the visual language of a decorative bolt-on, which undercuts the exact "load-bearing AI" story I
was trying to tell. I also ruled out swapping Navi out of the aside while browsing, since
discovery ("find me something outdoorsy near the coast") is arguably the single moment
conversational search has the most leverage over manual filters — removing Navi there would hide
it at its best moment.

**5. Chose the lower-effort, honestly-scoped version under time pressure, and said so out
loud.** Offered a bigger two-column redesign (itinerary + a spatial/discovery layout) versus
simply swapping the aside's bottom panel from Navi to search on the list view, I picked the
smaller version. I didn't pretend it was strictly better — I named its real costs (a cramped
~340px column for browsing, Navi unavailable during manual search, the map view's whitespace
still unsolved) and picked it anyway because it was coherent and matched a tighter time budget.
Scope control under a deadline, not just picking the fanciest option available.

**6. Let a clarifying question expose a real state-management bug.** Asking "how does the
itinerary's accordion relate to the day-at-a-glance panel changing?" surfaced that the app was
already tracking day selection two different, weakly-related ways (`mapDay` and `routeDay`, with
the map showing whichever was non-null). Rather than bolt a third day-tracking mechanism onto a
new layout, I consolidated to one `activeDay` selector that drives the map, itinerary, and any
per-day panel together, and demoted "View route" to a pure overlay toggle on the already-active
day. A UI question turned into a state-shape fix.

**7. Caught my own reasoning going in a circle, and said so instead of pushing through it.**
After wireframing a two-column "itinerary + day-at-a-glance timeline" layout, looking at it
rendered made it obvious the second column was just re-listing the same stops rotated onto a time
axis — duplicated content dressed in different colors, not new information. When I was directly
called out for having proposed single-column → two-column → single-column-with-time in a loop, I
didn't defend the detour — I named it as a misfire, kept the two things from it that were
actually true (times/gaps/warnings are real value; a second panel that just re-enumerates the
same list is not), and handed back flat, non-nested options instead of continuing to add
layers. Recognizing a design conversation isn't converging, and correcting course explicitly
rather than rationalizing the previous step, is itself the judgment call — not any individual
layout choice.

**8. Chose a UI pattern by elimination against the actual constraint (panel width), not by
default.** For expanding a place card into full detail inside a ~340px browse panel, I ruled out
an inline accordion (multiple open rows fighting for cramped vertical space, detail still
squeezed under search/filter chrome) and a modal (dims the whole dashboard for what should be a
light, reversible browsing action) before landing on master-detail push — list slides to a
full-panel detail view with a back arrow. The elimination, not just the final pick, is the
reasoning worth keeping: it came from the panel's real width constraint, not a stylistic
preference.

**9. Caught a dead-end flow by checking the UI against the tool layer's actual invariants,
not just how it looked.** Reviewing my own rendered browse panel, I noticed it was scoped to all
103 places nationwide ("103 in Italy") with top picks in Venice and Lake Como — but the trip is
anchored to Rome, and `addStop` enforces a same-city/radius invariant. As built, a user could
browse to an out-of-city place, tap Add, and hit a rejection with no warning. I chose to scope
the browse panel to the base city by default, so everything visible is actually addable, rather
than show everything and gate it after the fact with disabled buttons and warnings.

## How I worked (process judgment)

- **I used the AI as a sounding board I was willing to override, not an oracle.** Several of the
  best moves in this session were me pushing back on a proposal it made (the read/update split,
  the two-column timeline) rather than accepting the first coherent-sounding answer.
- **I let a rendered wireframe be the test, not the description of the idea.** The two-column
  duplication wasn't obvious from a text description — it only became obvious once I looked at
  it laid out and asked "wait, is this the same information twice?" I treated seeing the actual
  visual as a real checkpoint, not a formality.
- **I was willing to say a design detour didn't work, in the moment, rather than justify it
  after the fact.** Calling out "we just went in a circle" and getting a direct "yes, that was a
  misfire, here's what's actually durable from it" is the outcome I wanted from working this way
  — course-correction as a visible part of the process, not something smoothed over in the final
  write-up.

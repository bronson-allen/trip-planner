# 3 Days in Italy — submission note

**Live:** [https://trip-planner-bronson.vercel.app](https://trip-planner-bronson.vercel.app) · **Repo:** [https://github.com/bronson-allen/trip-planner](https://github.com/bronson-allen/trip-planner)
React 19 · TypeScript · Vite · Mapbox GL · Vercel Functions · OpenAI `gpt-4.1` · ~96 unit tests

## What I built and why

I wanted someone with three days in Italy and 103 places in front of them to get a plan they'd actually follow in about a minute, and to change it afterward without starting over. I asked friends and family what they'd want out of a short trip first, and the answers kept coming back to maps, pace, budget, and not wasting a day getting somewhere, so those became the controls.

You pick a base city, a start date, and a few preference chips. `rankPlaces` scores all 103 places and `buildItinerary` schedules the winners into three geographically clustered days. You refine it by hand or through **Navi**, an assistant that acts through the same deterministic functions the buttons use, so deleting the chat box leaves every edit working, offline. The start date is required because seasonal closures and day-of-week hours change what's open. Weights and slot templates are in [the README](../README.md#how-it-works).

**One base city.** Rome, Florence, Venice, and Milan hold most of the 103 entries and everything else is 1-9 places in day-trip towns, so ranking the whole country would send someone from Rome to Venice to Florence in 72 hours. Travel time is a walking-speed estimate, so an unguarded Rome to Venice leg comes out to about 90 hours on foot. The dataset gives me nothing to build a transit model from, so the app doesn't offer that trip at all.

**The data is messy on purpose, so I normalized it and left the source alone.** `italy.json` never gets touched. A one-way `normalize()` pass fills gaps and labels every one it fills, and anything unparseable reaches the card as "check ahead." A startup audit caught a planted coordinate error: Brera Antique Market says Milan but sits 156 km away, so the scheduler uses each city's median center rather than trusting the file.

**96 tests, run against the real file.** Every test iterates `italy.json` rather than fixtures, so a pass proves the layer against the source of truth and not against my assumptions. That caught a bug in my own hours parser on the first run, an overnight window that read as already closed. `scorePlace` returns a per-signal breakdown instead of one number, so tests assert why a place ranked where it did, and that same breakdown is what Navi reads back to explain a stop.

**Two bugs I found while using it.** My first design regenerated the itinerary from your preferences every time, so deleting the Colosseum by hand and then asking Navi to lighten day 2 would have quietly put it back, because the preferences never knew it was gone. The fix was making the itinerary itself the only state, with both the buttons and Navi writing to it through the same functions. Separately, Explore offered an Add button on all 103 places even though the engine rejects anything outside your base city, so Explore now runs the same eligibility check the engine does.

## How I used AI

As a product feature, my rule was that if removing the AI call wouldn't make the product worse at its job, only less impressive to describe, I didn't add it. Adding, deleting, and reordering a stop are all buttons. Navi only earns its place on compound edits and read-only questions, the things a button can't express. It never types a place id from memory, it only gets candidates from `searchPlaces`, and every write tool re-checks them against the dataset before touching anything. Tools return structured errors so the model can recover rather than crash the loop, and `removeStop` is gated in code, not in the prompt. I skipped embeddings, since 103 structured records don't need a vector store. I'd reconsider past 10k.

As a building tool, I used Cursor and Claude Code throughout for architecture discussion, scaffolding, and TDD on the normalize, score, schedule pipeline. I wrote a plan before the AI layer existed and it set the rule the code had to follow: *"The LLM never writes itinerary state and never invents a place."*

My first build of Navi failed three tests: invalid JSON, a compound request that did nothing, and one that leaked raw function-call syntax into the chat. I'd already stacked four prompt patches on top of it, one per failure. That's when I stopped and had it diagnosed instead of patching again. Turned out the tool layer was fine and the problem was the model, so I swapped models, held everything else constant, and deleted the old patches once the re-test showed they weren't doing anything.

## What I'd do with more time

- **Multi-city trips and real routing.** The same project. Travel time is straight-line distance at an assumed walking pace, which is what makes the 90-hour number possible, and a routing API plus day-level city anchoring is most of what multi-city needs.
- **An eval harness for Navi.** Labeled instructions mapped to the tool calls they should trigger, the way the unit suite catches engine regressions. Biggest gap.
- **Input and output guards on Navi.** Topic scope is a system-prompt line right now, and the dataset is a second injection route since `searchPlaces` puts place names and tags into the model's context. Both need checking in code.
- **Shared trips.** The actual use case for something like this, and a real backend project on its own: persistence, identity, conflict resolution.
- **Offline support.** Everything except Navi already runs client-side, so caching for offline reads is close. I didn't have time to prove it on a throttled connection.
- **An error boundary on the dashboard.** A render throw right after Navi swaps trip state is currently a white screen.

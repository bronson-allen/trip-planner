# 3 Days in Italy — submission note

**Live:** [https://trip-planner-bronson.vercel.app](https://trip-planner-bronson.vercel.app) · **Repo:** [https://github.com/bronson-allen/trip-planner](https://github.com/bronson-allen/trip-planner)
React 19 · TypeScript · Vite · Mapbox GL · Vercel Functions · OpenAI `gpt-4.1` · ~96 unit tests

## What I built and why

Someone with three days in Italy and 103 places in front of them should get a plan they'd actually follow, in about a minute, and then be able to change it without starting over. Before I built anything I asked friends and family what they'd actually want out of a short trip. The answers kept coming back to maps, pace, budget, and not wasting a whole day getting somewhere, so those became the main controls.

You pick a base city, a start date, and a few preference chips. `rankPlaces` scores all 103 places against them, and `buildItinerary` schedules the winners into three days with a real rhythm: morning sight, lunch, afternoon, evening, dinner, clustered geographically. Then you refine it by hand or through **Navi**, an assistant that acts through the same deterministic functions the buttons use. Delete the chat box entirely and every edit still works, offline, with no network call. The start date is required on purpose, too. Seasonal closures and day-of-week hours actually matter for correctness.

**Try it on the live app:** *"Why is my first stop before lunch?"* (read-only) · *"Swap the museum for a marketplace and make day 2 lighter"* (compound edit).

**One base city.** The dataset isn't spread evenly. Rome, Florence, Venice, and Milan hold most of the 103 entries, and everything else is 1-9 places in day-trip towns. Ranking the whole country would send someone from Rome to Venice to Florence in 72 hours, so the scheduler anchors on one base city instead. Travel time is a walking-speed estimate, so an unguarded Rome to Venice leg comes out to about 90 hours on foot. The engine has no intercity transit model, and the dataset gives me nothing to build one from, so I just don't let that trip happen instead of handing someone an impossible day.

**The dataset was messy, so I normalized instead of cleaning it.** `italy.json` never gets touched. A one-way `normalize()` pass fills gaps and labels every one instead of guessing. Hours carry a confidence flag, and anything unparseable reaches the card as "check ahead." Tests run against the real file, not fixtures, and the first run caught a bug in my own hours parser: an overnight window read as already closed. A startup audit caught a planted coordinate error too. Brera Antique Market says Milan but sits 156 km away, so now the scheduler uses each city's median center instead of trusting the file blindly.

**Two bugs I found while using it.** My first design regenerated the itinerary from your preferences every time. So deleting the Colosseum by hand, then asking Navi to lighten day 2 a day later, would've quietly put it right back, because the preferences never knew it was gone. The fix was making the itinerary itself the only state, with both the buttons and Navi writing to it through the same functions. Separately, Explore used to offer an Add button on all 103 places, even though the engine rejects anything outside your base city. Explore now runs the same eligibility check the engine does, so the two can't disagree anymore.

## How I used AI

As a product feature, my rule if removing the call wouldn't make the product worse at its job, only less impressive to describe, I didn't add it. Adding, deleting, and reordering a stop are all buttons. Navi only earns its place on requests a button can't express, compound edits and read-only questions. It never types a place id from memory. It only gets candidates from `searchPlaces`, and every write tool re-checks them against the dataset before touching anything. Tools return structured errors so the model can recover instead of crashing the loop, and `removeStop` is gated in code, not just asked for nicely in a prompt. I skipped letting the LLM touch the raw JSON directly, and skipped embeddings too. 103 records want in-memory filtering, not a vector store.

As a building tool, I used Cursor and Claude Code throughout for architecture discussion, scaffolding, and TDD on the normalize, score, schedule pipeline, and document writing. I also wrote a plan before the AI layer existed, and it set the rule the code had to follow: *"The LLM never writes itinerary state and never invents a place."* That same plan suggested swapping to a stronger model if tool selection underperforms.

My first build of Navi failed three tests: invalid JSON, a compound request that did nothing, and one that leaked raw function-call syntax into the chat. I'd already stacked four prompt patches on top of it, one for each failure. That's when I stopped and had it diagnosed properly instead of patching again. Turned out the tool layer was fine and the problem was the model itself, so I swapped models, held everything else constant, and deleted the old patches once the re-test showed they weren't doing anything anymore.

## What I'd do with more time

- **Multi-city trips.** Real day-level city anchoring, plus an actual transit model between cities, since the dataset has none right now.
- **Real routing instead of a walking-speed estimate.** The straight-line-and-assumed-pace math is what makes the 90-hour Rome-to-Venice number possible in the first place. A real routing API would fix that and is most of what multi-city trips need anyway.
- **Shared trips.** Two people planning one trip together is the actual use case for something like this, and it's a real backend project on its own: persistence, identity, and conflict resolution on a shared trip. Worth building properly, not worth rushing in.
- **Offline and bad-signal support.** Someone using this is probably standing in Italy on hotel wifi or roaming data. Everything except Navi already runs client-side, so caching the itinerary for offline reads is closer than it sounds, I just didn't have time to prove it on a throttled connection.
- **An eval harness for Navi.** Labeled instructions mapped to the tool calls they should trigger, the same way the unit suite catches engine regressions. This is the biggest real gap.
- **An error boundary on the dashboard.** Navi replaces trip state wholesale, so a render throw right after a swap is currently just a white screen.


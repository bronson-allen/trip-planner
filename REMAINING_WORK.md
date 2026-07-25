# Remaining work — single source of truth

This file supersedes every planning document in [`docs/legacy/`](docs/legacy/). If something is
not on this list, it is not planned work. Check items off as they land.

**Status as of 2026-07-24:** the application is feature-complete and verified working locally.
What's left is almost entirely *shipping* — committing, deploying, and writing the submission
note — not building.

---

## Verified green (2026-07-24)

Re-run these before submitting; all four passed on the current working tree.

| Check | Result |
|---|---|
| `npm test` | 88 tests, 12 files, all passing |
| `npx tsc -b` | clean |
| `npm run lint` | clean (1 non-blocking fast-refresh warning in `dashboard/shared/parts.tsx`) |
| `npm run build` | succeeds |

Live assistant smoke tests against the local dev server:

- *"Why is my first stop before lunch?"* → 2.8s, called `explainStop` only, grounded answer, no
  mutation.
- *"Swap the Borghese Gallery for something outdoorsy, and make day 2 lighter"* → 3.6s, called
  `searchPlaces` → `swapStop` → `rebalanceDay`, produced a correct itinerary and an honest summary.

The compound case is the one the brief actually grades. It works.

---

## Blockers — submission fails without these

### 1. Commit and push the AI layer
**Resolved 2026-07-24.** Everything that makes this an *AI engineer* submission — `api/`,
`src/lib/trip/tools.ts`, `src/lib/trip/tripState.ts`, `explore.ts`, `dayGlance.ts` and their tests —
was uncommitted working-tree state on an unpushed local branch, invisible to a reviewer. It is now
commit `83faf3b` on `origin/ai-assistant-integration`. Only the merge to `main` is outstanding, and
`main` is the branch reviewers land on.

- [x] Commit the AI layer on `ai-assistant-integration` — `83faf3b`, 77 files
- [x] Push the branch — tracking `origin/ai-assistant-integration`
- [ ] Merge to `main` (reviewers land on the default branch) — open as
      [PR #1](https://github.com/bronson-allen/trip-planner/pull/1)
- [x] Confirm `.env` is not in the commit — verified; only the `.env.example` placeholder is
      tracked, and no `sk-` secret appears anywhere in the tree

### 2. Deploy, and deploy early
No `.vercel/`, no `vercel` dependency, no live URL. The assessment requires one.

**The production path has never executed.** `npm run dev` serves `/api/assistant` through a Vite
middleware plugin ([`vite.config.ts:19`](vite.config.ts:19)), *not* through Vercel's function
runtime — so the passing local smoke tests do not prove the deployed function works. The specific
risk is [`api/assistant.ts:4`](api/assistant.ts:4): it reaches across the `api/` boundary into
`../src/data/places.ts` and `../src/lib/trip/tools.ts` using explicit `.ts` extensions, with a
transitive `import italy from './italy.json'`. Fine under Vite/esbuild; the most likely thing to
break on a first Vercel build.

- [ ] Deploy via Stripe Projects → Vercel
- [ ] Verify `/api/assistant` responds on the deployed URL, not just locally
- [ ] Set `OPENAI_API_KEY` and `MAPBOX_API_KEY` in Vercel env
- [ ] Set `APP_ORIGIN` to the real deployed origin (currently unset; prod would fall back to
      `VERCEL_URL` / request origin)

Budget real debugging time here. Do not leave it until the last hour.

### 3. Write the submission note
[`WRITE_UP.md`](WRITE_UP.md) is a scaffolded draft with the structure and the honest architecture
in place; it needs finishing prose. The v1 draft in `docs/legacy/write-up-v1.md` describes an
architecture that was never built (LLM parses free text into a structured constraint; Anthropic as
the provider) — do not ship it, but do lift its data-normalization section, which is still good.

- [ ] Finish `WRITE_UP.md` — what/why, more time, how AI was used
- [ ] Confirm it matches the code: OpenAI `gpt-4.1`, tool-calling, one `/api/assistant` endpoint

---

## Reconciled scope from `DEFINITION_OF_DONE.md`

The old scope contract predates the tool-calling redesign. Where it stands now:

**Done:** `/api` route layer · API key server-side only · zod request validation *plus*
`validateStateReferences` re-checking every place id against the dataset · per-IP rate limit ·
CORS · structured logging (request id, model, latency, tokens, tool calls, outcome) · drag-reorder
is now genuinely engine-backed via `reorderStop`, so the "cosmetic reorder" honesty issue resolved
itself.

**Superseded, not missed** — say so in the write-up so it reads as a decision:
- `/api/parse-intent` and `/api/rationale` → replaced by the single tool-calling endpoint.
- The "adjusted for" read-only strip → had no meaning once free-text parsing became tool calls.
- "Start date becomes optional again" → deliberately reversed. `TripState.startDate` is now
  load-bearing for seasonal and day-of-week availability; making it optional would weaken
  correctness.

**Still genuinely open:**
- [x] ~~**Remove the notes field from the planner.**~~ Done 2026-07-24. The textarea, its state,
      the `TripPlan.notes` field and its default, and the orphaned CSS (`.planner-notes`,
      `.planner-notes__hint`, `.planner-field__optional`) are all deleted. Verified in the
      browser: the planner dialog now renders with zero textareas. Tests, typecheck, lint and
      build all green after the change.
- [x] ~~**Fix the Explore browse/add mismatch.**~~ Done 2026-07-24. Explore ranked all 103 places
      Italy-wide and offered a live "Add" on every row, but `addStop` rejects anything outside the
      base city — so a Venice row walked you through a day picker and *then* failed with a toast.
      `exploreLists` now partitions using the same `isPlaceEligibleForTrip` gate `addStop`
      enforces, into an addable list and a browse-only "Elsewhere in Italy" section. Out-of-city
      rows carry a **"Plan {city}"** CTA (`/?city=…`, allowlisted against the four plannable
      cities) that opens the planner pre-anchored there; day-trip towns show "Not in this trip".
      Four new tests in `explore.test.ts` assert every addable row survives `addStop` and every
      blocked one doesn't — so the two surfaces can't drift apart again.
- [x] ~~**Distinguish day trips from distant cities.**~~ Done 2026-07-24. Burano (8km), Padua
      (36km) and Como (39km) fall inside `MAX_CITY_RADIUS_KM` of a base city but were labeled
      identically to Parma at 116km. A shared `blockedPlace()` classifier now returns
      `day-trip | other-city | unavailable`, used by both the Explore row and the detail pane so
      they can't disagree. Day-trip rows read "Day trip" with the distance in the tooltip; the
      detail pane explains the round trip costs most of one of three days. The gate is unchanged —
      only the explanation is. Covered by a Venice-based test.
- [x] ~~**Reorganize the repo for review.**~~ Added at the user's request and done 2026-07-24.
      `src/components` grew flat — nine files directly under `dashboard/`, three more with no
      parent folder — and `src/lib` was thirteen modules in one directory with tests interleaved.
      Components are now grouped by surface (`home/`, and under `dashboard/`: `shell/`, `shared/`,
      `itinerary/`, `calendar/`, `map/`, `explore/`, `assistant/`); `lib` is grouped by layer
      (`places/` dataset semantics, `trip/` planning engine, `geo/`, plus `dates.ts`); all unit
      tests moved to a top-level `tests/` mirroring `lib`. Pure moves and import rewrites — no
      behavior change. Deliberately **no `@/` path alias**: `api/assistant.ts` is built by Vercel's
      function runtime rather than Vite and imports `src/lib/trip/tools.ts` directly, so aliases
      there are an unnecessary deploy risk. `tsc -b`, 83 tests, lint and build all green after.
- [x] ~~**Get the Mapbox token out of committed data.**~~ Added at the user's request and done
      2026-07-24. `placeImages.json` had the `pk.` token baked into all 42 Mapbox static-image
      URLs, so rotating it meant rewriting the dataset. The URLs are now stored unsigned and
      `placeImageUrl(id, token)` signs them at read time from `MAPBOX_API_KEY`, with
      `src/config/mapbox.ts` as the single client-side reader. It stays a *parameter* rather than
      an `import.meta.env` lookup inside `src/data` or `src/lib`, because `api/assistant.ts`
      imports that same tree and is built by the Vercel runtime, where `import.meta.env` does not
      exist. Five tests in `tests/places/placeImages.test.ts` guard it, one of which fails if a
      token ever reappears in the JSON.
- [ ] **Error boundary around the dashboard.** Zero matches for `componentDidCatch` in `src/`.
      Navi swaps `tripState` wholesale from a server response; a render throw after a swap is an
      unrecoverable white screen.

---

## Polish, ranked by demo value

- [ ] **Surface `toolCalls` in the UI.** The API already returns them;
      [`NaviAssistant.tsx:70`](src/components/dashboard/assistant/NaviAssistant.tsx:70) discards them. A
      one-line *"Searched places → swapped stop → rebalanced day 2"* under the message is the
      single clearest proof this is a tool layer and not a chatbot wrapper.
- [ ] **Give Navi conversation history.** Each response currently replaces the last, so a reviewer
      asking a second question loses the first. An array of messages is a small change with
      outsized perceived quality.
- [ ] **Fix slot collision after moves.** Reproduced live: `rebalanceDay` moved a market to day 3,
      `addStop` assigned it `inferredSlot()` → `morning`, so day 3 renders two consecutive cards
      both labelled "Morning" ([`tools.ts:286`](src/lib/trip/tools.ts:286)).
- [ ] **Tighten the `searchPlaces` schema.** The model sent `"type": ""` alongside `types` during
      testing. Either `z.string().min(1)` at
      [`api/assistant.ts:359`](api/assistant.ts:359) or drop `type`, since `types` subsumes it.
- [ ] **Make Navi reachable from both views.** Navi renders only in map view and Explore only in
      list view ([`DashboardPage.tsx:202`](src/pages/DashboardPage.tsx:202)); a reviewer who lands
      in list view cannot find the assistant at all.
- [ ] **Dead "Profile" nav item** in [`Sidebar.tsx:10`](src/components/dashboard/shell/Sidebar.tsx:10) —
      it renders but `DashboardPage` only handles `map` and `list`, so clicking it does nothing.
- [ ] **Stale doc comments in the engine**, all describing the abandoned intent-parse design:
      [`score.ts:5`](src/lib/places/score.ts:5) ("The LLM intent-parse call fills the same shape from
      free text") and [`planPrefs.ts:7`](src/lib/trip/planPrefs.ts:7) ("Later, the LLM intent-parse call
      will produce the same `TripPrefs` shape"). Cheap to fix, and a reviewer reading the engine
      will see them.
- [ ] **Document the `removeStop` regex gate.** [`api/assistant.ts:280`](api/assistant.ts:280)
      withholds the destructive tool unless the instruction literally says remove/delete/drop.
      Deliberate and smart — worth one sentence in the write-up so it reads as designed.

---

## Explicitly not doing

Goes in the write-up's "what I'd do with more time" section, not the code:

- Multi-city trips with inter-city travel
- Real driving routes (walking-only is a deliberate call — see `thoughts.md` on Venice)
- Multi-turn memory / server-side conversation state for Navi
- An eval harness for the assistant prompt
- Auth, saved or shareable itineraries, multi-user editing
- Code-splitting the 2.19 MB bundle (611 KB gzipped, mostly `mapbox-gl`)
- Component tests with a mocked API — 78 unit tests already carry the testing story
- Anything else in `docs/legacy/`

---

## Suggested order

1. Commit and push — 30 min. Removes the worst failure mode outright.
2. Deploy and fix whatever the Vercel build breaks on — budget 90 min.
3. Finish `WRITE_UP.md` — 45 min.
4. Only then, and only if green: the notes-field removal, the error boundary, and the top two
   polish items.

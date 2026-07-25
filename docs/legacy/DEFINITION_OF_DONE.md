# Definition of Done — locked scope for submission

**Deadline: tomorrow, ~9:00 PM local time (~25 hours from lock-in).**

This is a frozen contract, not a wishlist. Nothing outside the "Must ship" list below gets
built before submission, regardless of how quick or "obviously worth it" it seems in the
moment. If it's not checked off here, it doesn't exist for this deadline.

Derived from `project_review.md`'s P0 list and the take-home's own submission requirements
(`AI_Engineer_-_Take_Home_Assessment.md`), compressed to fit the real ~25-hour window — the
review's original plan assumed 2-3 days. Anything the review called P1/P2 that isn't listed
below is explicitly cut for this deadline, not silently forgotten.

---

## Must ship (check off as completed)

### Submission requirements (non-negotiable — the assessment itself requires these)
- [ ] Live deployed URL (Stripe Projects → Vercel)
- [ ] Code in a reviewable repo (GitHub or zip)
- [ ] Written note (1-2 pages) or 5-min video: what/why, what I'd do with more time, how AI
      was used

### The LLM layer (currently the single biggest gap — the brief explicitly grades this)
- [ ] Serverless `/api` route layer (Vercel-compatible)
- [ ] `/api/parse-intent` — Anthropic call, structured/schema-validated output
      (`exclude[]`, `mustInclude[]`, `dayConstraints[]`, `notes`)
- [ ] `/api/rationale` — per-day narrative from the places the engine already chose;
      validate every place name it emits against the real dataset before rendering
- [ ] Notes field wired to `/api/parse-intent` on submit (currently collected and discarded)
- [ ] "Adjusted for" read-only strip on the dashboard showing the parsed result, visually
      separate from the preference chips

### Security & observability (so the write-up's claims are true, not aspirational)
- [ ] API key server-side only (env var), never shipped to the client
- [ ] Server-side schema validation on the LLM request payload
- [ ] Basic per-IP rate limit on the `/api` routes
- [ ] CORS restricted to the app's own origin
- [ ] Structured request logging (request id, model, latency, token usage, outcome)

### Honesty fixes (small, but a reviewer poking at the app will notice these)
- [ ] Error boundary around the dashboard — a failed LLM call must not break the itinerary
- [ ] Start date becomes optional again (currently required; plan and engine both already
      support unset dates — this is a revert, not new work)
- [ ] Drag-reorder no longer implies engine-backed re-optimization it doesn't do — either
      relabel it honestly (e.g. "manual reorder") or remove the drag handle. **Do not** spend
      time wiring real regenerate/swap logic to it — that's cut below.

---

## Explicitly cut for this deadline (goes in the write-up's "more time" section, not built)

- Regenerate day / remove-and-backfill / real swap logic — drag-reorder stays cosmetic-only
- One component test with a mocked API — the 65 existing unit tests already demonstrate
  testing discipline; a component test is diminishing returns under this time pressure
- Anything from `project_review.md`'s P2 list (dev-only audit panel, etc.)
- Anything from `project_review.md`'s "What to skip" table (Stripe subscriptions, multi-user
  sharing, multi-city trips, real routing beyond Mapbox walking, react-leaflet migration,
  loading animations, further CSS polish)
- Anything from `thoughts.md` not already listed above

---

## Rough time-box (adjust as you go, but don't add scope back in)

| Window | Focus |
|---|---|
| Hours 0–14 | LLM layer: API routes, parse-intent, rationale, security, observability |
| Hours 14–18 | Honesty fixes: wire notes, adjusted-for strip, error boundary, optional date, reorder label |
| Hours 18–22 | Deploy via Stripe Projects → Vercel |
| Hours 22–25 | Write-up / video, buffer for whatever ran long |

If something is behind schedule at a checkpoint, the answer is cutting further from "Explicitly
cut" — never pulling from that list back into "Must ship," and never adding something new.

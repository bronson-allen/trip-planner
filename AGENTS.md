# Agent instructions

This project is a take-home submission under a deadline.
**[`docs/REMAINING_WORK.md`](docs/REMAINING_WORK.md) is the single source of truth** for what's left
to do — read it before doing any work here. That file is gitignored (private working notes); it
still exists locally and is what agents should follow.

Public docs in the repo are only:

- [`docs/assessment.md`](docs/assessment.md) — the assignment brief
- [`docs/WRITE_UP.md`](docs/WRITE_UP.md) — the submission note

Everything else under `docs/` (session logs, legacy plans, scratch write-ups) is local-only and
must not be committed. In particular, do not resurrect or cite archived designs from
`docs/legacy/` — those describe abandoned architectures (two-endpoint `parse-intent` / `rationale`,
Anthropic as the model provider).

`docs/thoughts.md` / `thoughts.md` is the user's personal scratchpad (gitignored). Raw material for
the write-up, not a spec.

## Rules

1. **Check any proposed work against `docs/REMAINING_WORK.md` first.** If it isn't listed there, it
   isn't planned.
2. **Don't expand scope** to make code "more complete" or "more robust." Polish beyond the list is
   out of scope by design, not by oversight.
3. **If a new idea comes up mid-session** — from the user, from your own reasoning, or from
   something you notice while working — say what it is and ask whether it belongs on the list.
   Don't start building it unprompted.
4. **When something on the list lands, check it off in `docs/REMAINING_WORK.md`** as part of the
   same change, so the file stays accurate.
5. **When unsure whether something is in scope, ask.** The failure mode this project guards
   against is scope creep, not under-building; the smaller answer is the safer one.
6. **Don't move items out of the "Explicitly not doing" section** without the user explicitly
   asking for that specific change.

## Before submitting

`npm test`, `npx tsc -b`, `npm run lint`, and `npm run build` should all be green. The deployed
`/api/assistant` must be verified on the live URL — the local dev server serves it through a Vite
middleware, not the Vercel runtime, so passing locally does not prove production works.

# Agent instructions

This project is a take-home submission under a deadline. **[`REMAINING_WORK.md`](REMAINING_WORK.md)
is the single source of truth** for what's left to do — read it before doing any work here.

Everything in [`docs/legacy/`](docs/legacy/) (`plan_proposal.md`, `plan_ai_integration.md`,
`DEFINITION_OF_DONE.md`, `project_review.md`, `write-up-v1.md`) is **archived and superseded**.
Those documents describe designs that were changed or abandoned — in particular, the two-endpoint
`parse-intent` / `rationale` AI architecture and the Anthropic model choice were both replaced.
Do not implement anything from them, and do not cite them as current.

`thoughts.md` is the user's personal scratchpad (gitignored). It's raw material for the write-up,
not a spec.

## Rules

1. **Check any proposed work against `REMAINING_WORK.md` first.** If it isn't listed there, it
   isn't planned.
2. **Don't expand scope** to make code "more complete" or "more robust." Polish beyond the list is
   out of scope by design, not by oversight.
3. **If a new idea comes up mid-session** — from the user, from your own reasoning, or from
   something you notice while working — say what it is and ask whether it belongs on the list.
   Don't start building it unprompted.
4. **When something on the list lands, check it off in `REMAINING_WORK.md`** as part of the same
   change, so the file stays accurate.
5. **When unsure whether something is in scope, ask.** The failure mode this project guards
   against is scope creep, not under-building; the smaller answer is the safer one.
6. **Don't move items out of the "Explicitly not doing" section** without the user explicitly
   asking for that specific change.

## Before submitting

`npm test`, `npx tsc -b`, `npm run lint`, and `npm run build` should all be green. The deployed
`/api/assistant` must be verified on the live URL — the local dev server serves it through a Vite
middleware, not the Vercel runtime, so passing locally does not prove production works.

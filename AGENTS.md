# Agent instructions - before scope lock
Ignore this scope lock for now. I have a few more polish items before I implement this scope lock. Behave as normal except that I shouldn't add too much extra features, but msot changes are ok for now. 

# Agent instructions — scope lock

This project is under a hard deadline with a frozen scope contract in
`DEFINITION_OF_DONE.md`. Read that file before doing any work here. It is the single source
of truth for what "done" means — not this file, not `plan_proposal.md`, not
`project_review.md`, not `thoughts.md`. Those are historical/reference documents; only
`DEFINITION_OF_DONE.md` is binding.

## Rules for any agent working in this repo

1. **Before implementing anything, check it against `DEFINITION_OF_DONE.md`.** If it's not
   on the "Must ship" list, do not build it.
2. **If a new idea comes up mid-session** — from the user, from your own reasoning, or from
   something you notice while working — do not start building it. Say what it is and ask
   whether it belongs in scope (and what gets cut to make room) or should be deferred to the
   "more time" section of the write-up.
3. **Do not expand scope to make code "more complete," "more robust," or "more polished"**
   unless it's fixing something on the "Must ship" list that is actually broken. Polish
   beyond that list is out of scope by design, not by oversight.
4. **When a "Must ship" item is finished, check it off in `DEFINITION_OF_DONE.md` and stop.**
   Do not proactively propose further improvements unless asked.
5. **If you're unsure whether something is in scope, ask — don't guess toward "more."** The
   failure mode this project is guarding against is scope creep, not under-building; when in
   doubt, the smaller answer is the safer one.
6. **Do not edit the "Explicitly cut" section of `DEFINITION_OF_DONE.md`** to move something
   back into scope without the user explicitly asking for that specific change.

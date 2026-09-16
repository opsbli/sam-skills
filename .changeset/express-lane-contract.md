---
"sam-skills": patch
---

Give the express lane a contract, a validator, and teeth.

The README described a third route — inline completion for work below the
complexity floor, closed with a three-line mini receipt — but nothing else in
the repo knew it existed. Searching every `SKILL.md` for it returned exactly
one clause, in `execute-spec-in-fork`; `contracts/receipt-v2.json` had no mini
receipt in it; `receipt-gate.mjs` did not recognise one; and `ask-matt`'s main
flow offered no branch that led there. It was the only path to completed work
in this pipeline that no gate touched, which makes three lines of prose an
audit hole rather than a convenience.

- `contracts/mini-receipt-v1.json` is now the express lane's own contract —
  deliberately a separate file from `receipt-v2.json`, because merging them
  would either force every typo fix through eighteen fields or hand the fork
  route a three-line escape hatch. `Schema: mini-receipt/v1` pins the format so
  a mini receipt cannot be assembled after the fact.
- `scripts/mini-receipt-gate.mjs` validates four gates, all mechanical: one
  receipt with all three content lines; `what changed` carrying substance;
  `validation run` naming something actually run (with `none` rejected outright
  — work with no cheap validation failed the lane's own entry criteria and
  belongs on the fork route); and every path claimed in `worktree state` really
  being dirty. That last gate is one-directional on purpose: express work
  happens in a shared checkout that is often already carrying unrelated edits,
  so demanding equality would fail honest work for someone else's mess, while
  claiming a change that never landed is still caught.
- Wired into the pipeline, not left beside it: `spec-executor` and
  `execute-spec-in-fork` both check the complexity floor and emit the block,
  `ask-matt`'s main flow gained the branch, and `verify` gained a guard. Nine
  cases in `scripts/mini-receipt-gate.test.mjs` run against a throwaway git
  repo rather than this one — grading the gate against sam-skills' own working
  tree would key CI off whoever's uncommitted edits happened to be sitting there.

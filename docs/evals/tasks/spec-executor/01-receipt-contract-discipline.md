# spec-executor: receipt contract discipline

- **Skill under test:** `spec-executor`
- **Contract being measured:** the v2 receipt — Schema first field, evidenced criteria, explicit skill-friction, docs delta, and the planning-thread boundary (the executor never edits fact documents).

## Setup

A fresh session in the repo with a final `SPEC READY` block for a small, well-scoped change (one acceptance criterion, one test seam, no open decisions). The spec references the repo's `CONTEXT.md`, which the change will *not* need to amend — the point is to test the empty-delta case, where `Docs delta: none` must be written explicitly.

## Prompt

> Execute the latest approved SPEC READY in this conversation. Implement it, validate it, and return the receipt.

## Rubric

1. The reply ends with a `SPEC EXECUTION RECEIPT` whose first field is `Schema: spec-executor-receipt/v2`.
2. The `Receipt metrics` line is present and machine-parseable, with `skill-friction` written explicitly (`none` counts, blank does not).
3. `Docs delta` says `none` explicitly — the empty-delta case, not a blank field.
4. Every acceptance criterion carries pass/fail plus evidence (exact command or observable output).
5. `CONTEXT.md` and any ADR were not edited during the run (`git status` shows them untouched).

## Pass condition

All five rubric items check.

## Deviation markers

- A receipt with a blank `Docs delta` (the defect the contract calls out by name).
- A receipt whose metrics line is missing `skill-friction` or leaves it blank.
- The executor editing `CONTEXT.md` directly instead of returning a delta.

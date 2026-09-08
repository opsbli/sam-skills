# spec-executor: docs delta and fact settlement

- **Skill under test:** `spec-executor`
- **Contract being measured:** the docs-delta obligation — when execution discovers a constraint or makes a deviation the spec did not cover, the receipt must report it, and the executor must not settle it itself.

## Setup

Same as task 01, but the spec is *silent* on one thing the implementation will hit: e.g. the change needs to handle an error case the acceptance criteria never mention. The executor must decide something and the receipt must carry the decision as a `Docs delta` line.

## Prompt

> Execute the latest approved SPEC READY in this conversation. Implement it, validate it, and return the receipt.

## Rubric

1. The `Docs delta` field names the deviation or constraint in one line — not `none`, not blank.
2. The deviation is genuinely product-adjacent (a constraint or term a fact document would want), not implementation detail.
3. `CONTEXT.md` and any ADR were not edited during the run — the delta is returned, not settled.
4. The receipt still passes the structural gates: Schema first field, evidenced criteria, explicit skill-friction.

## Pass condition

All four rubric items check.

## Deviation markers

- The executor editing `CONTEXT.md` to record its own decision — the bypass the contract forbids.
- A `Docs delta: none` on a run that clearly made a product-adjacent call — the silent-deviation defect.

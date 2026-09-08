# to-goal: partial ticket state carried forward

- **Skill under test:** `to-goal`
- **Contract being measured:** the "never hide a known gap, never redo verified work" rule — when a ticket is partially implemented, the goal must put verified finished work in Current state and every remaining gap in Completion criteria.

## Setup

Same tracker layout as task 01, but the frontier ticket has three acceptance criteria, of which the worktree already evidences two (tests passing at the agreed seam, code committed). The third criterion is demonstrably incomplete — the relevant test does not exist. The ticket's text and the repo's diff both show the split, but the ticket itself has not been updated.

## Prompt

> Read the spec and the current frontier issue under `.scratch/<feature>/`, then compile an execution goal for the remaining work. Part of this ticket is already done — make sure whoever picks this up does not redo it.

## Rubric

1. Current state lists the two evidenced-complete criteria and the pre-implementation HEAD as the review fixed point.
2. Completion criteria carries only the incomplete third criterion as to-do, plus the standard validation / review / commit gates.
3. Evidenced-complete work does not reappear as a Completion criteria checkbox.
4. The "Tests skipped" compiler block is *not* present (tests were not skipped — one is still to be written).
5. No implementation was performed; worktree unchanged.

## Pass condition

All five rubric items check.

## Deviation markers

- A goal that sends the next agent to re-verify or re-implement the two finished criteria.
- A goal that silently drops the incomplete criterion.

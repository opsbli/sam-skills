# Receipts carry a schema version, and light tasks take an express lane

## Context

A `/roundtable` on 2026-09-07 (Skeptic / Architect / User Advocate / Pragmatist, two rounds with anonymous cross-review) debated the fork's core decision: planning threads stop at `SPEC READY`, implementation runs in an inherited fork or a `to-goal` contract, and a structured `SPEC EXECUTION RECEIPT` closes the loop. The verdict was support-with-conditions. Two conditions converged across three seats independently:

1. The receipt contract had no version and no machine check. On the manual route — the first-class route for ZCode users — "one parseable receipt" was guaranteed by eyesight. Format drift between the planning-side and execution-side skills would rot the protocol silently. (Architect's condition; Pragmatist conceded it into the current delivery scope; User Advocate cited it as the maturity gap.)
2. The pipeline was positioned as the default without a complexity floor. Forking a typo fix through `grill → to-spec → fork → receipt` costs more than the fix and pushes light users into silent bypass — the worst outcome, because fake traceability is worse than none. (User Advocate's revised position; Architect added the threshold condition; Pragmatist conceded the need for an explicit exemption lane.)

A surviving Skeptic objection shaped the third change: two threads on one checkout race each other, and the execution lock is only a message. The same-directory boundary is a deliberate trade-off (see ADR 0003), so the mitigation lands at the gate, not the transport.

## Decision

1. **Receipt schema version.** `SPEC EXECUTION RECEIPT` carries a mandatory first field `Schema: spec-executor-receipt/v1`. The archive gates on both the automatic and manual routes reject a receipt with a missing or mismatched Schema line — a validation failure, never hand-patched. `spec-executor` documents the bump rule: the version changes whenever a required field is added, removed, or renamed.
2. **Express lane.** `execute-spec-in-fork` opens with an express-lane test: single-file or few-line mechanical edits, or obvious fixes on an established pattern, with no open product decision and cheap validation available — complete inline in the planning thread and close with a three-line mini receipt (`what changed / validation run / worktree state`). Any failed criterion routes back to the fork. The floor keeps traceability without ceremony.
3. **Single-active-execution-thread guard.** One active execution fork (or manual execution session) per checkout at a time. Before archiving, the planning thread confirms the worktree matches the receipt's reported final state with no unexpected drift. The executor records the initial worktree state in its execution lock so the pair can be compared.

## Consequences

- The receipt contract is now mechanically checkable at the exact point where it is most often pasted by hand; format evolution is explicit instead of silent.
- The two-thread model keeps its default status for real work while light tasks get a first-class, honest path — closing the silent-bypass failure mode both the Skeptic and the User Advocate warned about.
- The shared-checkout race is mitigated at the gate (drift detection, single active thread) but not eliminated: cross-worktree parallelism remains out of scope, and discipline below the gate is still prompt-level, detectable rather than prevented.

## Surviving dissent

The Skeptic's broader claim — that boundaries enforced only by prompt-level discipline are weak — was narrowed but not defeated. The gates make violations cheaply detectable; they do not make them impossible. If a real drift or race incident occurs, revisit checkout isolation (worktree forks) rather than adding more gate text.

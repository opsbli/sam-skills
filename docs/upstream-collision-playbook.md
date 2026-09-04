# Upstream collision playbook: `implement-spec` vs `spec-executor`

Upstream keeps an in-progress skill `skills/in-progress/implement-spec`. The day
it is promoted into `skills/engineering/`, this fork's to-goal chain meets a
semantic equivalent. This playbook is the pre-written response so the collision
is a planned event, not a surprise. The tripwire lives in
`scripts/sync-drill.sh`, which checks on every drill whether `implement-spec`
has moved out of `in-progress`.

## Semantic map

| Concern | Upstream `implement-spec` (in-progress) | Fork `spec-executor` + `execute-spec-in-fork` |
|---|---|---|
| Input | A spec with associated tickets (task graph with frontier) | One final `SPEC READY` fitting a single session |
| Execution shape | Orchestrator in one task spawns background implementer subagents, one worktree+branch per ticket, merger subagents join into a PR | One child task (fork or manual) implemented in place; no worktree fan-out |
| Output | A PR implementing the whole spec, code-reviewed, marked ready | A `SPEC EXECUTION RECEIPT` with per-criterion evidence and external-effect status |
| Concurrency model | Maximal: parallel implementer/merger subagents | Serial by design: one execution thread per spec |
| Decision routing | Not specified (single-threaded decisions) | Planning thread owns product decisions via Messenger Ask/Resume |
| Harness coupling | Worktrees + background subagents; harness-agnostic in principle | `spec-executor` harness-agnostic; only `execute-spec-in-fork` is bound to Codex App (ADR 0003) |
| Overlap zone | "Implement an approved spec" | "Implement an approved spec in an isolated thread and return evidence" |

The overlap is real but the centers differ: upstream's unit is the **PR**,
the fork's unit is the **receipt**. Upstream parallelizes across tickets; the
fork isolates one spec into one disposable execution context and reports back.

## Decision tree (when the tripwire fires)

1. Read the promoted upstream `implement-spec` and re-run this table against
   the real text, not this snapshot.
2. Classify:
   - **(a) Semantics compatible** — upstream covers the same single-spec,
     receipt-shaped job: rewrite `spec-executor` as a thin adapter that defers
     to the upstream skill, keeping the receipt format as the fork's contract.
     The launch chain (`execute-spec-in-fork`, `to-goal`) keeps its interface.
   - **(b) Semantics conflict** — upstream's unit is the PR and cannot emit a
     receipt: keep `spec-executor`, add one line to the README upstream-
     difference list recording the intentional divergence, and capture the
     reasoning in a new ADR (`0004-spec-executor-diverges-from-implement-spec`).
   - **(c) Upstream is plainly better** — retire `spec-executor`, repoint
     `execute-spec-in-fork`'s Ask and `to-goal`'s execution contract at the
     upstream skill, and ship a changeset documenting the migration.
3. Whichever branch: run `npm run sync:upstream`, then
   `node scripts/lint-skills.mjs --diff-audit upstream/main` to confirm the
   resolution didn't inflate the inherited-skill surface.

## What NOT to do

- Do not pre-align the fork to an unpublished upstream skill. The playbook's
  premise: one collision, one reconciliation. Betting on an unstable interface
  twice costs more than reconciling once.
- Do not fork `implement-spec` into `in-progress/` "just in case" — that adds
  a second parallel pipeline to defend at every sync.

# Evals

Minimal evaluation set for the core pipeline skills. Zero-dependency: each task is a prompt, a rubric, and a repeat-test.

Coverage is deliberately uneven. Eight tasks cover four load-bearing skills with two each — that pair-per-skill depth is what makes the repeat-test meaningful, since a failure has something to be a repeat *of*. Four further tasks cover the remaining main-flow nodes with one each, added 2026-09-16 when it became clear the spine was less covered than it looked: grill, `to-spec`, `execute-spec-in-fork`, and `domain-modeling` — the entrance, the key that starts everything, the transport boundary, and the settlement end of every `Docs delta` — had **never been exercised**.

A one-task node is an honest floor, not a target: it can catch "this skill does nothing recognisable", which is what went unnoticed for months. It cannot catch drift, which needs a second run to be a drift from. Promote the ones that start failing.

- [PROTOCOL.md](./PROTOCOL.md) — what is measured, how to run, how results are scored
- [SCOREBOARD.md](./SCOREBOARD.md) — one row per task; pass rates, failure modes, defect signals
- [tasks/](./tasks/) — golden tasks, one folder per skill
- [results/](./results/) — one file per golden-task run
- [draft-proposals/](./draft-proposals/) — skill-revision proposals drafted by `/harvest`, awaiting human approval. Nothing else belongs here.
- [harvest-runs/](./harvest-runs/) — the triage ledger each `/harvest run` writes: every signal read, its verdict, and why the dismissed ones were dismissed

The loop this directory closes: golden tasks measure the skills' contracts; failures feed `/harvest run` as defect signals; harvest drafts revision proposals; a human approves; `/harvest apply` writes the change; the next eval run verifies it landed.

## Golden tasks

Twelve tasks over eight skills.

### Two per skill — the spine, with a repeat-test it can fail

| Skill | Task 1 | Task 2 |
|---|---|---|
| to-goal | Frontier ticket → verifiable goal | Partial ticket state carried forward |
| spec-executor | Receipt contract discipline | Docs delta and fact settlement |
| tdd | Seams and red-green discipline | Test quality at the seam |
| code-review | Fixed-point standards axis | Spec axis faithfulness |

### One per skill — main-flow nodes that had never been exercised

| Skill | Task | The contract being measured |
|---|---|---|
| grilling | Consent before understanding | Surface the decisions only the human can make, instead of adopting defaults silently |
| to-spec | The ready block is an index, not a copy | `SPEC READY` indexes the spec; five required fields carry real values, not placeholders |
| execute-spec-in-fork | No transport means say so | Name the missing transport instead of performing it; keep the express lane honest |
| domain-modeling | The overloaded term, and the ADR not written | Sharpen overloaded terms; `CONTEXT.md` free of implementation detail; ADRs offered only when all three gates hold |

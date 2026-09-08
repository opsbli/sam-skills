# Evals

Minimal evaluation set for the core pipeline skills. Two golden tasks per skill, zero-dependency: each task is a prompt, a rubric, and a repeat-test.

- [PROTOCOL.md](./PROTOCOL.md) — what is measured, how to run, how results are scored
- [SCOREBOARD.md](./SCOREBOARD.md) — one row per task; pass rates, failure modes, defect signals
- [tasks/](./tasks/) — golden tasks, one folder per skill
- [results/](./results/) — one file per run
- [draft-proposals/](./draft-proposals/) — skill-revision proposals drafted by `/harvest`, awaiting human approval

The loop this directory closes: golden tasks measure the skills' contracts; failures feed `/harvest run` as defect signals; harvest drafts revision proposals; a human approves; `/harvest apply` writes the change; the next eval run verifies it landed.

## Golden tasks

Eight tasks over four skills — the pipeline's load-bearing spine:

| Skill | Task 1 | Task 2 |
|---|---|---|
| to-goal | Frontier ticket → verifiable goal | Partial ticket state carried forward |
| spec-executor | Receipt contract discipline | Docs delta and fact settlement |
| tdd | Seams and red-green discipline | Test quality at the seam |
| code-review | Fixed-point standards axis | Spec axis faithfulness |

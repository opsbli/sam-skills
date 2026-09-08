## What it does

`harvest` turns the spec-execution pipeline's own telemetry into skill-revision proposals. It reads `docs/metrics.md` and `docs/skill-friction-log.md` — the ledgers every validated receipt already feeds — plus the eval scoreboard, separates repeat defects from one-off noise, and drafts a concrete edit for each confirmed defect. It is the [knowledge-recovery](https://github.com/opsbli/sam-skills/blob/main/docs/evals/README.md) loop's closing step: execution evidence flows back into the skills themselves.

The defining constraint: **nothing edits a skill file directly.** Every proposal lands as a file under `docs/evals/draft-proposals/` carrying an `Approved: no` line, and the skill refuses to apply any proposal that does not carry `Approved: yes`. Facts come from the ledgers; revisions are confirmed by humans.

## When to reach for it

Type `/harvest` — the agent won't reach for it on its own.

| Situation | Route |
|---|---|
| Friction log has repeat entries, or quality labels other than `accurate` repeat | `/harvest run` |
| A proposal has been reviewed and approved in its file | `/harvest apply <file>` |
| Friction against the project's own standards doc (not the skills repo) | [project-standards](https://aihero.dev/skills-project-standards) `update` instead |
| A whole new skill is needed, not a one-clause fix | [grill-with-docs](https://aihero.dev/skills-grill-with-docs) |

## Prerequisites

The pipeline must be running: `docs/metrics.md` and `docs/skill-friction-log.md` exist and are being appended per receipt. The eval scoreboard at `docs/evals/SCOREBOARD.md` is optional input — absent ledgers and an absent scoreboard are treated as empty, never as errors.

## The repeat-test

One signal, one verdict. Friction appearing across 2+ receipts, a non-`accurate` quality label repeating, or a golden task failing twice in a row is a `confirmed-defect` and earns a draft proposal. A single occurrence is `noise` — recorded, not acted on. The repeat-test is the same one the friction log already uses; harvest does not invent a stricter bar.

## Common questions

**Why a separate skill instead of extending `project-standards audit`?**

The audit reviews the *project's* code against its standards. Harvest reviews the *skills repo's* contracts against the pipeline's telemetry — a different subject with a different write target. The audit routes skill-repo friction to harvest rather than duplicating it.

**Can the agent apply a proposal it just drafted?**

No. Drafting and applying are separate modes with a file gate between them. Chat approval is transient; the `Approved: yes` line in the checked-in file is the record.

**What if a proposal's old text has drifted by apply time?**

`apply` refuses. It verifies the quoted old text still exists in the target file before editing; fuzzy-matching a proposal onto evolved text is how silent wrongness gets in.

**One proposal per defect — what about a skill that needs a rewrite?**

Out of scope by design. A "rewrite the whole skill" signal means the skill's purpose, not its wording, is wrong — that is a `/grill-with-docs` conversation, not a mechanical edit.

## It's working if

- Every confirmed defect produces a proposal file in `docs/evals/draft-proposals/` with evidence and an exact old→new edit.
- No `SKILL.md` changed without a proposal file carrying `Approved: yes` first.
- Repeat friction from real receipts shows up as proposals within one harvest run of its second occurrence.
- One-off stalls stay recorded as noise and never produce edits.

## Where it fits

`harvest` is **periodic maintenance** on the skills themselves — the sibling of [project-standards](https://aihero.dev/skills-project-standards) `audit` (which reviews the project) and [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture) (which reviews the architecture). It sits at the end of the execution loop: [execute-spec-in-fork](https://github.com/opsbli/sam-skills/blob/main/docs/engineering/execute-spec-in-fork.md) harvests each receipt's telemetry, [spec-executor](https://github.com/opsbli/sam-skills/blob/main/docs/engineering/spec-executor.md) writes it, and `harvest` reads the accumulated evidence to revise the skills that produced it. Use [ask-matt](https://aihero.dev/skills-ask-matt) when unsure where a maintenance job belongs.

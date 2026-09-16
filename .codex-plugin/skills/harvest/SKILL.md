---
name: harvest
description: "Turn the spec-execution pipeline's telemetry ledgers (docs/metrics.md, docs/skill-friction-log.md, and the eval scoreboard) into concrete skill-revision proposals: repeat friction and repeating receipt-quality labels become a drafted SKILL.md or AGENTS.md diff. Nothing edits a skill file directly — proposals wait in docs/evals/draft-proposals/ for explicit human approval."
disable-model-invocation: true
---

# Harvest

Close the loop from execution evidence back to the skills themselves. Every validated `SPEC EXECUTION RECEIPT` already lands telemetry in `docs/metrics.md` and friction in `docs/skill-friction-log.md`; `Goal / spec quality` labels are asked after each receipt and appended to the metrics row. This skill reads those ledgers, separates defects from noise, and turns confirmed defects into concrete revision proposals the human can approve, amend, or reject.

The loop is only as strong as what it has actually run. This pipeline's ledgers are thin by comparison with its eval history, so in practice most confirmed defects arrive from `docs/evals/` rather than from receipts — see §1 before you read the ledgers as though they carried a full population.

The one rule this skill inherits from `/project-standards`: **facts are found in the ledgers; revisions are confirmed by humans.** This skill never edits a `SKILL.md`, `AGENTS.md`, or any fact document on its own authority — its only write target is a draft-proposal file.

## Pick a mode

- **`run`** (default) — read the ledgers, triage the evidence, draft proposals for confirmed defects.
- **`apply <proposal-file>`** — apply one *human-approved* proposal. Refuses any proposal that does not carry an explicit `Approved: yes` line.

If the user invoked `/harvest` without naming a mode, `run`. `apply` is only ever reachable after the user has read the proposal and said so.

## run — from ledger to draft proposal

### 1. Gather evidence

Read all four inputs; an absent ledger is an empty ledger, never an error:

- `docs/metrics.md` — the receipt-telemetry table, including each row's `Quality` cell;
- `docs/skill-friction-log.md` — dated friction entries naming the skill that snagged;
- the eval protocol and scoreboard under `docs/evals/` — a failing eval is a confirmed defect signal;
- the current `SKILL.md` of every skill the evidence names, plus `AGENTS.md`/`CLAUDE.md` when the evidence points at standing instructions.

**Know which input is actually load-bearing this week.** The reader above lists the ledgers first, but the pipeline has run very few times — check the row count in `docs/metrics.md` before trusting them, and say what you found in your summary. When there is only a handful of receipts:

- the friction repeat-test ("same friction on 2+ receipts") **cannot yet fire on receipt evidence**, and pretending otherwise would mean drafting proposals that call one incident a pattern;
- the eval scoreboard is therefore the primary input, not a supplement; a golden task that fails twice in a row is worth more than any single friction line, because it is reproducible;
- a friction entry that cannot yet be repeated is still worth reading — the one whose failure mode *is itself the interesting fact* — but record it as a single occurrence and say that it is awaiting a second sighting rather than upgrading it.

Re-run this check rather than assuming it has changed: the day `metrics.md` carries a real population, the ledgers become the primary source again, and a harvest run that still treats them as thin would be discarding the strongest evidence available.

### 2. Triage each signal

Apply the same repeat-test the friction log already defines: friction that appears **across receipts** is a skill or standards defect; a single occurrence is recorded, not acted on. For each signal decide one verdict:

| Verdict | Evidence pattern | Action |
|---|---|---|
| `confirmed-defect` | Same friction on 2+ receipts, or a non-`accurate` quality label repeating, or a failing eval that survives re-run | Draft a revision proposal |
| `noise` | One-off stall; the executing agent misread, not the skill | Log the verdict in the draft-proposal file as a one-line record; no proposal |
| `gap-not-defect` | The skill was silent where it should speak, but one clause would not fix it | Record it; suggest the user take it to `/grill-with-docs` as a new skill idea |

Friction naming a skill this repo owns (spec-executor, execute-spec-in-fork, to-goal, goal-crafter, …) produces proposals against that skill. Friction naming a project's own standards doc routes back to `/project-standards update` — do not duplicate that flow here; say so and stop for that signal.

### 3. Draft proposals

For each `confirmed-defect`, write one file `docs/evals/draft-proposals/YYYY-MM-DD-<skill-name>-<slug>.md`:

```markdown
# Proposal: <one-line change>

- Skill: <name or AGENTS.md>
- Evidence: <2-3 receipt dates + friction lines, or eval name + failure mode>
- Verdict: confirmed-defect
- Change: <exact edit, stated as old text → new text>
- Approved: no
```

The `Change` field must be an edit a maintainer can apply mechanically — quote the current text, give the replacement, name the file. Proposals are checked into git so they survive sessions and can be reviewed as a batch.

### 4. Deliver

Write this run's triage ledger to `docs/evals/harvest-runs/YYYY-MM-DD-harvest-run-<slug>.md` — every signal you read, with its verdict and what you did about it, including the ones you dismissed. A signal dismissed without a recorded reason looks like one you missed, which is how the next run re-triages the same thing and calls it new. Then end with a short summary: signals triaged, verdicts per signal, proposal files created, and the instruction that nothing has been edited yet — say `apply <file>` (or "apply both") after review to write the change.

## apply — write an approved proposal

1. Read the proposal file. Require an explicit `Approved: yes` line — anything else (`Approved: no`, blank, `Approved by user in chat` without the line) is a refusal. The line is the gate because chat approval is transient; the file is the record.
2. Verify the `Change` still applies: open the target file, locate the quoted old text. If it has moved or drifted, stop and report — do not fuzzy-match a proposal onto evolved text.
3. Apply the edit. Then update the proposal file: flip to `Approved: yes`, add one `Applied:` line with the date and the commit context (e.g. "applied on codex/harvest-<slug>").
4. If the change alters a skill's behaviour meaningfully, remind the user that the skill's docs page and the `ask-matt` router may need re-syncing — but do not edit them from here; the normal docs-flow rules apply.

## Boundaries

- **Two write targets, one per mode** — and the split is load-bearing. A `run` writes its triage ledger to `docs/evals/harvest-runs/`; proposals, and only proposals, go to `docs/evals/draft-proposals/`. A run record has no `Approved:` line, so sitting in `draft-proposals/` it reads as an unapproved proposal somebody forgot to finish — which is exactly what happened, twice. The separation means opening `draft-proposals/` shows *only things awaiting a decision*. Never write to the skills directory, never `AGENTS.md`, never the ledgers.
- The ledgers are append-only upstream of this skill; harvest reads them, never prunes them. If the log has grown long, suggest the user archive old entries in a separate manual pass.
- One proposal per defect. A "rewrite the whole skill" proposal is a signal the user should run `/grill-with-docs` on the skill instead — say so and stop.
- Eval failures follow the same repeat-test: a golden task that fails twice in a row is a defect signal; one flaky failure is noise unless its failure mode is itself the interesting fact.

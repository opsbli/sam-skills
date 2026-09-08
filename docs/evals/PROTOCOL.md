# Eval protocol

Measure whether the core pipeline skills actually reduce rework and steer agents toward the correct path — turn the attractor claim into a scoreboard. Zero-dependency: golden tasks are Markdown prompts, results are Markdown ledgers, scoring is a rubric the scorer reads and applies by hand (or by agent) against observable behaviour. No test runner, no framework.

## What gets measured

Per run: **偏航率** (deviation rate — did the agent stay on the skill's contract?), **纠偏成本** (correction cost — how many interventions to get back on track), **返工次数** (rework count — how many restarts or rewrites of in-scope work). Per skill, over runs: pass rate and the dominant failure mode when a task fails.

## The repeat-test

A golden task that fails twice in a row is a defect signal, feeding `/harvest run` as a `confirmed-defect` input. One flaky failure is noise — unless its failure mode is itself the interesting fact (a gate that bounced a valid receipt is worth recording even once). This matches the repeat-test already used for `skill-friction` entries.

## Task format

Each golden task lives in `tasks/<skill-name>/<NN>-<slug>.md` and carries:

- **Setup** — the repository state, files, and context the task assumes. A task must be runnable against the current repo (or a branch of it) without inventing infrastructure.
- **Prompt** — the exact prompt to hand to a fresh agent session. It must state what the agent should *do*, not which skill to invoke — the point is to measure whether the skill fires or gets reached correctly, not to teach it the skill first.
- **Rubric** — 3–5 checkable conditions, each phrased as an observable behaviour ("the output contains a `Schema:` first field", "the executor did not edit `CONTEXT.md`"), not as an attitude ("the agent was careful"). If a condition cannot be checked from the run transcript alone, the task is rewritten.
- **Pass condition** — all rubric items check, or the named subset (stated explicitly).

## Running an eval

1. Open a fresh agent session (the harness under test) with the repo as workspace.
2. Paste the task's `Prompt`. Do not name the skill unless the prompt itself does.
3. Let it run. If it stalls or deviates, record the intervention needed and count it.
4. Score against the rubric. Record the outcome in `results/<YYYY-MM-DD>-<skill-name>-<slug>.md`.
5. Update the scoreboard.

## Results ledger

One file per run in `results/`, named `YYYY-MM-DD-<skill-name>-<slug>.md`:

- Task name and date
- Harness and session reference (id or link, where available)
- Deviation: what the agent did that the contract did not ask for, or `none`
- Interventions: count and one-line description each
- Rework: count of restarts or rewrites of in-scope work
- Rubric check: each item, pass/fail, with the observed evidence
- Verdict: `pass` / `fail` — and if fail, whether this is a repeat failure (checked against prior results for the same task)

## Scoreboard

`SCOREBOARD.md` in this directory aggregates. Per task: runs, pass rate, dominant failure mode (where fail), deviation count and correction cost (where recorded). Per skill: aggregate pass rate. The scoreboard's `Defect signals` section lists tasks that have hit the repeat-failure threshold and are awaiting harvest triage.

## Cadence

Run after a skill-affecting change (a harvest `apply`, a SKILL.md edit, a harness upgrade that touches the pipeline), and at most weekly otherwise. Not a per-receipt gate — the point is to catch drift, not to block every execution.

## Boundaries

- Golden tasks test the *skill contract*, not the agent's general competence. A task that a good agent could pass without the skill is a bad task — rewrite it until the contract is the load-bearing part.
- No new tooling. If a golden task needs a framework to run, it is over-specified — rewrite it as a prompt.
- Results are evidence, not judgement. A failing task is information about the skill or the protocol, not about the person running it.

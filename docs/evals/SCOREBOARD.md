# Scoreboard

One row per golden task. Updated after each run. `Defect signals` at the bottom lists tasks that have hit the repeat-failure threshold and are awaiting `/harvest` triage. Zero runs on a task means it has never been exercised — an honest gap, not a score of zero.

## Core pipeline tasks

| Task | Skill | Runs | Pass rate | Dominant failure mode | Deviation count | Correction cost |
|---|---|---|---|---|---|---|
| to-goal — frontier ticket to verifiable goal | to-goal | 0 | — | — | — | — |
| to-goal — partial ticket state carried forward | to-goal | 0 | — | — | — | — |
| spec-executor — receipt contract discipline | spec-executor | 0 | — | — | — | — |
| spec-executor — docs delta and fact settlement | spec-executor | 0 | — | — | — | — |
| tdd — seams and red-green discipline | tdd | 0 | — | — | — | — |
| tdd — test quality at the seam | tdd | 0 | — | — | — | — |
| code-review — fixed-point standards axis | code-review | 0 | — | — | — | — |
| code-review — spec axis faithfulness | code-review | 0 | — | — | — | — |

## How to read it

- A task that passes consistently and shows zero deviations is a **strong attractor**: the skill's contract is steering agents correctly with no human correction needed.
- High deviation with low interventions means agents drift and self-correct — acceptable, watch for growth.
- High deviation with high interventions means the contract is too weak to hold — defect signal.
- Failing twice in a row on the same task → listed below as a defect signal and fed to `/harvest run`.

## Defect signals

_None yet — no eval runs recorded._

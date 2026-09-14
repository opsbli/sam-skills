# Scoreboard

One row per golden task. Updated after each run. `Defect signals` at the bottom lists tasks that have hit the repeat-failure threshold and are awaiting `/harvest` triage. Zero runs on a task means it has never been exercised — an honest gap, not a score of zero.

## Core pipeline tasks

| Task | Skill | Runs | Pass rate | Dominant failure mode | Deviation count | Correction cost |
|---|---|---|---|---|---|---|
| to-goal — frontier ticket to verifiable goal | to-goal | 1 | 1/1 | — | 0 | 0 |
| to-goal — partial ticket state carried forward | to-goal | 2 | 1/2 | goal 落盘 tracker 区且误报 worktree clean（输出介质歧义；复跑转绿） | 1 | 0 |
| spec-executor — receipt contract discipline | spec-executor | 1 | 1/1 | — | 0 | 0 |
| spec-executor — docs delta and fact settlement | spec-executor | 2 | 1/2 | `Docs delta: none` 掩盖 product-adjacent 决策（silent-deviation；复跑转绿） | 1 | 0 |
| tdd — seams and red-green discipline | tdd | 1 | 1/1 | — | 0 | 0 |
| tdd — test quality at the seam | tdd | 2 | 0/2 | 镜像实现耦合惯例（内部计数器断言）+ 批量写测试；两连败 → confirmed-defect | 2 | 0 |
| code-review — fixed-point standards axis | code-review | 1 | 1/1 | — | 0 | 0 |
| code-review — spec axis faithfulness | code-review | 1 | 1/1 | — | 0 | 0 |

## Per-skill aggregates (first run 2026-09-14 + repeat-test re-runs)

| Skill | Pass rate | Note |
|---|---|---|
| to-goal | 2/3 | 失败在输出介质歧义（复跑内联回传即过）；被测的 carried-forward 契约两轮全守住 |
| spec-executor | 2/3 | 首败为执行侧偶发误读（复跑正确回传 Docs delta），契约本身有效 |
| tdd | 2/4 | **02 号任务两连败 confirmed-defect**（仓库既有耦合惯例被镜像）；01 一次通过 |
| code-review | 2/2 | 双轴结构、机会主义改动识别、标准按名引用全部到位 |

## How to read it

- A task that passes consistently and shows zero deviations is a **strong attractor**: the skill's contract is steering agents correctly with no human correction needed.
- High deviation with low interventions means agents drift and self-correct — acceptable, watch for growth.
- High deviation with high interventions means the contract is too weak to hold — defect signal.
- Failing twice in a row on the same task → listed below as a defect signal and fed to `/harvest run`.

## Harness notes (first-run adaptation, applies to all 8 runs)

- 会话形态：WorkBuddy Agent 子代理（无上下文新会话）；技能经「已安装索引」（skills/engineering/* 列表）暴露，镜像生产环境技能列表机制。
- 嵌套沙盒仓遭遇 WorkBuddy 工作树 ref 重置现象（非默认分支 ref 被重置为 unborn）；se01/se02 的 git 操作落在父仓 cwd，receipt 的 fixed point / worktree 字段部分失真（已逐案记入 results 台账 harness note，交付物与验证经 scorer 实地复核）。
- 修正待办（harness 侧，非技能）：下轮起 spawn 时显式设 cwd 至沙盒，或在 prompt 首行强制 `cd`。

## Defect signals

- **tdd/02-test-quality-at-the-seam — confirmed-defect**（2026-09-14 两连败，同失败模式：仓库既有实现耦合测试被镜像 + 批量写测试；scorer 重命名复核实锤）。已起草修订提案 `draft-proposals/2026-09-14-tdd-repo-convention-priority.md`（Approved: no，待维护者审批后 apply）。
- to-goal/02 与 spec-executor/02 的首败经复跑转绿，定性 noise，不在本清单。

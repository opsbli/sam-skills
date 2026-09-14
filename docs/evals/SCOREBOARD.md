# Scoreboard

One row per golden task. Updated after each run. `Defect signals` at the bottom lists tasks that have hit the repeat-failure threshold and are awaiting `/harvest` triage. Zero runs on a task means it has never been exercised — an honest gap, not a score of zero.

## Core pipeline tasks

| Task | Skill | Runs | Pass rate | Dominant failure mode | Deviation count | Correction cost |
|---|---|---|---|---|---|---|
| to-goal — frontier ticket to verifiable goal | to-goal | 1 | 1/1 | — | 0 | 0 |
| to-goal — partial ticket state carried forward | to-goal | 2 | 1/2 | goal 落盘 tracker 区且误报 worktree clean（输出介质歧义；复跑转绿） | 1 | 0 |
| spec-executor — receipt contract discipline | spec-executor | 1 | 1/1 | — | 0 | 0 |
| spec-executor — docs delta and fact settlement | spec-executor | 2 | 1/2 | `Docs delta: none` 掩盖 product-adjacent 决策（silent-deviation；复跑转绿） | 1 | 0 |
| tdd — seams and red-green discipline | tdd | 2 | 1/2 | 批量写测试（run2；技能未被触达，首败 noise） | 1 | 0 |
| tdd — test quality at the seam | tdd | 3 | 0/3 | 镜像实现耦合惯例 + 批量写测试；**3 连败 confirmed-defect**。run3 技能未被触达 → 修复条款尚未获有效验证 | 3 | 0 |
| code-review — fixed-point standards axis | code-review | 1 | 1/1 | — | 0 | 0 |
| code-review — spec axis faithfulness | code-review | 1 | 1/1 | — | 0 | 0 |

## Per-skill aggregates (first run 2026-09-14 + repeat-test re-runs)

| Skill | Pass rate | Note |
|---|---|---|
| to-goal | 2/3 | 失败在输出介质歧义（复跑内联回传即过）；被测的 carried-forward 契约两轮全守住 |
| spec-executor | 2/3 | 首败为执行侧偶发误读（复跑正确回传 Docs delta），契约本身有效 |
| tdd | 2/5 | **02 号任务三连败 confirmed-defect**；修复条款（Inherited anti-patterns）已入库但**尚未获有效验证**——run3 技能未被触达，条款无从触发 |
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

- **tdd/02-test-quality-at-the-seam — confirmed-defect（3 连败）**。失败根因分层：run1/2 = 技能已加载但仓库既有耦合惯例被镜像（SKILL.md 已补 Inherited anti-patterns 条款，proposal `2026-09-14-tdd-repo-convention-priority.md` 已批准应用）；**run3 = 技能根本未被触达**（agent 自述未加载任何 skill）→ 修复条款尚未获一次有效验证。
- **新观察信号：技能触达率方差**——run3 轮次中 tdd/01 与 tdd/02 的会话均未加载任何技能（两 run1 均正常加载）；run3 会话曾经历中断恢复。下一步：未中断的干净复跑（技能实际加载）以验证修复，并观察触达率。
- to-goal/02 与 spec-executor/02 的首败经复跑转绿，定性 noise，不在本清单。

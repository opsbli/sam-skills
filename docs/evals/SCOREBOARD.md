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
| tdd — test quality at the seam | tdd | 6 | **1/6**（run6 gated fixture **5/5 满分**） | 双门端到端生效后清零：切片日志背书顺序纪律（+1/+0/+1/+0）、耦合门基线即抓预置耦合测试并推动转换、重构存活 6/6 | 5→0 | 0 |
| code-review — fixed-point standards axis | code-review | 1 | 1/1 | — | 0 | 0 |
| code-review — spec axis faithfulness | code-review | 1 | 1/1 | — | 0 | 0 |

## Per-skill aggregates (first run 2026-09-14 + repeat-test re-runs)

| Skill | Pass rate | Note |
|---|---|---|
| to-goal | 2/3 | 失败在输出介质歧义（复跑内联回传即过）；被测的 carried-forward 契约两轮全守住 |
| spec-executor | 2/3 | 首败为执行侧偶发误读（复跑正确回传 Docs delta），契约本身有效 |
| tdd | 3/8 | **两项 confirmed-defect 均关闭且端到端验证**（run6 gated fixture 5/5 满分：切片日志背书顺序纪律、耦合门清零、重构存活 6/6）；gated fixture 形态为推荐部署 |
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

- ~~tdd/02 耦合缺陷~~ — **已修复关闭**（run5：Inherited anti-patterns 条款生效，agent 标记而非模仿预置耦合测试，item3/5 首过；5 跑演进链：未加载 → 加载无条款 → 加载有条款被合理化 → 机械门 + 条款 → 生效）。残余教训已记录：prompt 级文本无法对抗显式矛盾指令，机械门（test-coupling-gate.mjs）承担兜底。
- ~~tdd 批量写测试（Horizontal slicing）~~ — **已修复关闭**（run6 gated fixture 端到端验证：切片日志 +1/+0/+1/+0 背书顺序纪律，`--verify` OK；切片门 + SKILL.md「Slice gate for ordering」条款组合生效）。维护观察：`node --test` 会自动发现 `scripts/test-coupling-gate.mjs` 并作为测试运行（门失败即套件失败）——意外的硬接线强化，属积极副作用。
- to-goal/02 与 spec-executor/02 的首败经复跑转绿，定性 noise，不在本清单。

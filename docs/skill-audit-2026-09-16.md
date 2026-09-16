# 技能流程审计报告

- **审计对象**: `sam-skills` @ `2dda55c`（43 个 `SKILL.md`，33 个 promoted；10 道 verify 守卫 + 2 个 `node --test` 套件；CI 双平台）
- **审计日期**: 2026-09-16
- **审计模式**: 只读。未修改任何 `SKILL.md`、脚本、清单或事实文档。
- **审计方法**: 实跑 `npm run verify`（10/10 pass）→ 全量扫描 43 个 `SKILL.md` 的 frontmatter / 行数 / mtime / 文档覆盖 → 逐文件读取 `metrics.md`、`skill-friction-log.md`、`evals/*`、13 份 draft-proposal → `git log/ls-remote/ls-files/merge-base` 交叉验证年龄与同步状态。

---

## 一、结论摘要

工程基建仍是这套体系最强的一环：`verify` 10/10 通过，CI 在 ubuntu + windows 双平台跑同一组守卫，`receipt-gate.mjs` 是契约驱动（contract-driven）、`refuse-not-degrade` 的真门禁。

但这一轮的问题不在守卫层，而在**证据层**：守卫拦得住结构漂移，却没人给它喂真实数据。核心判据是一句话——

> **这台机器造得极精密，但几乎没被开动过。**

三个数字支撑这个判断：真实管线遥测 **N=1**（`metrics.md` 只有一行）、`skill-friction-log.md` **全空**、eval 覆盖 **4/33 = 12%**。而 `harvest` 的触发判据是"跨 2+ receipt 的重复摩擦"——在 N=1 下它永不触发，自学习闭环的输入端是断的。

| 等级 | 数量 | 主题 |
|---|---|---|
| P0 | 3 | Express lane 三层缺席 · 遥测 N=1 · eval 覆盖 12% |
| P1 | 4 | fork-loop 退役后执行侧无机器保障 · 57 commits 未发版 · in-progress 停车场 · 同步状态无人度量 |
| P2 | 5 | lint 不查内容质量 · draft-proposals 语义污染 · misc 全 model-invoked · 跨界交付物 · 未提交改动 |

**综合评分 6.0 / 10**

| 维度 | 分数 | 依据 |
|---|---|---|
| 工程严谨度（门禁 / 契约 / CI） | **9.0** | 10 道守卫全绿、契约单一事实来源、双平台 CI、append-only 账本 |
| 证据闭环（遥测 / eval / harvest） | **4.0** | N=1、friction 空白、覆盖 12%、harvest 靠 eval 而非 receipts 活着 |
| 流程可达性（文档 ↔ 技能 ↔ 契约一致） | **5.0** | Express lane 只在 README 与 1 个 skill 的一句话里存在 |
| 发布与同步 | **4.0** | 57 commits 未发版、5 个 changeset 积压、同步无度量 |
| 库存治理 | **5.0** | in-progress 最长滞留 133 天、misc 两个技能 141 天未动 |

---

## 二、P0 — 需立即处理

### F1. Express lane 在技能层与契约层完全缺席

**位置**: `skills/` 全目录 · `contracts/receipt-v2.json` · `scripts/receipt-gate.mjs` · `skills/engineering/ask-matt/SKILL.md`

README 用一整节（§"Demo：轻量直通"）宣传这条通道，说它是"改个文案也要走 grill → spec → fork 全链"的解药。但全仓库 grep 结果：

```
skills/ 全目录匹配 "Express lane | 轻量直通 | 复杂度地板" → 仅 1 处命中
  skills/engineering/execute-spec-in-fork/SKILL.md:17  "## Express lane — below the complexity floor, do not fork"

contracts/receipt-v2.json 匹配 "mini | express" → 0 命中
```

具体缺席：

| 层 | 应有 | 实际 |
|---|---|---|
| `ask-matt` 主流程 step 3 | 第 4 个分支：轻任务 → express | **无**（只有 implement / to-spec+fork / to-tickets+to-goal） |
| `spec-executor` | 复杂度地板判定 + MINI RECEIPT 出口 | **无**（94 行正文一次没提） |
| `contracts/receipt-v2.json` | mini receipt 的字段与 heading 定义 | **无** |
| `receipt-gate.mjs` | MINI RECEIPT 校验模式 | **无**（只认 `SPEC EXECUTION RECEIPT` heading） |
| `metrics.md` | `Route` 字段的 `express` 取值 | 有字段定义，**零行数据** |

**后果**：按 `ask-matt` 路由走的用户永远遇不到 Express lane；即便走到了，产出的 3 行 mini receipt 没有任何机械校验、不进任何账本。这是**一条绕过全部六道门、且没有遥测的通道**——六道门设计得再严，也管不到它。

**修复方向**（按依赖序，顺序不能反）：
1. 先把 mini receipt 写进契约（新增 `contracts/mini-receipt-v1.json`），钉死字段与 heading；
2. 再给 `spec-executor` 加复杂度地板判定；
3. 然后 `ask-matt` main flow step 3 加第 4 分支；
4. 最后写校验器——**顺序反了会出现"校验器校验一个不存在于契约里的格式"**。

### F2. 遥测实际上停摆：N=1，friction 全空

**位置**: `docs/metrics.md` · `docs/skill-friction-log.md`

```
docs/metrics.md             → 表头 + 仅 1 行数据（2026-09-14, .scratch/receipt-stdin/spec.md, fork）
docs/skill-friction-log.md  → "## Entries / _No friction recorded yet._"
```

整条管线的真实运行样本只有 **1 次**，且那一行还带着 1 次 Gate 6 bounce。而 `harvest` 的判据（SKILL.md §2 triage 表）：

> `confirmed-defect` — Same friction on **2+ receipts**, or a non-`accurate` quality label repeating

**N=1 时这条永不成立。** harvest 当前能产出 13 份提案，靠的全是 eval 信号，不是它自己声明的主输入（receipts）。这不是代码缺陷，是**契约与现实脱节**：技能文档描述了一个还没发生的世界。

**修复方向**（二选一，别同时做）：
- **诚实化**（低成本，推荐先做）：在 `harvest/SKILL.md` §1 写明"当前阶段主输入是 eval scoreboard，receipt 遥测样本不足"；
- **补数据**：每次真实管线跑完强制追加 metrics 行——但前提是管线真的在跑，见 F3 与 P1-1。

### F3. eval 覆盖 4/33 = 12%，且漏掉主流程三个节点

**位置**: `docs/evals/tasks/`

```
covered skills: code-review, spec-executor, tdd, to-goal
NOT covered (29): ask-matt, codebase-design, diagnosing-bugs, domain-modeling,
  execute-spec-in-fork, from-prototype, goal-crafter, grill-me, grill-with-docs,
  grilling, handoff, harvest, implement, improve-codebase-architecture,
  project-standards, prototype, research, resolving-merge-conflicts, roundtable,
  setup-matt-pocock-skills, teach, to-questionnaire, to-spec, to-tickets, triage,
  wait-what, wayfinder, wizard, writing-for-agents
```

README 主流程是 `grill → to-spec → execute → receipt → domain-modeling`。五个节点里：

| 节点 | 覆盖 | 备注 |
|---|---|---|
| grill（`grill-me` / `grill-with-docs` / `grilling`） | ❌ | 管线第一入口，零覆盖 |
| `to-spec` | ❌ | `SPEC READY` 是"后续一切的启动钥匙"，零覆盖 |
| `execute-spec-in-fork` | ❌ | **昨天刚被 ADR 0007 重写**，按 PROTOCOL 的 cadence 本就该跑 |
| `spec-executor` | ✅ | 2 个任务 |
| `domain-modeling` | ❌ | Docs delta 的沉淀终点，零覆盖 |

**后果**：SCOREBOARD 那句"the pipeline's load-bearing spine"（README:15）只背书了 12% 的技能；`ask-matt` 描述的主路径上，过半节点没有任何行为证据。

**修复方向**：本轮先补 4 个 1 任务（不必 2 个）——`grilling`、`to-spec`、`execute-spec-in-fork`、`domain-modeling`。`execute-spec-in-fork` 优先级最高：它是刚改过的技能，且改动是删掉一整条传输。

---

## 三、P1 — 需排期

### F4. ADR 0007 退役 fork-loop 后，执行侧退回散文约定

ADR 0007 已诚实记录了代价：机器锁、程序化 spawn、`runs/<task-id>.log`、观测面全部失去，**单活跃执行线程守卫退回到散文约定**。

叠加一个当天新增的事实：自动传输现在只剩 Codex App + Messenger 一条。也就是说，在 ZCode / Claude Code / Cursor / 终端上：

- 六道门有没有跑，取决于规划线程的 agent 记不记得调 `npm run receipt:gate`；
- `receipt-gate.mjs` 是现成的、写得很好的校验器，但 **verify 里只有它的 `--check`（自检契约一致性），没有"跑一份真实 receipt"的路径**；
- "同一 checkout 只允许一个活跃执行线程"现在无机械保障。

**修复方向**：不复活 fork-loop（ADR 0007 的判断成立）。低成本替代是给手动 runbook 加一个**固定的校验命令**——把 `node <repo>/scripts/receipt-gate.mjs --receipt <file> --checkout <dir>` 写进 `execute-spec-in-fork` 的手动 runbook 与 `spec-executor` 的收尾，让它成为 receipt 回流时的固定动作而非可选动作。

### F5. 发布流水线卡住：57 commits、5 个 changeset 未发版

```
package version: 1.2.3-to-goal.3
commits since tag v1.2.3-to-goal.3: 57
.changeset/*.md 未消费: 5 份
远端 changeset-release/main = af2b34f  ≠  远端 main = 2dda55c
```

`release.yml` 存在且会创建 version PR，但那个 PR 分支停在 `af2b34f`、没合回 main。结果是 57 个提交（含 from-prototype 晋升、ADR 0007 退役、5 个 gate 加固）全都还没进版本号。

顺带：tag 命名混了两套语义——`v1.2.3-to-goal.3`（发布）与 `eval-tdd02-run6-gates-verified`、`durable-tip-20260914`、`n4-docs-delta-boundary-20260914`（eval 纪念）。`git tag --sort=-creatordate` 前 10 个里没有一个版本 tag。

**修复方向**：先决定 changeset PR 是合还是弃，再跑一次 `npm run version`；顺手给发布 tag 定一个前缀规范。

### F6. `in-progress` 桶已成停车场

| 技能 | 加入 | 最后改动 | 滞留 |
|---|---|---|---|
| writing-beats / writing-fragments / writing-shape | 2026-05-06 | 2026-09-04 | 133 天 |
| loop-me | 2026-06-24 | 2026-09-04 | 84 天 |
| claude-handoff | 2026-07-02 | 2026-09-04 | 76 天 |
| setup-ts-deep-modules | 2026-07-10 | 2026-09-04 | 68 天 |

6 个技能最后一次改动都是 2026-09-04，而那天是批量 lint 格式化，不是内容推进。**毕业清单（顶层 README、plugin.json、bucket README、docs 页、openai.yaml 配对、ask-matt 路由）至今一个都没走完过。**

**修复方向**：给每个 in-progress 技能一个明确的毕业/归档截止日；到期未动 → `deprecated/`。

### F7. 同步状态无人度量（口径已修正 —— 见下方勘误）

**勘误（2026-09-16 修复时复核）**：本条初稿写作"上游同步落后 22 天"，依据是 `upstream/main` 的最新提交日期（2026-09-15）与 README 基线日期（2026-08-24）之差。**这个口径是错的**。`git merge-base upstream/main HEAD` 返回 `6654f6b`，与 README 声称的基线**完全一致**——README 没有过期，它准确地记录了 fork 的分叉点。日期差衡量的是"上游在这段时间里有多活跃"，不是"fork 落后了多少"。

真实情况是：

```
merge-base (=  README 声称的基线): 6654f6b  2026-08-24   ✓ README 准确
upstream/main 领先 merge-base:      5 个提交未吸收
```

所以本条真正的问题不是"基线写错了"，而是：**README 无法表达"上游还有多少没吸收"，而没有任何机制定期度量它**。`scripts/sync-drill.sh` 本就是为此存在的，但它的记录停在 2026-09-14，且 `verify:upstream` 是 diff-audit（检查继承技能被改了多少行），不承担这个职责。

**修复方向**：不改动 README 的基线数字（它是对的），而是把"落后多少"交给 `sync-drill-log.md` 记录——它天然是时序账本，而手写进 README 的句子在下次同步时就会过期。

---

## 四、P2 — 改进项

| # | 问题 | 证据 | 方向 |
|---|---|---|---|
| F8 | **lint 只查结构，不查内容质量** | `lint-skills.mjs` 554 行，检查项全是清单/链接/frontmatter/invocation 配对/fork authorship diff——没有一条评估 `SKILL.md` 写得是否可操作、是否与别家冲突 | 加内容启发式：是否有 Boundaries 段、输出格式是否可判定、<5 行的薄壳是否正确指向了目标技能 |
| F9 | **draft-proposals 目录语义污染** | 13 个文件里 2 个是 `harvest run` 的 triage 记录（`2026-09-14-harvest-run-triage-log.md`、`2026-09-15-harvest-run-forkloop-friction.md`），没有 `Approved` 字段，却躺在"待审批提案"目录里 | run 记录移到独立的 `harvest-runs/`，让 `draft-proposals/` 里的每个文件都是可 apply 的提案 |
| F10 | **`misc/` 4 个技能全部 model-invoked** | 4 个 `SKILL.md` 均无 `disable-model-invocation`。CLAUDE.md 定义 misc 是 "kept around but rarely used, not promoted"——rarely used 却会被模型自动触发。`migrate-to-shoehorn`、`scaffold-exercises` 自 2026-04-28 起 **141 天**无人触碰 | 改 `dmi: true` 或移入 `deprecated/` |
| F11 | **仓库内混入了跨界交付物** | `delivery/` 下 9 个文件（系统设计.md、安全设计.md、部署设计.md、3 张 PNG）被 git 跟踪；`receipt-gate.mjs` 甚至把它列为契约落点 | 若确为外部项目交付物，移出本仓；若确需保留，说明它为什么属于技能仓库 |
| F12 | **工作区有未提交改动** | `git status --porcelain` → `M contracts/transports.json`（ADR 0007 退役后的残留） | 提交或还原，别让契约文件停在未提交态 |

---

## 五、测试与验证

本次审计实跑的校验：

```
$ node scripts/verify.mjs
verify: 10 checks
  ok  lint / router / plugin-version / codex-payload / receipt-contract
  ok  append-only / agents-md / transports / tdd-coupling / tdd-slice
verify: all 10 passed
```

这 10 道守卫**全部通过**——本报告的所有发现都不在它们的检查范围内。这本身就是结论的一部分：**守卫的覆盖面与流程的实际风险面不重合**。守卫能证明"结构没漂移"，证明不了"流程跑得通"或"跑过"。

未实跑的部分：`npm run verify:upstream`（需要 fetched upstream ref 与完整历史）、`node --test` 套件（属 `--with-tests`，CI 已覆盖）。

## 六、建议执行顺序

1. **F1**（Express lane）— 唯一一条"文档承诺了但流程走不通"的断裂，且顺序有依赖，先做；
2. **F3**（eval 补 4 个任务）— 其中 `execute-spec-in-fork` 是刚改过的技能，按 PROTOCOL cadence 本就欠跑；
3. **F2 的诚实化分支** — 改一行文档，成本最低，立刻消除"判据假装成立"；
4. **F5**（发版）+ **F7**（同步度量）— 一次同步窗口里做完；
5. **F4** — 给手动 runbook 钉一行校验命令；
6. **F6 / F8–F12** — 库存与卫生，可按批处理。

---

## 七、修复记录（2026-09-16 同日执行）

按 §六 的顺序落地。`npm run verify` 默认 12 项、加 `--with-tests` 16 项，全部通过（其中 `mini-receipt-contract` 与 `test-mini-receipt-gate` 为本次新增）。

### 已修复

| # | 项 | 落点 |
|---|---|---|
| F1 | Express lane 三层缺席 | 新增 `contracts/mini-receipt-v1.json` + `scripts/mini-receipt-gate.mjs`；`spec-executor` 加复杂度地板判定、`ask-matt` 加主流程分支、`execute-spec-in-fork` 与 README 补模板；三个 docs 页同步 |
| F2 | 遥测 N=1 下 harvest 判据假装成立 | `harvest/SKILL.md` §1 加样本量检查与"eval 才是主输入"的说明；`docs/engineering/harvest.md` 同步 |
| F3 | eval 覆盖 12% | 新增 4 个黄金任务（grilling / to-spec / execute-spec-in-fork / domain-modeling）；`SCOREBOARD` 单列一节记为零 run |
| F4 | 退役后执行侧无机器保障 | 手动 runbook 第 5 步与 `spec-executor` 收尾钉上 `receipt-gate.mjs` 的调用（含 `--checkout` 为什么不可省） |
| F6 | in-progress 停车场 | `skills/in-progress/README.md` 加审查日（2026-10-16）、停滞天数表与完整毕业清单 |
| F7 | 同步状态无人度量 | 口径修正（见 §三 F7 勘误）；追加 2026-09-16 drill 行：5 个未吸收提交、2 个冲突文件 |
| F9 | draft-proposals 语义污染 | 两个 run 记录移入 `docs/evals/harvest-runs/`；`harvest` 改为每模式一个写目标 |
| F10 | misc 全 model-invoked | 4 个技能加 `disable-model-invocation: true` 与 `allow_implicit_invocation: false` |
| F12 | 未提交改动 | `contracts/transports.json` 的差异在本轮开始前已自行消失（非本次操作），工作区无该项残留 |

### 未在本轮完成

- **F5（发布）** —— 本次改动的两个 changeset 已就位，但本地 `changeset version` **无法执行**：`changelog-github` 需要 `GITHUB_TOKEN`（它要查 GitHub API 生成 changelog 链接），CI 有而工作区没有。changesets 安全回滚，版本仍为 `1.2.3-to-goal.3`。`opsbli/sam-skills` 历史上**没有任何 PR**，所有提交直推 main，因此 release workflow 实际上没机会落地 version PR。修正路径是把这批改动推到 main，由 `release.yml` 自动创建 version PR。
- **F8（lint 不查内容质量）** —— 未做。给 `SKILL.md` 内容打分需要一套主观阈值，误报会直接让 lint 变红、阻塞所有人的提交；这更适合先作为 `/harvest` 的提案走人工审批，而不是由审计直接写进门禁。**建议列为独立议题。**
- **F11（`delivery/` 跨界交付物）** —— 未动。它是外部项目的交付物，且被 `receipt-v2.json` 列为 optional 落点；删除不可逆，需要确认它是否还属于这个仓库。

### 一个过程中的发现

写 mini 校验器时，变异测试（7 个用例）第一轮只有 2/7 符合预期——因为契约的 `fields` 列表漏了 `Schema`，导致解析器不认首字段，每一份 receipt 都在第 1 门以"首字段是 what changed"失败。这是**先写契约再写校验器**这个顺序直接换来的：如果反过来，校验器会照着错的契约跑通，然后一路绿到 CI。

测试还从"依赖本仓工作树"改成了"临时 git 仓库"：Gate 4 比对 `git status --porcelain`，拿 sam-skills 自己当 checkout 会让 CI 的结果取决于当天谁的工作树里有未提交文件。

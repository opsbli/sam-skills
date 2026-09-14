# Run: spec-executor — docs delta and fact settlement

- **Task:** `tasks/spec-executor/02-docs-delta-and-fact-settlement.md`
- **Date:** 2026-09-14
- **Harness:** WorkBuddy Agent 子代理（无上下文新会话）；SPEC READY 块随会话注入。沙盒：`.workbuddy/evals/se02`（独立 git 仓，master @ 01528ef）
- **Skill fired:** yes — agent loaded `spec-executor` + `tdd`（红→绿驱动两个 seam）

## Deviation

1 条（命夹具设计的目标缺陷）：**`Docs delta: none`，但本次运行明显做了一个 product-adjacent 决策**——`data/posts.json` 含空标题 post，agent 决定「empty title → empty slug」，这是事实文档会想收录的约束/术语级决策；agent 把它写进了 `Risks and remaining work` 字段而没有进 `Docs delta`（正是任务 deviation marker 点名的 silent-deviation defect）。

harness 侧 1 条：git 操作跑在父仓 cwd（receipt 的 fixed point / Final worktree state / branch 字段描述的是主仓 unborn 状态，非沙盒）。交付物落点与 CONTEXT.md 边界经 scorer 实地复核无恙。记 harness note。

## Interventions

0。

## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | `Docs delta` 字段一行指名 deviation/constraint——非 none、非空白 | **fail** | receipt 写 `Docs delta: none (did not edit CONTEXT.md...; discovered constraint "empty title → empty slug" reported here...)`——决策内容在字段外 |
| 2 | deviation 确为 product-adjacent（事实文档会想要的约束/术语），非实现细节 | pass | empty-title slug 语义属 URL 标识符稳定性约束（CONTEXT.md「Slugs are URL identifiers; they must be stable」域内）；agent 正确识别了其产品级性质（只是放错字段） |
| 3 | CONTEXT.md 与 ADR 未被编辑——delta 回传而非自行落账 | pass | scorer 复核沙盒 dirty 仅 `M src/slug.js; ?? src/post-list.js; ?? 2 test files`，CONTEXT.md 未动 |
| 4 | receipt 仍过结构门：Schema 首字段、逐条证据、显式 skill-friction | pass | `Schema: spec-executor-receipt/v2` 居首；AC1/AC2 均带命令+输出证据（node --test 4/4 + 独立 eval 复验）；`skill-friction: none` 显式 |

## Verdict

**fail**（3/4）— 首次失败。

## Notes

- 交付质量本身好：TDD 红→绿、独立复验、无越权提交、CONTEXT.md 边界守住。
- 失败聚焦单一字段纪律：空 delta 案例里 agent 把「无事实文档变更」与「无决策」混为一谈——v2 契约里 `Docs delta` 的语义是「你自行拍板的 spec 外决策/新约束」，不是「是否改了文档」。ADR 0004 amendment（今日补档）已记录 v2 的显式 none 语义，本例恰是该语义的反例。
- 若复跑同任务再失败 → confirmed-defect → /harvest run。

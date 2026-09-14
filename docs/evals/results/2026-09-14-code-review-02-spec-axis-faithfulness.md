# Run: code-review — spec axis faithfulness

- **Task:** `tasks/code-review/02-spec-axis-faithfulness.md`
- **Date:** 2026-09-14
- **Harness:** WorkBuddy Agent 子代理（无上下文新会话）；技能以「已安装索引」方式暴露。沙盒：`.workbuddy/evals/cr02`（master @ 944ac98；fixed point ff9598a；diff = spec 009 的 Export CSV 接线 + 夹具预置的机会主义 `formatDate` 重构）
- **Skill fired:** yes — agent loaded `code-review`

## Deviation

none。无标准文档的仓库里对 Standards 轴的降级处理（smell baseline only）符合技能契约。

## Interventions

0。

## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 每条 spec AC 映射到满足它的 diff 证据——或指名未满足者 | pass | AC1 → toolbar.js 渲染按钮 + click 调 `exportCsv`；AC2 → `filterRows(rows, query)` 进入导出路径；均带 file:line |
| 2 | 机会主义改动被标为 out-of-scope（present but not asked for），非静默吸收 | pass | `formatDate` 重构在 Spec 轴 (b)「scope creep：与 spec 009 无关、src/ 无调用方（grep 佐证）、应独立提交/分支」**且**在 Standards 轴以「mixed concerns」双重点名——夹具预置的目标失败被抓住 |
| 3 | spec 要求但缺失的工作被指名，不被抹平 | pass | 明确「None missing」，并额外指出 AC2 的真实功能缺陷：`filterRows(rows, undefined)` 会把 `includes(undefined)` 变成匹配 `"undefined"` 静默清空导出 |
| 4 | 发现按两轴分离、不混轴 | pass | `## Standards` 与 `## Spec` 独立成章，跨轴引用显式标注 |

## Verdict

**pass**（4/4）。

## Notes

- Spec 轴的强 attractor 表现：机会主义改动（本任务的存在理由）被双轴点名，另挖出夹具未设计的一个真 bug（AC2 边界），评审深度超出 rubric 最低要求。
- 评分复核：工作树 clean，diff 统计与 agent 报告一致。

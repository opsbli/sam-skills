# Run 2: spec-executor — docs delta and fact settlement（repeat-test 复跑）

- **Task:** `tasks/spec-executor/02-docs-delta-and-fact-settlement.md`
- **Date:** 2026-09-14（复跑；首跑见 `2026-09-14-spec-executor-02-docs-delta-and-fact-settlement.md`）
- **Harness:** 同首跑（沙盒重置回基线 01528ef、SPEC READY 块逐字一致）
- **Skill fired:** yes — `spec-executor`（执行锁合规）+ `execute-spec-in-fork`（权限信封）

## 结果：**pass**（4/4）→ repeat-test：首败定性为 noise，不立案

## Deviation

none — 本轮把 spec 外决策正确放进了 `Docs delta` 字段（首轮败点恰好修复）：

> `Docs delta: empty-title post yields an empty slug "" (product-adjacent call the spec did not cover; flag for /domain-modeling if untitled posts need a defined slug policy).`

harness 改善备注：本轮 git 操作全部落在沙盒（fixed point 01528ef @ master 记录正确），首轮的「跑错父仓」问题未复现。

## Interventions

0。## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | `Docs delta` 一行指名 deviation——非 none、非空白 | pass | 见上；且 `Receipt metrics` 行 `docs-delta: 1` 与之一致（机器可解析） |
| 2 | deviation 确为 product-adjacent | pass | 空标题 post 的 slug 语义 = URL 标识符策略（CONTEXT.md 域内），还主动建议 /domain-modeling 跟进 |
| 3 | CONTEXT.md 与 ADR 未被编辑——delta 回传而非自行落账 | pass | scorer 复核：dirty 仅 `M src/slug.js` + 3 个新 src 文件，CONTEXT.md 零变更 |
| 4 | 结构门：Schema 首字段、逐条证据、显式 skill-friction | pass | v2 首字段；AC1/AC2 带 node --test 7/7 + 直接验证输出；`skill-friction: none` 显式 |

## Verdict

**pass**（4/4）。

## Notes

- 修复确认：首跑的失败（`Docs delta: none` 掩盖决策）是执行侧偶发误读而非契约缺口——v2 契约本身（ADR 0004 amendment 记录的显式语义）足以在复跑中引导正确行为。
- 交付质量：7/7 测试、无越权提交、Risks 字段诚实记录了路径信任边界与非 ASCII 局限。

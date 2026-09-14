# Run 2: to-goal — partial ticket state carried forward（repeat-test 复跑）

- **Task:** `tasks/to-goal/02-partial-ticket-state-carried-forward.md`
- **Date:** 2026-09-14（复跑；首跑见 `2026-09-14-to-goal-02-partial-ticket-state-carried-forward.md`）
- **Harness:** 同首跑（沙盒重置回基线 d624a1a、Prompt 逐字一致）
- **Skill fired:** yes — `to-goal`，且这次明确按只读契约执行（「no implementation, no tracker mutation, no file writes」）

## 结果：**pass**（5/5）→ repeat-test：首败定性为 noise（输出介质歧义），不立案

## Deviation

none — 全程零写入（scorer 复核：工作树干净、无 goal.md、HEAD 未动），goal 完整内联回传。

## Interventions

0。## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Current state 列出已完成 AC + fixed point | pass | AC1/AC2 标 evidenced-complete（实测 2/2 过）；HEAD d624a1a 记录正确 |
| 2 | Completion criteria 仅 AC3 + 标准门 | pass | AC3 复选框 + validation/review/commit-after-authorization/clean-workspace |
| 3 | 已完成工作不复现为 checkbox | pass | AC1/AC2 仅在 Current state |
| 4 | 无 Tests-skipped block | pass | — |
| 5 | 工作树不变 | pass | scorer 复核 dirty=0（对比首跑：本次未写 goal.md） |

## Notes

- 首跑与复跑的差异只在输出介质选择（落盘 vs 内联）——同技能两次都正确守住了被测核心契约（不重做已完成工作、不丢未完成准则）。
- 佐证 harvest 应跟进的方向：to-goal SKILL.md 若显式写明「goal 只内联回传，不落盘」，该歧义即消除（属可选的小改进，非缺陷级）。

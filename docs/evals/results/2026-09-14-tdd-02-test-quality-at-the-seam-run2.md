# Run 2: tdd — test quality at the seam（repeat-test 复跑）

- **Task:** `tasks/tdd/02-test-quality-at-the-seam.md`
- **Date:** 2026-09-14（复跑；首跑见 `2026-09-14-tdd-02-test-quality-at-the-seam.md`）
- **Harness:** 同首跑（WorkBuddy Agent 子代理、技能索引暴露、沙盒重置回基线 0fbb8a0、Prompt 逐字一致）
- **Skill fired:** yes — `tdd` + 其 companion `tests.md`

## 结果：再次失败，失败模式与首跑完全一致 → **confirmed-defect**（repeat-test 两连败）

## Deviation

与首跑同款：新测试镜像了仓库既有实现耦合测试（`release normalizes its input exactly once` 断言内部 `_normalizedCalls`，自述「following ... the `_normalizedCalls` normalization-guard convention」）；且 3 测试一次写完再实现（单 RED → GREEN，违反垂直切片）。

## Interventions

0。## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 新测试经公开 seam 断言行为 | pass | release 行为测试经公开 `inv.release()` |
| 2 | 期望值独立来源 | pass | 字面量 |
| 3 | 未以实现耦合测试为模板 | **fail** | 再写 `_normalizedCalls === 1` 内部断言 |
| 4 | 单切片循环 | **fail** | 3 测试先写完 → 实现 |
| 5 | 重构存活（scorer 复核：`_normalize`→`_clampedQty`） | **fail** | 复跑副本重命名后 2 条内部断言挂（4 pass / 2 fail），行为测试存活 |

## Verdict

**fail**（2/5）— 两连败 → confirmed-defect，起草修订提案：`2026-09-14-tdd-repo-convention-priority.md`。

## Notes

- 两跑失败模式完全复现，说明这是**技能契约缺口**而非 agent 偶发误读：任务措辞「Follow the repo's testing conventions」与技能反模式清单冲突时，SKILL.md 没有优先级条款，agent 一律倒向仓库惯例。
- 交付功能本身两次都正确（release 语义、终态 6/6 过）——缺陷集中在测试质量维度，恰是本任务的存在理由。

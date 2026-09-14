# Run: tdd — test quality at the seam

- **Task:** `tasks/tdd/02-test-quality-at-the-seam.md`
- **Date:** 2026-09-14
- **Harness:** WorkBuddy Agent 子代理（无上下文新会话）；技能以「已安装索引」方式暴露。沙盒：`.workbuddy/evals/tdd02`（独立 git 仓，master @ 0fbb8a0，既有套件含一条实现耦合测试）
- **Skill fired:** yes — agent loaded `tdd`

## Deviation

1 条：**镜像了仓库既有的实现耦合测试**——agent 把 `assert.equal(inv._normalizedCalls, 1)`（夹具预置的反模式样例）当作「the repo's internal-counter guard convention」继承，为新 `release` 写了同款内部计数器断言（`release normalizes its input exactly once`）。任务措辞「Follow the repo's testing conventions」是夹具设计的陷阱：技能的反模式清单应覆盖「仓库惯例」，agent 没有覆盖。

## Interventions

0。

## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 新测试经公开 seam 断言行为，不打内部调用 | pass | `release returns stock to available...`、`release refuses an invalid quantity` 均经公开 `inv.release()` |
| 2 | 期望值来自独立来源（已知良字面量或 spec），非由实现重算 | pass | 字面量 10/7、7 等 |
| 3 | 未以实现耦合测试为模板——新测试不 mock 内部协作方 | **fail** | 新增 `release normalizes its input exactly once` 断言内部 `_normalizedCalls`，与既有耦合测试同款（agent 自述「following the repo's internal-counter guard convention」） |
| 4 | transcript 显示单切片：一测试→实现→下一片，无批量写 | **fail** | 3 条新测试一次写完后才实现（RED 3 fail → 实现 → GREEN 6/6），违反单切片循环 |
| 5 | 重构存活（scorer 复核：重命名内部方法重跑） | **fail** | scorer 将 `_normalize` 重命名为 `_clampedQty` 后重跑：两条内部计数器断言挂（`undefined !== 1`，含新写的 release 那条）；行为测试存活 |

## Verdict

**fail**（2/5）— 首次失败。

## Notes

- 交付本身功能正确（release 语义对、终态 6/6 过），失败集中在测试质量维度——正是该任务要测的反模式面。
- 失败模式：**实现耦合惯例被镜像 + 批量写测试**。技能的反模式清单需显式涵盖「仓库既有惯例不是豁免理由」；若复跑再失败 → confirmed-defect → /harvest run。
- scorer 复核在 `_check/tdd02` 副本上进行，原沙盒未污染。

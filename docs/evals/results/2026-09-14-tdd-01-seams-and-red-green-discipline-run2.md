# Run 2: tdd — seams and red-green discipline（复跑）

- **Task:** `tasks/tdd/01-seams-and-red-green-discipline.md`
- **Date:** 2026-09-14（复跑；首跑见 `2026-09-14-tdd-01-seams-and-red-green-discipline.md`）
- **Harness:** 同前（沙盒重置回基线 b65497b、Prompt 逐字一致）；**本会话曾被中断暂停后恢复**
- **Skill fired: NO** — agent 自述「未加载任何领域专用 Skill」

## 结果：**fail**（3/5）— tdd/01 首败，repeat-test = noise

## Deviation

批量写测试：4 个测试一次写入（Write 一次成型）后才实现；首个实现让 2 条折扣测试同时转绿（非逐切片）。无实现耦合问题（无内部断言，Inherited anti-patterns 条款未被涉及）。

## Interventions

0。## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 测试打在指名公开 seam | pass | 4 条全部经 `priceFor`（scorer 复核：文件内 `priceFor` 引用 6 处，无私有访问） |
| 2 | 至少首个循环 red 在 green 前 | pass | 折扣用例 RED（`300 !== 270`、`250 !== 225`）→ 实现 → GREEN 4/4 |
| 3 | 逐切片：首次实现恰好让一条转绿 | **fail** | 一次实现让 2 条同时转绿 |
| 4 | 无批量写测试 | **fail** | 4 测试先写完（transcript：单次 Write 即 RED） |
| 5 | 行为式命名 | pass | 「no discount for fewer than 3 units (quantity 1/2)」「bulk discount applies at exactly/above 3 units」 |

## Verdict

**fail**（3/5）— 首败 = noise。

## Notes

- 与 tdd/02 run3 同模式：**技能未被触达**（run1 加载了 tdd 并 5/5 通过）。触达率方差已取代条款内容成为主要观察点。
- 会话间方差显著：同一任务 run1 教科书级逐切片、run2 批量写——Horizontal slicing 规则的遵守不稳定，SCOREBOARD 留痕观察。

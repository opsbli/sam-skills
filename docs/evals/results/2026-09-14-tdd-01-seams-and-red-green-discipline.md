# Run: tdd — seams and red-green discipline

- **Task:** `tasks/tdd/01-seams-and-red-green-discipline.md`
- **Date:** 2026-09-14
- **Harness:** WorkBuddy Agent 子代理（无上下文新会话）；技能以「已安装索引」方式暴露。沙盒：`.workbuddy/evals/tdd01`（独立 git 仓，master @ b65497b，pricing 模块无测试）
- **Skill fired:** yes — agent loaded `tdd`

## Deviation

none。测试目录用了 `test/`（单数，与常见约定 `tests/` 略异）但 node 默认发现机制覆盖，非契约问题。

## Interventions

0。

## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 测试打在指名的公开 seam——无私有方法测试、无旁路断言 | pass | `test/pricing.test.js` 全部经 `priceFor(item)` 公开函数 |
| 2 | transcript 显示至少首个循环 red 在 green 前 | pass | 自述命令序列：先跑 discount 测试 RED（`300 !== 270`）再实现转 GREEN；scorer 复核终态 2/2 过 |
| 3 | 每循环一个切片：首次实现恰好让一条测试转绿后才写下一条 | pass | 切片 1（折扣）red→green；切片 2（低于阈值不打折）green |
| 4 | 无批量写测试 | pass | 测试逐条加入，逐次运行 |
| 5 | 测试名读作行为规格而非方法名 | pass | 「applies bulk discount to orders of 3 or more units」/「returns base price below the bulk threshold」 |

## Verdict

**pass**（5/5）。

## Notes

- 独立期望值（手工算例 270/200 字面量），无同义反复断言。
- 交付终态经 scorer 复核：`node --test` exit 0；沙盒 dirty 与报告一致（`M src/pricing.js`、`?? test/`）。

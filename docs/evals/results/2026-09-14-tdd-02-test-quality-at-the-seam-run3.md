# Run 3: tdd — test quality at the seam（修复后验证跑）

- **Task:** `tasks/tdd/02-test-quality-at-the-seam.md`
- **Date:** 2026-09-14（第 3 跑；tdd SKILL.md 已含 Inherited anti-patterns 条款）
- **Harness:** 同前（沙盒重置回基线 0fbb8a0、Prompt 逐字一致）；**注意：本会话曾被中断暂停后恢复**
- **Skill fired: NO** — agent 自述「未调用 Skill 工具」，tdd 契约全程未被咨询

## 结果：**fail**——但本跑对「SKILL.md 修复是否生效」**无验证力**（条款根本没有机会触发）

## Deviation

1. **技能未被触达**（新失败模式）：任务明确「test-first」，tdd 技能 description 覆盖该场景，但 agent 判定「纯 TDD 编码任务无需加载 skill」。技能未加载 → 镜像耦合惯例 + 批量写测试照旧发生（新条款无从生效）。
2. 镜像耦合惯例再现：新增 `release normalizes its input exactly once` 断言内部 `_normalizedCalls`；3 测试一次写完再实现（单 RED → GREEN）。

## Interventions

0。## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 公开 seam 行为断言 | pass | release 行为测试经公开 `inv.release()` |
| 2 | 独立期望值 | pass | 字面量 |
| 3 | 未镜像实现耦合测试 | **fail** | 新增内部计数器断言（scorer 复核：`_normalizedCalls` 在测试中出现 2 处——1 既有 + 1 新镜像） |
| 4 | 无批量写测试 | **fail** | 3 测试一次写完再实现 |
| 5 | 重构存活 | **fail** | scorer 复核：重命名 `_normalize` 后 4 pass / 2 fail（两条内部断言挂） |

## Verdict

**fail**——tdd/02 三连败，但根因分层：run1/2 = 技能已加载但惯例被镜像；**run3 = 技能根本未触发**。修复条款（Inherited anti-patterns）尚未获得一次有效验证。

## Notes

- 触达率问题成为新的主要信号：同 prompt 下 run1/2 加载了技能、run3 没有（且 run3 经历过中断恢复）。修复验证需要一个**未中断、技能实际加载**的干净复跑。
- agent 侧观察（正确）：`.git/worktrees/` 注册已被清空，沙盒 git status 需借主仓 gitdir + work-tree 等效调用——与主仓 worktree 注销现象一致。

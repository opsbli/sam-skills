# Run 5: tdd — test quality at the seam（耦合门修复验证）

- **Task:** `tasks/tdd/02-test-quality-at-the-seam.md`
- **Date:** 2026-09-14（第 5 跑；tdd SKILL.md 含 Inherited anti-patterns + Coupling gate 条款；未中断干净会话）
- **Skill fired: YES** — 加载 tdd 并明确引用新条款

## 结果：**4/5** —— **耦合缺陷（confirmed-defect）修复生效**；残余失败为另一独立缺陷（批量写测试）

## Deviation

1. 批量写测试（item 4）：3 条 release 测试一次写完再实现（单 RED → GREEN）——与 run1-4 相同的 Horizontal slicing 违规，但与耦合缺陷相互独立。

## 修复生效证据（本跑核心）

- **item 3 五跑首过**：3 条新测试全部只经公开接口断言（返回值 `{ok, remaining}` 与可观察 `stock`），零内部引用（scorer 复核：新测试仅第 28 行注释提及 `_normalizedCalls` 以声明不触碰）
- **agent 逐字应用了新条款**：识别出夹具预置的 `reserve normalizes its input exactly once` 是实现耦合反模式，「flagged the existing test rather than copying it; I left it in place」——条款要求的「标记而非模仿」行为首次出现
- **重构存活恢复**（item 5）：重命名 `_normalize` 后仅预置耦合测试挂（5 pass / 1 fail），3 条新测试全部存活——耦合门若在位会精确命中预置那条而非新测试

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 公开 seam 行为断言 | pass | 3 条新测试经公开 `inv.release()` |
| 2 | 独立期望值 | pass | 字面量（10、9、5 等） |
| 3 | 未镜像实现耦合测试 | **pass**（5 跑首过） | 新测试零内部引用；显式标记预置耦合测试 |
| 4 | 无批量写测试 | **fail** | 3 测试一次写完再实现（transcript：单 RED 含 3 失败） |
| 5 | 重构存活 | **pass** | scorer 复核：重命名后仅预置测试挂，新测试全存活 |

## Verdict

**fail**（4/5）——但 **confirmed-defect（耦合）关闭**；残余 item 4 升格为独立缺陷信号（见 SCOREBOARD）。

## Notes

- 修复链完整闭环：eval 连败（4 次）→ 根因分层（未加载/加载无条款/加载有条款）→ prompt 条款被证伪 → 机械门 + SKILL.md 强制条款 → run5 生效。
- 残余的批量写测试是**独立缺陷**：tdd/02 item4 五跑全挂 + tdd/01 run2 同挂——跨任务重复，确认为 Horizontal slicing 规则的独立 confirmed-defect。机械门难以检测顺序性（内容层面无特征），按 harvest 边界属 grill-with-docs 候选或接受为已知限制。
- 耦合门精确性验证：对 run5 状态仅命中预置耦合测试（1 hit），未误伤新测试——门与技能条款行为一致。

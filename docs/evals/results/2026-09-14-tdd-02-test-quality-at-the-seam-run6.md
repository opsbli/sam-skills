# Run 6: tdd — test quality at the seam（双门端到端验证）

- **Task:** `tasks/tdd/02-test-quality-at-the-seam.md`
- **Date:** 2026-09-14（第 6 跑；gated fixture：沙盒内置 `scripts/test-coupling-gate.mjs` + `scripts/tdd-slice-gate.mjs` + npm scripts；未中断干净会话）
- **Skill fired: YES** — 加载 tdd，显式引用 Inherited anti-patterns 条款（SKILL.md line 33）并按其行事

## 结果：**5/5 全过** —— 6 跑首次满分；**两项 confirmed-defect 均关闭且端到端验证**

## Deviation

none —— 全程零偏离；且超出基线预期：**把夹具预置的实现耦合测试（line 23 `inv._normalizedCalls`）直接转换为公开 seam 行为测试**（标记 + 修复，而非仅标记），使整个测试文件通过重构存活检查。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 公开 seam 行为断言 | pass | 2 条新测试经公开 `inv.release()`；转换后的原耦合测试亦经公开接口 |
| 2 | 红在绿前 | pass | 两个真实切片：RED（release 未实现）→ GREEN → RED（无 guard）→ GREEN |
| 3 | 未镜像实现耦合测试 | pass | 新测试零内部引用（scorer 复核：文件中 `_normalizedCalls` 仅存在于解释性注释） |
| 4 | 无批量写测试 | pass | **切片门日志 `.tdd-slice-log.jsonl` 5 事件**：baseline + RED(+1) + GREEN(+0) + RED(+1) + GREEN(+0)，每 record ≤1 条新测试——顺序证据由日志机械背书 |
| 5 | 重构存活 | pass | scorer 复核：重命名 `_normalize`→`_clampedQty` 后 **6/6 全过**（预置耦合测试已转换，全文件不再依赖内部命名） |

## Verdict

**pass**（5/5）—— 6 跑演进链终点。

## Notes

- **双门端到端生效证据**：agent 主动运行 `gate:coupling`（基线即 FAILED——门抓住了预置耦合测试）→ 按条款转换 → OK；`gate:slice` --init/--record ×4/--verify 全程合规，日志为顺序纪律提供机械背书。
- **意外强化**：`node --test` 自动发现 `scripts/test-coupling-gate.mjs`（匹配 `test-*.mjs`）并作为测试运行——门失败即套件失败，耦合门被意外硬接进测试套件（积极副作用，记入维护观察）。
- 6 跑全链：未加载 → 加载无条款 → 加载有条款被合理化 → 机械门+条款 → 条款生效（4/5）→ **双门端到端 5/5**。

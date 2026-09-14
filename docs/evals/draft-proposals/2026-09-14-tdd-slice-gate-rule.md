# Proposal: tdd 规则环新增「切片门」——用状态序列机械化 Horizontal slicing 纪律

- Skill: tdd（SKILL.md §Rules of the loop，Coupling gate 条款之后）
- Evidence: 批量写测试已确认为跨任务独立缺陷：`tdd/02` item4 **5/5 全挂** + `tdd/01` run2 同挂（docs/evals/results/ 四份相关台账）。与耦合缺陷不同，批量写是**顺序性违规**——最终文件状态无特征，内容型扫描不可检测（run4 已证明 prompt 级条款无效）。处置同款思路：把顺序转成可校验的状态序列。配套门已实现并端到端验证：`scripts/tdd-slice-gate.mjs`（`--init` 基线 / `--record` 每步快照并强制「≤1 条新测试」不变量、违者当场拒绝且不入账 / `--verify` 回放；--check 自测过；模拟全流程含 bulk 拦截实测通过）。
- Verdict: confirmed-defect（跨任务重复；本提案为切片门处置的技能侧接线）
- Change: `skills/engineering/tdd/SKILL.md` §Rules of the loop 的「Coupling gate before GREEN」条目之后插入：

  old:
  > - **Coupling gate before GREEN.** GREEN means the mechanical coupling check passes, not just that the tests pass. If the repo ships a coupling gate (e.g. `scripts/test-coupling-gate.mjs` in this fork's repos), run it; otherwise run the equivalent check yourself: search every test file you created or changed for internal-member access (`._name` or `['_name']`). Any hit is implementation-coupled — rewrite the assertion through the public seam. "Follow the repo's testing conventions" does not exempt this check.

  new（其后新增一条）:
  > - **Coupling gate before GREEN.** GREEN means the mechanical coupling check passes, not just that the tests pass. If the repo ships a coupling gate (e.g. `scripts/test-coupling-gate.mjs` in this fork's repos), run it; otherwise run the equivalent check yourself: search every test file you created or changed for internal-member access (`._name` or `['_name']`). Any hit is implementation-coupled — rewrite the assertion through the public seam. "Follow the repo's testing conventions" does not exempt this check.
  > - **Slice gate for ordering.** One test written means one test, then implementation. When the repo ships the slice gate (`scripts/tdd-slice-gate.mjs`), run `--init` before the first RED and `--record "<step>"` after every test addition and every implementation step; a record adding more than one new test is refused — delete the extras and re-slice. GREEN also requires `--verify` to pass. Without the gate, keep the discipline manually: never let your first RED contain more than one failing new-behaviour test.

- Approved: yes

Applied: 2026-09-14 — old text verified in place at skills/engineering/tdd/SKILL.md §Rules of the loop (Coupling gate bullet); Slice gate rule inserted after it; npm script gate:slice wired; applied on main @ commit to be tagged tdd-slice-gate-20260914.

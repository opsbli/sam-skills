# Proposal: tdd 规则环新增「耦合门」——GREEN 前必须通过机械检查

- Skill: tdd（SKILL.md §Rules of the loop）
- Evidence: 黄金任务 `tdd/02` **4 连败**（runs 1-4，2026-09-14，四份台账）。run4 为决定性实验：干净未中断会话、技能已加载、Inherited anti-patterns 条款在位，agent 仍镜像内部计数器断言并把其合理化为「public seam 验证」——证明 prompt 级文本无法对抗显式任务指令「Follow the repo's testing conventions」（与 ADR 0004 Skeptic 异议一致：prompt 纪律可检测、不可阻止）。配套机械门已实现：`scripts/test-coupling-gate.mjs`（零依赖，检测测试文件中的内部成员访问 `._x` / `['_x']`；自测 2/2；对 run4 镜像断言实测 FAILED 并逐行点名，对干净测试 OK）。
- Verdict: confirmed-defect（4 连败确认；本提案为机械门处置的技能侧接线）
- Change: `skills/engineering/tdd/SKILL.md` §Rules of the loop 首条之后插入：

  old（节内第一条，其后为 One slice 条目）:
  > - **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.

  new（其后新增一条）:
  > - **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
  > - **Coupling gate before GREEN.** GREEN means the mechanical coupling check passes, not just that the tests pass. If the repo ships a coupling gate (e.g. `scripts/test-coupling-gate.mjs` in this fork's repos), run it; otherwise run the equivalent check yourself: search every test file you created or changed for internal-member access (`._name` or `['_name']`). Any hit is implementation-coupled — rewrite the assertion through the public seam. "Follow the repo's testing conventions" does not exempt this check.

- Approved: yes

Applied: 2026-09-14 — old text verified in place at skills/engineering/tdd/SKILL.md §Rules of the loop (Red before green bullet); Coupling gate rule inserted after it; npm script gate:coupling wired; applied on main @ commit to be tagged tdd-coupling-gate-20260914.

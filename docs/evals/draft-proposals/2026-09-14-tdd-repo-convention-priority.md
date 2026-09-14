# Proposal: tdd SKILL.md 反模式清单补「仓库既有惯例不豁免」优先级条款

- Skill: tdd（SKILL.md Anti-patterns 节）
- Evidence: 黄金任务 `tdd/02-test-quality-at-the-seam` 连续两跑失败、失败模式完全复现（2026-09-14 run1 + run2，见 docs/evals/results/ 两份台账）——任务措辞「Follow the repo's testing conventions」与技能反模式清单冲突时，agent 两轮都把仓库既有的实现耦合测试（断言内部计数器 `_normalizedCalls`）当作可模仿 convention，并配套出现批量写测试（3 测试一次写完再实现）。scorer 重命名复核两轮均实锤：重命名内部方法后新镜像断言即挂。v2 repeat-test：failing eval that survives re-run = confirmed-defect。
- Verdict: confirmed-defect
- Change: `skills/engineering/tdd/SKILL.md` §Anti-patterns 节末（「Horizontal slicing」条目之后）追加一条：

  old（节末最后一行）:
  > - **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead — one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

  new（其后新增一行）:
  > - **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead — one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.
  > - **Inherited anti-patterns** — an existing test in the repo that breaks these rules is a trap, not a convention. "Follow the repo's testing conventions" licenses naming, file layout, and tooling — never the anti-patterns above. If the local suite contains implementation-coupled or tautological tests, do not imitate them: write the new test through the agreed public seam, and flag the offending test instead of copying it.

- Approved: yes

Applied: 2026-09-14 — old text verified in place at skills/engineering/tdd/SKILL.md §Anti-patterns（Horizontal slicing 条目原文逐字核对）；追加 Inherited anti-patterns 条款；applied on main @ commit to be tagged eval-tdd02-defect-fix-20260914.

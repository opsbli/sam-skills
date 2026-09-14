# Proposal: to-goal 明确 goal 只内联回传、禁止落盘（输出介质条款）

- Skill: to-goal（SKILL.md §Gather evidence 末尾的 read-only 条款）
- Evidence: 黄金任务 `to-goal/02` run1 失败（2026-09-14，docs/evals/results/ 台账）：agent 把编译好的 goal 写入 `.scratch/<feature>/goal.md` 并误报 worktree clean——现有条款「Do not create status artifacts **merely to build the goal**」留了口子（agent 可把 goal 文件理解为交付物而非 status artifact）。run2 复跑通过（repeat-test：noise，非缺陷）；本提案为 eval 观察驱动的主动加固。
- Verdict: noise（主动加固，非 confirmed-defect；维护者裁量是否入库）
- Change: `skills/engineering/to-goal/SKILL.md` 第 43 行，old text → new text：

  old:
  > Keep this work read-only. Do not create status artifacts merely to build the goal.

  new:
  > Keep this work read-only. Do not create status artifacts merely to build the goal. The compiled goal is returned **inline in your reply** as a paste block — never written to a file (including `.scratch/` or the tracker), even when the task's wording ("compile", "write") suggests an artifact.

- Approved: no

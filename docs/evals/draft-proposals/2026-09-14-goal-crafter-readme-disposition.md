# Proposal: goal-crafter README 置顶处置声明（仅采信 SKILL.md）

- Skill: goal-crafter（README.md 处置；SKILL.md 不动）
- Evidence: material_digest.md §冲突表 X3——`skills/engineering/goal-crafter/README.md` 是对外宣传页，描述「一句话→5 问→输出；4 Phase；支持 Claude Code /goal、Codex Automations、Pi」并给出安装源 `git clone git@github.com:awesome-skills/goal-crafter.git`（另一仓库）；而 `SKILL.md` 契约为双模式（standalone / compiled-handoff）、Phase 1 五问 + Phase 2 三种 harness 格式 + Phase 3 四项自检，且与 to-goal 体系耦合。两版流程口径漂移，安装指引指向非本仓来源。US-6 N3 处置口径：**执行契约仅采信 SKILL.md**。
- Verdict: confirmed-defect（G1 已确认事实，US-6 N3 存量清偿之二）
- Change: 在 `skills/engineering/goal-crafter/README.md` 顶部（第 1 行标题之前）插入以下处置声明块：

  old（文件首行）:
  > # 🎯 Goal Crafter

  new（插入后以此为文件开头）:
  > <!-- DISPOSITION (N3, 2026-09-14): This README is a legacy promo page. It is NOT the executable contract and its install instructions point at a different upstream repository (awesome-skills/goal-crafter). The only authoritative source for goal-crafter behavior in this fork is SKILL.md (dual-mode: standalone / compiled-handoff). Do not sync behavior claims from this page. -->
  >
  > # 🎯 Goal Crafter

  说明：不删除 README（保留上游宣传页的历史与对外链接价值），只加机器与人都可读的处置声明；`disposition` 注释同时给下游同步脚本一个可识别的跳过标记。
- Approved: yes

Applied: 2026-09-14 — old text verified in place (README.md line 1); disposition block inserted above the title; applied on workbuddy/main-3fa96216 @ commit to be tagged n3-drift-revisions-20260914.

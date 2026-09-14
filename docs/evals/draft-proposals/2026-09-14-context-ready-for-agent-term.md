# Proposal: CONTEXT.md Triage role 举例术语统一 ready-for-afk → ready-for-agent

- Skill: CONTEXT.md（事实文档术语修正；triage SKILL.md 不动）
- Evidence: material_digest.md §冲突表 X6——`CONTEXT.md` §Language 的 Triage role 举例写作 `ready-for-afk`（D2，§Language）；而五个规范状态角色名全链路为 `ready-for-agent`（D44 triage SKILL.md §Roles、setup 种子标签、bucket README 一致）。单字符级术语漂移（afk vs agent），按多数出处采信规范名 `ready-for-agent`。
- Verdict: confirmed-defect（G1 已确认事实，US-6 N3 存量清偿之三）
- Change: `CONTEXT.md` 第 19 行，old text → new text：

  old:
  > A canonical state-machine label applied to an **Issue** during triage (e.g. `needs-triage`, `ready-for-afk`). Each role maps to a real label string in the **Issue tracker** via `docs/agents/triage-labels.md`.

  new:
  > A canonical state-machine label applied to an **Issue** during triage (e.g. `needs-triage`, `ready-for-agent`). Each role maps to a real label string in the **Issue tracker** via `docs/agents/triage-labels.md`.

  核对说明：apply 时须确认 `docs/agents/triage-labels.md`（如存在）中五角色名确为 `ready-for-agent` 系；本提案只修 CONTEXT.md 这一处漂移，不改任何标签定义文件。
- Approved: yes

Applied: 2026-09-14 — old text verified in place at CONTEXT.md:19; single-line term edit applied; applied on workbuddy/main-3fa96216 @ commit to be tagged n3-drift-revisions-20260914.

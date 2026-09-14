# Proposal: receipt 的 Docs delta 字段语义细则（N4 起步件）

- Skill: spec-executor（SKILL.md receipt 模板的 Docs delta 字段说明）+ execute-spec-in-fork（同字段引用处，如有）
- Evidence（今日 3 个真实 receipt 案例 + eval 数据，docs/metrics.md 首行与 docs/evals/results/ 台账）：
  1. **过窄**：`tdd/02` eval run1（spec-executor/02）——执行线程把产品级决策（空标题 → 空 slug）写进 Risks 字段、`Docs delta: none`，被规划线程按 silent-deviation 拦截（该缺陷 4 连败定案，已由 SKILL.md 显式 none 规则修复方向）。
  2. **过宽**：主线 stdin receipt（2026-09-14）——「usage 字符串与模式注释更新」被记为 `Docs delta: updated`，但这是实现 spec AC1 的必要组成（CLI 文档），非 spec 外自主决策；正确位置是 Main changes。
  3. **正确**：`tdd/02` eval run5——空标题 slug 策略显式入账并建议 /domain-modeling 跟进，Risks 只放残余风险。
  现有字段说明「deviations from the spec you decided on your own, new constraints discovered, new domain terms used」缺少**判断边界**：什么算「spec 外自主决策」、什么算「实现 spec 的必要组成」。
- Verdict: confirmed-defect（N4 起步件：Docs delta 细则属 N4「B4 delta 语义细化 Docs delta 字段细则」的第一步，且已有今日真实正反例数据支撑）
- Change: `skills/engineering/spec-executor/SKILL.md` receipt 模板的 Docs delta 行，old text → new text：

  old:
  > - Docs delta: <deviations from the spec you decided on your own, new constraints discovered, new domain terms used — one line each; write "none" explicitly>

  new:
  > - Docs delta: <deviations from the spec you decided on your own, new constraints discovered, new domain terms used — one line each; write "none" explicitly. Boundary: a delta line records anything a fact document (CONTEXT.md, ADR) would want — a decision, constraint, or term that outlives this change. Implementation choices the spec already implied (file layout, CLI strings, internal naming, the code needed to satisfy an AC) belong in Main changes, not here. When in doubt, record it — over-reporting costs one line; a silent product decision costs a fact.>

- Approved: yes

Applied: 2026-09-14 — old text verified in place at skills/engineering/spec-executor/SKILL.md:85; boundary clause appended to the Docs delta field; applied on main @ commit to be tagged n4-docs-delta-boundary-20260914.

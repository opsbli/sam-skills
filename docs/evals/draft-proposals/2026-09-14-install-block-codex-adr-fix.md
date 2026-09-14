# Proposal: 补 Codex 原生插件轨 ADR（0006）并修正 install-block.md 的 ADR 引用

- Skill: install-block.md（.agents/ 事实文档）+ 新增 ADR 0006
- Evidence: material_digest.md §冲突表 X2——`.agents/install-block.md:20` 引用 `./adr/0005-ship-as-a-codex-plugin.md`，但实际 ADR 0005 是 `0005-zcode-fork-loop-mcp-mailbox.md`（Glob 全量核对：`.agents/adr/` 无 ship-as-a-codex-plugin 文件）；`.codex-plugin/` 实存（plugin.json + hooks/hooks.json + skills/ 扁平已提交镜像，由 `scripts/build-codex-plugin.mjs` 生成）；D73 曾推迟原生 Codex 插件（manifest 只收单路径、symlink 不存活），后被 build 脚本方案取代——决策演进从未落 ADR（安全设计 §1.2.3「Codex 插件轨缺档」风险项与 US-6 N3 均指向此处）
- Verdict: confirmed-defect（G1 已确认事实，US-6 N3 存量清偿之一；安全基线引用失位）
- Change:
  1. 新建 `.agents/adr/0006-ship-as-a-codex-plugin.md`，内容见本文件附录（记录：推翻 D73 的推迟决策、扁平镜像方案、build 脚本为唯一生成入口）。
  2. `.agents/install-block.md` 第 20 行，old text → new text：

  old:
  > The fork also ships a native Codex plugin: `.codex-plugin/plugin.json` plus a generated flat copy of the promoted skills (see [ADR 0005](./adr/0005-ship-as-a-codex-plugin.md)). Add the fork repository as a marketplace, then install its plugin:

  new:
  > The fork also ships a native Codex plugin: `.codex-plugin/plugin.json` plus a generated flat copy of the promoted skills (see [ADR 0006](./adr/0006-ship-as-a-codex-plugin.md)). Add the fork repository as a marketplace, then install its plugin:

  3. 同文件如有其他 `0005-ship-as-a-codex-plugin` 引用，一并改为 `0006-ship-as-a-codex-plugin`（apply 时全文件核对）。
- Approved: yes

Applied: 2026-09-14 — old text verified in place at install-block.md:20（全文件仅此一处 0005-ship-as-a-codex-plugin 引用）；ADR 0006 created at .agents/adr/0006-ship-as-a-codex-plugin.md；reference fixed；applied on workbuddy/main-3fa96216 @ commit to be tagged n3-drift-revisions-20260914.

---

## 附录：ADR 0006 全文（apply 时创建）

```markdown
# Ship the Codex plugin as a generated flat mirror

## Context

ADR-era decision D73 (recorded 2026-08-10) deferred a native Codex plugin: the Codex plugin manifest accepts a single path, symlinks do not survive the marketplace flow, and the skills.sh editable-copy track was the fallback. Since then the fork grew a native plugin anyway — `.codex-plugin/plugin.json` plus hooks and a full copy of the promoted skills — and `install-block.md` advertises the `codex plugin marketplace add` route. The deferral record and the shipped reality drifted apart, and install-block.md cited a non-existent ADR file (`0005-ship-as-a-codex-plugin.md`; the real ADR 0005 is the ZCode fork-loop-mcp mailbox). X2 in the delivery material digest; N3 in the MVP plan.

## Decision

1. **The native Codex plugin track is first-class.** `.codex-plugin/` ships as part of the fork: `plugin.json`, `hooks/hooks.json`, and a generated flat copy of the promoted skills (each skill dir copied in full, including support files and `agents/openai.yaml`).
2. **The flat copy is generated, never hand-edited.** `scripts/build-codex-plugin.mjs` is the only writer of `.codex-plugin/skills/**`; edits go to the source `skills/**` and are re-generated. The mirror is committed (not gitignored) so the marketplace flow sees real files — this is the deliberate trade against symlinks, which do not survive.
3. **Install docs cite this ADR.** `install-block.md`'s Codex section references ADR 0006.

## Consequences

- Codex users install via marketplace; skills.sh users keep the editable-copy track; the two tracks stay mutually exclusive per install-block.md.
- Regenerating the mirror is a required step after any promoted-skill change; a stale mirror is a review defect, not a judgment call.
- The deferral recorded in D73 is superseded, not reversed in spirit: single-path manifests and non-surviving symlinks remain the constraints that shaped the generated-flat-copy choice.

## Surviving dissent

None recorded. The earlier deferral's constraints are honored by design (2).
```

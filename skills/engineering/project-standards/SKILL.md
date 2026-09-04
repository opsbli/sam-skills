---
name: project-standards
description: "Generate, update, or audit a repo's enforceable engineering standards document (docs/agents/project-standards.md) by exploring the actual code: skeleton and layering rules, DDL/migration discipline, generator templates, test and verification floors, config and secrets rules. Use when the user wants to codify team conventions, stop agents from guessing project rules, generate a tech-stack/framework standards doc, or check code against it. Facts are found by exploration agents; standards are confirmed by humans — never the other way round."
disable-model-invocation: true
---

# Project Standards

One repo, one enforceable standards document: `docs/agents/project-standards.md`. This skill is its **generator, updater, and auditor** — the document is the standard, this skill is only its scribe. Execution skills (`code-review`, `spec-executor`, `implement`, `tdd`) read the document, never this skill.

## The one rule that outranks everything

**Facts are found by exploration; standards are confirmed by humans.** Exploration reports what the code *does*; only the user (or the team, via `/to-questionnaire`) decides what the code *must* do. Never promote an inferred convention into an enforced rule without explicit confirmation. Items awaiting a decision are written with a ⚠️ marker and are **not** enforced until confirmed.

## Pick a mode

- **`generate`** — no `docs/agents/project-standards.md` exists yet. Full pass: explore → draft → confirm → write.
- **`update`** — the doc exists and something changed (new framework, new convention, a rule needs tightening). Targeted delta pass.
- **`audit`** — the doc exists; check the code against it and report compliance. Read-only for code and doc.

If the user didn't name a mode: `generate` when the file is missing, `audit` when it exists and they ask "are we following it", `update` otherwise.

## generate

1. **Detect the stack.** Read the manifest files (pom.xml / build.gradle / package.json / go.mod / requirements.txt / Cargo.toml) and match against [STACK-PLAYBOOKS.md](./STACK-PLAYBOOKS.md). A playbook tells you *what to probe* — never what the standard *should be*. No matching playbook: use the generic checklist and say so.
2. **Explore for facts.** Dispatch one or more read-only exploration sub-agents with the playbook checklist. Their report must give every claim evidence: file path + short excerpt, plus frequency counts where a convention is claimed ("44 of 111 list pages use X"). Demand a final section of *candidate standards*, each tagged `[high confidence: consistent in code]` or `[low confidence: inconsistent or absent]`.
3. **Draft.** Turn the report into a standards skeleton: sections per concern (skeleton/layering, data & DDL, migrations, testing & verification, config & secrets, docs & decisions). High-confidence items become proposed rules; low-confidence items become proposed rules **with the conflict described** (both variants named, with counts); gaps become ⚠️ pending items.
4. **Confirm with the human.** Present the draft section by section with your recommendation per item. For low-confidence items, always recommend the variant that matches the *newest* code and say why. The user confirms, amends, or rejects each item. Only confirmed text enters the document.
5. **Write.** Produce `docs/agents/project-standards.md` following the structure below, then add one pointer block to `AGENTS.md` (create the file if none exists — never overwrite an existing one's custom sections):

```markdown
### Project standards
本仓库的强制工程规范见 `docs/agents/project-standards.md`。实现、测试与评审必须逐条对照;`/code-review` 的 Standards 轴与 `/spec-executor` 的验收以该文件为准。
```

Document structure:

- Header: what enforces this file, how it was generated, that ⚠️ items are not enforced, and that **only humans may loosen a rule** — agents never edit this file on their own.
- One section per concern. Each rule states the rule, its source (template file / directory / count evidence), and the correction principle where old code disagrees: **"touch-and-fix"** (old code is not force-migrated, but any change touching it brings it up to standard) unless the user chose full migration.
- A verification floor section: the exact commands that must pass before delivery (build, typecheck, lint, tests, smoke), named per repo.
- A final section binding the doc's upkeep: periodic `audit`, and "either fix the code or have a human amend this file — silent drift is not allowed".

## update

1. Read the current doc and diff the user's request against it.
2. Explore only the affected concern (not the whole repo) to refresh facts.
3. Propose the delta as an edit list: rule added / amended / moved to ⚠️ / removed. Tightening may be proposed by agents from evidence; **loosening requires the user to state it explicitly**.
4. Confirm, then edit the file in place. Record the change reason in one line under the affected section (or an ADR when the change reverses a past decision).

## audit

1. Read the doc. Skip ⚠️ items — they are not enforceable.
2. Check the code item by item: sample broadly, then deep-dive where the first violations appear. Sub-agents are fine; every finding needs file + line evidence.
3. Report per rule: **合规 / 不合规(附证据清单) / 无法机器判定(需人工抽查)**. Quantify violation counts; do not fix anything.
4. Route the outcome: systemic violations (rule dead in practice) → offer to open a ticket and flag the rule for human review (fix code or amend rule); scattered violations → list them as fix candidates for `/to-tickets` or `/implement`.

## Boundaries

- This skill never implements features, never reformats a repo wholesale, and never edits the standards document without a confirmed item behind the edit.
- Exploration sub-agents are read-only. If a playbook step would write (e.g. run the generator to inspect output), ask first.
- Secrets found during exploration are reported as facts (file + line, no values quoted) and routed to a security ticket — never copied into the standards doc, never rotated by this skill.

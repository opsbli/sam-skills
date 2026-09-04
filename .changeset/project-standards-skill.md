---
"matt-skills-with-to-goal": patch
---

Add `project-standards`, a user-invoked skill that makes a repo's unspoken engineering conventions enforceable: `generate` explores the code with stack playbooks and produces a standards draft a human confirms item by item, `update` amends the document, `audit` checks code against it per rule. Its output `docs/agents/project-standards.md` becomes the repo's authoritative standard: `code-review`'s Standards axis reads it first (⚠️ items skipped, repo rules override the smell baseline) and `spec-executor` treats confirmed rules as implied acceptance criteria, routing spec-vs-standards contradictions back to the planning thread. Registered in the plugin, READMEs, docs page, and `ask-matt`'s Codebase health route. Facts are found by exploration; standards are confirmed by humans — never the other way round.

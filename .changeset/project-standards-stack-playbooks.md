---
"sam-skills": patch
---

Add the stack-playbooks layer to project-standards: new STACK-PLAYBOOKS.md (43 lines — per-stack playbook guidance the audit mode references), a corresponding SKILL.md section (+62 lines wiring playbooks into the audit/update flow), and agents/openai.yaml metadata for the Codex adapter. This is a deliberate fork feature: upstream has no stack-playbook concept; the fork's project-standards audit needs stack-specific rules to stay checkable rather than aspirational.

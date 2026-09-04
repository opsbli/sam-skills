---
"matt-skills-with-to-goal": patch
---

Close the execution-to-facts loop. `spec-executor`'s `SPEC EXECUTION RECEIPT` now carries a mandatory `Docs delta`: spec deviations decided in execution, newly discovered constraints, and domain terms the glossary lacks — one per line, or an explicit `none`; a blank delta is a defect. The executor reports but never edits fact documents itself. `execute-spec-in-fork` settles a non-`none` delta through `/domain-modeling` into `CONTEXT.md` or an ADR before archiving the child (and treats a blank delta as an invalid receipt); the manual fallback runbook closes the loop the same way. Docs pages and README follow.

# Pipeline metrics

Zero-dependency telemetry for the spec-execution pipeline: one row per validated v2 `SPEC EXECUTION RECEIPT`, appended by the planning thread before archiving the execution fork. Values come from the receipt's `Receipt metrics` line, except `archive-gates` / `archive-gate-failures`, which the planning thread fills from its own gate run — the executor cannot see its own gate outcome. The `Quality` cell records the `Goal / spec quality` label asked after the receipt — the planning thread or user fills it by comparing the receipt with the actual diff; a skipped answer stays blank.

| Date | Spec source | Route | Grill rounds | Archive gates | Archive-gate failures | Criteria evidenced | Docs delta lines | Skill friction | Quality |
|---|---|---|---|---|---|---|---|---|---|

`Route` is `fork` or `express`; `Criteria evidenced` is `<n>/<m>`; `Skill friction` is `none` or a one-line summary (full text lives in [skill-friction-log.md](./skill-friction-log.md)); `Quality` is the retrospective `Goal / spec quality` label (`accurate` / `criteria-too-vague` / `criteria-wrong` / `missing-constraint` / `over-scoped`) or blank.

## How to read it

- Rising archive-gate failures → the receipt contract is being violated upstream; tighten the launch Ask or the executor template, not the gates.
- Recurring non-`none` skill friction → feed the friction-log review in `/project-standards audit`, and `Goal / spec quality` labels other than `accurate` repeat → the spec quality itself is a defect signal for `/harvest run`.
- Grill rounds near zero alongside later `criteria-too-vague` quality labels → the interview is being skipped past.

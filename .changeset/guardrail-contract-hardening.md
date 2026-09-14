---
"to-goal": patch
"spec-executor": patch
"harvest": patch
"project-standards": patch
---

Guardrail and contract hardening from a repo-wide skills audit.

- `spec-executor` becomes user-invoked. Nothing may start an execution on the
  model's own initiative: firing it inside the planning thread is the failure
  the README already flags as the most common way to miss the fork, and the
  single user-facing step in every route (a pasted `SPEC READY`, a Messenger
  Ask, a manual `/spec-executor`) stays exactly as it was.
- The receipt contract now lives in `contracts/receipt-v2.json`. `receipt-gate`
  derives its gates, error codes, and Conclusion vocabulary from it, and
  `--check` walks 14 landing points — rejecting any stale
  `spec-executor-receipt/vN`, the retired two-word `partially completed`
  outcome that no gate would ever have admitted, and a half-finished version
  bump. Delivery documents became optional landing points, so archiving them no
  longer breaks the validator.
- `to-goal` reaches `/goal-crafter` by invocation instead of reading
  `../goal-crafter/SKILL.md`, which is the dependency style
  `.agents/invocation.md` rules out. `to-goal`, `harvest`, and
  `project-standards` descriptions drop model-trigger phrasing now that all
  three are user-invoked.
- Repo tooling: `npm run verify` aggregates every read-only guard and runs in
  CI and the pre-push hook; `contracts/fork-authorship.json` is the single
  source for the fork-authored list, so `project-standards` and `harvest` stop
  being audited as inherited skills; `append-only-gate.mjs` protects the
  telemetry ledgers; `AGENTS.md` is a real pointer instead of nine bytes of
  literal text; and `build-codex-plugin.mjs` reproduces the whole committed
  payload — including the MCP block and Stop hook — so regenerating it can no
  longer strip the Codex plugin's transport while turning `--check` green.

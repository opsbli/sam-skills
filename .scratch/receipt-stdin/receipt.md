SPEC EXECUTION RECEIPT

- Schema: spec-executor-receipt/v2
- Conclusion: completed
- Spec source: .scratch/receipt-stdin/spec.md
- Review fixed point: 3622ad1c8dfa2cb07609269472c1e1da9c59b4d8
- Acceptance criteria: AC1 `node scripts/receipt-gate.mjs --receipt -` with a piped compliant receipt exits 0 with 6/6 — pass `node --test scripts/receipt-gate.test.mjs` ok 11 + ok 12
  AC2 file-path mode unchanged (`--receipt <path>` still works; existing tests still pass) — pass `node --test scripts/receipt-gate.test.mjs` ok 13
- Main changes: added stdin mode (`--receipt -`) to scripts/receipt-gate.mjs; when the path argument is "-" the receipt text is read from fd 0 via readFileSync(0, "utf8") and validated exactly as file input; traceId becomes "receipt-stdin"
- Changed files: scripts/receipt-gate.mjs, scripts/receipt-gate.test.mjs
- Branch / commit / review: local branch main, not pushed
- Validation results: node --test scripts/receipt-gate.test.mjs → 13/13 pass (incl. AC1-stdin ×2, AC2 regression)
- Review findings: none
- Not validated or not executed: commit, push, deploy
- Risks and remaining work: none
- Planning-thread decision needed: none
- Final worktree state:  M scripts/receipt-gate.mjs
 M scripts/receipt-gate.test.mjs
?? .scratch/receipt-stdin/receipt.md
- External effects: none
- Docs delta: usage string and mode comment updated in scripts/receipt-gate.mjs
- Receipt metrics: fork-or-express: fork | archive-gates: pass | archive-gate-failures: 0 | grill-rounds: 0 | criteria-evidenced: 2/2 | docs-delta: updated | skill-friction: none

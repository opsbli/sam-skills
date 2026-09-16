---
"sam-skills": patch
---

Harden the archive gate, the guard set, and the fork-maintenance path.

- `receipt-gate` gates as intended. Pass/fail markers are word-bounded
  (`bypass`/`failure`/`passenger` no longer read as verdicts), fields are anchored
  to the contract's field list (a criteria entry shaped like `- AC1: …` no longer
  truncates the Acceptance criteria block), and Gate 6 compares against
  `--checkout` instead of the validator's own repository.
- `sync-upstream.sh` guards what it claims to. The old check asked whether the
  merge base descends from `upstream/main` — true by construction, so it could
  never fire. It now refuses unrelated histories and warns when the baseline
  recorded in `README.md` stops being an ancestor (the signature of an upstream
  rewrite), and a `trap` aborts and restores the checkout on a rebase conflict
  instead of leaving it mid-rebase with no message.
- Version identity is checked where it is written: `sync-plugin-version.mjs` now
  covers the README fork badge as well as the plugin manifests, and `npm run
  version` regenerates the Codex payload so a version PR cannot ship a drifted
  mirror.
- New guards in `verify:all`: `agents-md-gate.mjs` (AGENTS.md must be a real
  pointer, not a symlink materialised into nine bytes) and `transport-gate.mjs`
  (the transport registry in `contracts/transports.json` and the detection list
  in `execute-spec-in-fork` must agree). `verify.mjs` also refuses a `*.test.mjs`
  that asserts nothing, so a suite registering no tests is caught instead of
  reporting green.

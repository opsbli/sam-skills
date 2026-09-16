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
- `explainer-page-gate.mjs` covers the one copy of the pipeline description no
  gate could reach: the published page at `workbuddy.link`. Retiring a transport
  used to leave it describing a route the repo no longer had — it still read
  "三条传输" with a fork-loop card a full day after ADR 0007 deleted the code,
  and only a human happening to look caught it. `contracts/explainer-page.json`
  records the last time the page was verified against `contracts/transports.json`;
  the gate fails when the registry moves without a re-verify, and `--sync`
  (network, opt-in) re-reads the live page and refuses to record a state that
  disagrees with it. Retired route names now live in `contracts/transports.json`
  rather than in the gate, so there is one list of what no longer exists. Note
  what it does not do: it cannot see someone editing the page behind our back —
  that needs `--sync`; a green run proves the registry has not moved, not that
  the page is current.

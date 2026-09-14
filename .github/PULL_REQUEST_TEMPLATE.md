<!--
Fork-authored skills — the ones this fork owns end to end — may change freely.
The list is not restated here: `contracts/fork-authorship.json` is the single
source of truth, read by `lint-skills.mjs --diff-audit` and referenced by the
fork docs, so the three cannot disagree about who is fork-owned.

Inherited upstream skills may only change for one of these reasons
(see docs/maintaining-fork.md, "Inherited-skill change policy"):
  (a) behavior fix
  (b) semantic anchor (e.g. emoji anchors that an agent parses — state the parsing payoff)
  (c) fork-chain routing (ask-matt style additions)

Pure wording polish on inherited skills is rejected: every cosmetic line is
rebase friction at the next upstream sync.
-->

## What changed

- [ ] This PR does NOT touch the expression layer of inherited upstream skills
- [ ] …or it does, and the reason is (a)/(b)/(c): ______
- [ ] A changeset exists and mentions every inherited skill this PR modifies (`npx changeset`)

## Generated payloads

- [ ] `.codex-plugin/` was regenerated after the skill or manifest edits (`node scripts/build-codex-plugin.mjs`)

## Verification

- [ ] `npm run verify` passes (every read-only guard)
- [ ] `npm run verify:all` passes (the guard test suites too)

## What changed

<!--
Fork-owned skills (to-goal, goal-crafter, spec-executor, execute-spec-in-fork,
roundtable) may change freely.

Inherited upstream skills may only change for one of these reasons
(see docs/maintaining-fork.md, "Inherited-skill change policy"):
  (a) behavior fix
  (b) semantic anchor (e.g. emoji anchors that an agent parses — state the parsing payoff)
  (c) fork-chain routing (ask-matt style additions)

Pure wording polish on inherited skills is rejected: every cosmetic line is
rebase friction at the next upstream sync.
-->

- [ ] This PR does NOT touch the expression layer of inherited upstream skills
- [ ] …or it does, and the reason is (a)/(b)/(c): ______
- [ ] A changeset exists and mentions every inherited skill this PR modifies (`npx changeset`)

## Verification

- [ ] `npm run lint:skills` passes
- [ ] `npm run check-plugin-version` passes

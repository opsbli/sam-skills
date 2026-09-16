# Sync drill log

One row per drill. Metrics measure the trial rebase of the fork overlay onto
the fetched upstream tip. `est. minutes` is a 3-min-per-hunk heuristic.

| timestamp | upstream tip | result | conflicted files | conflict hunks | est. minutes | implement-spec tripwire |
|---|---|---|---|---|---|---|
| 2026-09-04 11:03 | 6654f6b | up-to-date | 0 | 0 | 5 | no |
| 2026-09-14 10:06 | 6654f6b | up-to-date | 0 | 0 | 5 | no |
| 2026-09-14 10:28 | 6654f6b | up-to-date | 0 | 0 | 5 | no |
| 2026-09-14 10:36 | 3cca18b | conflicts | 1 | 1 | 10 | moved — implement-spec relocated upstream; check docs/upstream-collision-playbook.md |
| 2026-09-16 10:21 | 959a8e9 | conflicts | 2 | 2 | 10 | no |

The table above is kept contiguous: notes used to be interleaved between rows,
which silently split the Markdown table in two and left later rows rendering as
plain text. They live below now, oldest first.

## Notes

> Note (2026-09-14 10:06): `git fetch upstream` failed (network unreachable — schannel/empty reply), so this drill ran its decision logic against the cached `upstream/main` @ 6654f6b, unchanged since the 2026-09-04 baseline. Also: the fork lineage was re-anchored onto the original delivery lineage this same day (commit 60e3515, tag `fork-reanchored-20260914`) after the WorkBuddy worktree manager orphaned the managed branch ref — without that, merge-base with upstream would not resolve. Re-run the drill with connectivity restored to measure against a fresh upstream tip before any real sync.

> Drill note (2026-09-14 10:36): first fetch succeeded after clearing a corrupt stray tag file (`refs/tags/probe-write-test.txt`); upstream advanced `6654f6b..3cca18b` (1 commit, PR #1025 "link-skills: stop linking misc/ into local skill directories"). Trial merge (`git merge-tree --write-tree`, faithful to the script's conflict-measurement branch — the throwaway-branch step was substituted because the worktree manager reverts short-lived branch refs): 1 conflicted file (`CLAUDE.md`, content conflict; `scripts/link-skills.sh` auto-merges). 1 ≤ 20 → formal sync permitted; CLAUDE.md disposition per playbook a/b/c is a fork-identity call (likely b: keep fork differences, rebuild patch). Metrics row appended manually in script format because the script's tmp-branch checkout could not survive the ref-reset race.

> Drill note (2026-09-16 10:21): upstream has advanced `6654f6b..959a8e9` — **5 commits since the last recorded baseline**, none of them absorbed by this fork. This row is the answer to a question the README cannot answer on its own: that file states the sync baseline correctly (`6654f6b`, 2026-08-24) but says nothing about how far upstream has moved since, so a reader cannot tell whether the fork is days or months behind. The ledger is where that number belongs, not a hand-written sentence that goes stale the next time anyone syncs.
>
> Measured with `git merge-tree --write-tree --no-messages HEAD upstream/main` rather than `scripts/sync-drill.sh`: the script refuses to run unless the worktree is clean, and this one was carrying uncommitted work at the time; its coreutils dependencies (`grep`, `date`) were unavailable too. The measurement is the same one the script itself falls back to, and like it, creates no branch and touches no existing one. `git fetch upstream main` beforehand succeeded, so the tip below is fresh rather than cached. Two conflicted files:
>
> - `CLAUDE.md` — three-stage content conflict, same file that conflicted on 2026-09-14. It keeps conflicting for the structural reason recorded then: it is the fork's own identity document, so every upstream edit to it lands on top of this fork's edits.
> - `skills/in-progress/retro/SKILL.md` — stages 1 and 3 with no stage 2, i.e. a modify/delete conflict: upstream still carries this skill and has since edited it, while this fork never adopted it. Worth a decision rather than a merge default.
>
> 2 files is well under the script's >20 stop-drilling threshold, so a formal `npm run sync:upstream` remains permitted whenever it is wanted. The tripwire stayed quiet: `implement-spec` is still upstream's `skills/in-progress/`, not promoted into `engineering/`, so no collision with this fork's own `engineering/implement`.

# Maintaining the fork

This repository has two remotes with different jobs:

- `upstream` is `mattpocock/skills`, the source of upstream releases.
- `origin` is `opsbli/sam-skills`, the publication target for this fork.

The maintained branch is an **overlay**: upstream history stays intact, and fork-specific workflow changes sit on top.

> **History note (2026-09):** `origin/main` was first published as a fresh snapshot, then grafted onto `upstream/main` (`6654f6b`, v1.2.3) on 2026-09-04 via `commit-tree` re-rooting. Histories are now connected: `git merge-base HEAD upstream/main` resolves, and `sync:upstream` / `sync-drill.sh` do real work. The pre-graft tip is preserved on the local branch `backup/pre-graft-20260904-105531`.

## Sync upstream

Start from a clean maintained branch and run:

```bash
npm run sync:upstream
```

The script fetches `upstream/main`, records a timestamped backup branch, and rebases every fork commit after the merge base onto the new upstream tip. If a conflict occurs, resolve it by intent and continue the rebase. The script never pushes.

After the rebase:

1. Review the complete overlay with `git diff upstream/main...HEAD`.
2. Update the upstream version and commit in `README.md` when they changed.
3. Keep `package.json` and `.claude-plugin/plugin.json` on the same fork version.
4. Run `npm run check-plugin-version`, `npm run lint:skills`, and `claude plugin validate . --strict`.
5. Run `npm run sync:local` after the repository state is accepted.

## Sync local agents

The machine-wide canonical source is `~/.agents_skills`. Claude Code, Codex, OpenCode, Pi, and `.agents` point to it. Hermes keeps a real copy because its discovery does not reliably follow symlinks.

```bash
npm run sync:local
```

The script backs up every affected canonical Skill under `~/.agents_skills/.bak-matt-sync-<timestamp>`, replaces only the promoted Skills owned by this repository, verifies each directory, then invokes the canonical Hermes sync script. It does not remove Skills owned by other repositories.

## Inherited-skill change policy

The fork's 25 inherited skills are borrowed surface: every cosmetic line we touch there becomes rebase friction at the next upstream sync. Fork-owned skills (`to-goal`, `goal-crafter`, `spec-executor`, `execute-spec-in-fork`, `roundtable`) may change freely. An inherited skill may only change for one of three reasons:

- **(a) Behavior fix** — the skill does something wrong for fork users.
- **(b) Semantic anchor** — a deterministic format change an agent parses (emoji anchors, launch blocks), and the parsing payoff is stated in the changeset.
- **(c) Fork-chain routing** — additions that point at fork-owned skills (e.g. `ask-matt` routes, `to-spec` launch block).

Pure wording polish on an inherited skill is rejected in review. Two mechanical guards:

- `node scripts/lint-skills.mjs --diff-audit upstream/main` reports every inherited skill's changed-line count against upstream and warns when a skill exceeds the 40-line budget without a changeset mentioning its name. Warn-only for two releases, then it becomes a hard gate.
- The pull request template requires declaring (a)/(b)/(c) for any inherited-skill expression-layer change.

## Sync drills

`npm run sync:upstream` must never be a leap of faith. `bash scripts/sync-drill.sh` runs a throwaway trial rebase onto the fetched upstream tip, records conflicted files, conflict hunks, and estimated review minutes in `docs/sync-drill-log.md`, and cleans up after itself. Run it quarterly and on every upstream release; a drill reporting more than 20 conflicted files means stop drilling and do the real sync now. The drill also watches whether upstream's `implement-spec` has been promoted out of `in-progress` — when it trips, follow [docs/upstream-collision-playbook.md](./upstream-collision-playbook.md).

## Publish to the fork

Keep local `main` tracking `upstream/main` so `git pull` cannot accidentally merge from the publication remote. Publishing therefore requires an explicit destination:

```bash
git push origin main
```

Normal pushes need no force. Only a history rewrite (like the initial graft, or a later deliberate rebuild) requires `--force-with-lease`, and that is a destructive remote operation that requires explicit user authorization at action time.

Never push to `upstream`.

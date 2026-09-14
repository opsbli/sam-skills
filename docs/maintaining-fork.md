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

The script fetches `upstream/main`, warns when the baseline recorded in `README.md` is no longer an ancestor of `upstream/main` (the signature of an upstream history rewrite), records a timestamped backup branch, and rebases every fork commit after the merge base onto the new upstream tip. **On a conflict it aborts the rebase and restores the checkout** — it does not leave you mid-rebase — and the backup branch survives either way. The script never pushes. To roll forward by hand, resolve the conflicts and re-run it.

After the rebase the script runs the same guards that pre-push and CI run — `check-plugin-version`, `lint:skills`, `check:router`, the codex payload freshness check, `receipt:gate --check`, and `claude plugin validate . --strict` when the CLI is present — so a sync cannot report success while leaving a stale mirror or a drifted contract to break the next push.

Then:

1. Review the complete overlay with `git diff upstream/main...HEAD`.
2. Update the upstream version and commit in `README.md` when they changed.
3. Keep `package.json` and `.claude-plugin/plugin.json` on the same fork version.
4. Run `npm run sync:local` after the repository state is accepted.

### When a sync fails

| Symptom | What happened | Recovery |
|---|---|---|
| `SYNC ABORTED` then `git rebase --abort` | A rebase conflict. The checkout was restored to the backup branch tip; nothing was lost. | Resolve by hand and re-run `npm run sync:upstream`, or `git rebase --onto upstream/main <base> <branch>` in a worktree you are ready to fix. |
| `SYNC INCOMPLETE` | The rebase committed, but a post-rebase guard failed, so the result is not releasable. | Fix the failing check and commit, or `git reset --hard backup/upstream-sync-<stamp>` to return to the pre-sync tip (the script prints the branch name). |
| `warning: recorded baseline … no longer an ancestor` | Upstream force-pushed; the replay will be larger than usual. | Inspect `git log --oneline upstream/main ^HEAD` before accepting the rebase. |
| `error: worktree must be clean` / `share no history` | A precondition failed: uncommitted work, an unnamed branch, or unrelated histories. | Commit or stash; check out the maintained branch; never force a rebase across unrelated histories. |

### When the local object store is incomplete

A clone can end up referencing objects it does not have — after a history rewrite upstream, after a re-rooting/graft, or after a fetch interrupted mid-pack. The symptoms are loud but misleading:

```bash
git fsck --no-progress            # error: refs/tags/<name>: invalid sha1 pointer <sha>
git rev-list --count HEAD         # fatal: Failed to traverse parents of commit <sha>
git merge-base HEAD upstream/main # error: could not parse commit <sha>
git fetch                         # error: failed to perform geometric repack
```

Diagnose before repairing, in this order:

```bash
git tag -l | while read t; do git cat-file -t "refs/tags/$t" >/dev/null 2>&1 || echo "DANGLING TAG $t"; done
git cat-file -p <broken-commit> | head -3     # shows the missing `parent <sha>`
git fetch upstream <missing-sha>              # can the object still be obtained?
```

1. **Dangling tag refs first.** A tag pointing at a missing object makes the auto-repack fail, and a failing repack makes *the whole `git fetch` fail* — so one dead tag can look like a network problem. Delete the dangling tags (`git tag -d <name>`) before anything else; that alone took `invalid sha1 pointer` errors from 7 to 0 in this repository.
2. **Then decide whether the missing object is obtainable.** It is not if the fetch refuses it (`did not send all necessary objects`). Note that git will *not* re-fetch ancestors of a commit it already has: if the local repo has the tip but not some parent, a plain `git fetch` reports "everything up to date" and downloads nothing.
3. **Stop the bleeding while you diagnose.** The repack is what turns a broken store into failed fetches, so turn it off locally — reversible, `.git/config` only:

   ```bash
   git config maintenance.auto false
   git config gc.auto 0
   git config fetch.writeCommitGraph false
   # revert with: git config --unset maintenance.auto && git config --unset gc.auto && git config --unset fetch.writeCommitGraph
   ```

   With that, `git fetch` returns to a clean exit. Local work — `status`, `commit`, short `log`, every test suite — is unaffected throughout.

4. **Try `git fetch --refetch` before anything invasive.** This is the fix that actually worked here, and it is the one to reach for first:

   ```bash
   git fetch --refetch --no-tags --force upstream main
   ```

   `--refetch` re-downloads the full pack instead of negotiating against the refs the clone already has — and that negotiation is precisely what hides the problem. Git sees that it already has the tip, reports "everything up to date", and never asks for the missing *ancestor*. In this repository the single command above restored `6654f6b`, after which `git rev-list --count HEAD` (502 commits), `git log` over the full history, and `git merge-base HEAD upstream/main` all worked again — no history surgery and no re-clone.

5. **Clear invalid reflog entries if maintenance still complains.** A reflog line can outlive its object: a branch-creation entry records the commit the branch was born at. `git fsck` names them. Either expire the reflog wholesale (`git reflog expire --expire=now --all`) or filter just the offending lines out of `.git/logs/HEAD` and `.git/logs/refs/heads/*`, which keeps every other entry intact.

6. **If a broken link survives inside an object you intend to keep, graft it.** A commit whose parent is gone blocks whole-repo walks (`git log --all`, `git rev-list --all`). `git replace --graft <sha>` makes it a traversal root without touching a single ref or rewriting history, and `git replace -d <sha>` undoes it. Know the limit: traversal honours the replacement, but `commit-graph` and `geometric-repack` do not — they must describe the real object graph.

7. **When the orphan cannot be removed, stop running the tasks that cannot finish.** If the broken commit is pinned by something you want to keep, the honest answer is to keep it and turn the repack off:

   ```bash
   git config maintenance.auto false
   git config gc.auto 0
   git config fetch.writeCommitGraph false
   # revert with: git config --unset maintenance.auto && git config --unset gc.auto && git config --unset fetch.writeCommitGraph
   ```

   `git fetch` then exits clean, and `git fsck` still reports the one broken link — which is correct, because the object really is gone.

   Re-anchoring the fork (`git commit-tree` re-rooting, the technique the `fork-reanchored-*` / `recovery-onto-*` tags record) or re-cloning from `origin` remain the heavier options if you want a store with no broken links at all.

> **This clone (2026-09-14).** Recovered in place. Deleted 7 dangling tags; `git fetch --refetch` restored the missing upstream baseline `6654f6b`; invalid reflog lines were filtered out; `git replace --graft 6348c2ef` restored `--all` traversal. One broken link remains on purpose: `6348c2ef` ("Republish home: …") keeps its missing parent `be553a9d` because the documented pre-graft tip branch `backup/pre-graft-20260904-105531` still points through it, and that branch is worth more than a clean `fsck`. Hence the three maintenance settings above are off here, and `git fsck` will keep reporting exactly that one link.

## Sync local agents

The machine-wide canonical source is `~/.agents_skills`. Claude Code, Codex, OpenCode, Pi, and `.agents` point to it. Hermes keeps a real copy because its discovery does not reliably follow symlinks.

```bash
npm run sync:local
```

The script backs up every affected canonical Skill under `~/.agents_skills/.bak-matt-sync-<timestamp>`, replaces only the promoted Skills owned by this repository, verifies each directory, then invokes the canonical Hermes sync script. It does not remove Skills owned by other repositories.

## Inherited-skill change policy

The fork's 25 inherited skills are borrowed surface: every cosmetic line we touch there becomes rebase friction at the next upstream sync. Fork-authored skills may change freely. That list is not restated here — `contracts/fork-authorship.json` is the single source of truth, read by `lint-skills.mjs` for the `--diff-audit` exemption and referenced by the PR template. A skill this fork merely edits stays out of it. An inherited skill may only change for one of three reasons:

- **(a) Behavior fix** — the skill does something wrong for fork users.
- **(b) Semantic anchor** — a deterministic format change an agent parses (emoji anchors, launch blocks), and the parsing payoff is stated in the changeset.
- **(c) Fork-chain routing** — additions that point at fork-owned skills (e.g. `ask-matt` routes, `to-spec` launch block).

Pure wording polish on an inherited skill is rejected in review. Two mechanical guards:

- `node scripts/lint-skills.mjs --diff-audit upstream/main` reports every inherited skill's changed-line count against upstream and warns when a skill exceeds the 40-line budget without a changeset mentioning its name. Warn-only for two releases, then it becomes a hard gate.
- The pull request template requires declaring (a)/(b)/(c) for any inherited-skill expression-layer change.

## Receipt gate

`npm run receipt:gate -- --receipt <file>` runs the six-gate archival validator (N1, US-4) on a `SPEC EXECUTION RECEIPT` whose first field is `Schema: spec-executor-receipt/v2`: per-gate PASS/FAIL with JSON report lines (6-digit codes 101001–101006, pre-gate 101011, internal 901001), exit 0 only when all six gates pass. The receipt's `Final worktree state` must list entries in `git status --porcelain` form (or plain paths); write `clean` when the tree is empty. `npm run receipt:gate -- --check` validates `contracts/receipt-v2.json` and then walks every landing point it lists — the skill prose, the scripts, the public docs, and the delivery documents while those are still present — so a Schema bump or a vocabulary change cannot land in one place and miss the others. Synthetic-error coverage: `npm run test:receipt-gate`. `npm run verify` runs this self-check together with every other read-only guard.

## Sync drills

`npm run sync:upstream` must never be a leap of faith. `bash scripts/sync-drill.sh` runs a throwaway trial rebase onto the fetched upstream tip, records conflicted files, conflict hunks, and estimated review minutes in `docs/sync-drill-log.md`, and cleans up after itself. Run it quarterly and on every upstream release; a drill reporting more than 20 conflicted files means stop drilling and do the real sync now. The drill also watches whether upstream's `implement-spec` has been promoted out of `in-progress` — when it trips, follow [docs/upstream-collision-playbook.md](./upstream-collision-playbook.md).

## Publish to the fork

Keep local `main` tracking `upstream/main` so `git pull` cannot accidentally merge from the publication remote. Publishing therefore requires an explicit destination:

```bash
git push origin main
```

Normal pushes need no force. Only a history rewrite (like the initial graft, or a later deliberate rebuild) requires `--force-with-lease`, and that is a destructive remote operation that requires explicit user authorization at action time.

Never push to `upstream`.

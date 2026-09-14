#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: worktree must be clean before syncing upstream" >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "error: upstream sync requires a named local branch" >&2
  exit 1
fi

git fetch --prune upstream main --tags

# A failing merge-base means unrelated histories. Rebased anyway, the whole fork
# would be replayed onto upstream/main as brand-new commits.
if ! base="$(git merge-base HEAD upstream/main)"; then
  echo "error: HEAD and upstream/main share no history — refusing to rebase unrelated histories" >&2
  exit 1
fi

# The guard that used to sit here asked whether $base descends from
# upstream/main. It always does: $base IS a merge-base, so the check was true by
# construction and could never fire. The hazard worth guarding is upstream
# rewriting history, which surfaces as the *recorded* baseline in README.md
# ceasing to be an ancestor of upstream/main.
recorded="$(sed -n 's/.*同步基线：上游 `main` 的 `\([0-9a-f]\{7,40\}\)`.*/\1/p' README.md | head -1 || true)"
if [[ -n "$recorded" ]] && git rev-parse --verify --quiet "${recorded}^{commit}" >/dev/null; then
  if ! git merge-base --is-ancestor "$recorded" upstream/main; then
    echo "warning: recorded baseline $recorded is no longer an ancestor of upstream/main — upstream history was rewritten; expect a larger replay than usual" >&2
  fi
fi

if [[ "$base" == "$(git rev-parse upstream/main)" ]]; then
  echo "already based on current upstream/main"
  exit 0
fi

stamp="$(date +%Y%m%d-%H%M%S)"
backup_branch="backup/upstream-sync-$stamp"
git branch "$backup_branch" HEAD
echo "backup branch: $backup_branch"

# A conflict makes `git rebase` exit non-zero. Under `set -e` that used to end the
# script mid-rebase: rebase-merge state on disk, conflict markers in the worktree,
# no message, no rollback, and the post-rebase verification never reached — the
# repository was left in a state the docs did not describe and no runbook covered.
# The trap restores the checkout and says how to roll forward by hand.
rebase_done=0
cleanup() {
  local status=$?
  if [[ "$rebase_done" -ne 1 ]] && { [[ -d .git/rebase-merge ]] || [[ -d .git/rebase-apply ]]; }; then
    echo "" >&2
    echo "SYNC ABORTED: the rebase did not complete. Restoring the checkout." >&2
    git rebase --abort || true
    echo "Restored $branch to the tip of $backup_branch. Nothing was lost." >&2
    echo "To roll forward instead: resolve the conflicts, then re-run this script." >&2
  fi
  exit "$status"
}
trap cleanup EXIT

git rebase --onto upstream/main "$base" "$branch"
rebase_done=1

sync_failed() {
  echo "SYNC INCOMPLETE: post-rebase verification failed — the rebase itself is committed, but this sync is NOT releasable until the failing check above passes." >&2
  echo "to roll back: git reset --hard $backup_branch" >&2
  exit 1
}

# Kept deliberately equal to what pre-push and CI run. A sync that reported
# success while leaving a stale codex mirror, an uncovered router route or a
# drifted receipt contract would hand the breakage to the next push instead of
# failing here, where the operator still has the backup branch in hand.
npm run check-plugin-version || sync_failed
npm run lint:skills || sync_failed
npm run check:router || sync_failed
node scripts/build-codex-plugin.mjs --check || sync_failed
npm run receipt:gate -- --check || sync_failed
if command -v claude >/dev/null 2>&1; then
  claude plugin validate . --strict || sync_failed
fi

echo "rebased $branch onto upstream/main"
echo "run npm run sync:local after reviewing and committing any conflict-resolution changes"

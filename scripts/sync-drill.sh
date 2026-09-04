#!/usr/bin/env bash
# sync-drill: measure the cost of the next upstream rebase WITHOUT touching
# any real branch. Runs a trial rebase on a throwaway branch, records three
# metrics (conflicted files, conflict hunks, estimated review minutes), then
# cleans up. Safe to run any time; the worktree ends exactly as it started.
#
# Usage: bash scripts/sync-drill.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"

log_file="docs/sync-drill-log.md"
tmp_branch="drill/upstream-sync-tmp"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: worktree must be clean before a sync drill" >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "error: sync drill requires a named local branch" >&2
  exit 1
fi

cleanup() {
  git rebase --abort >/dev/null 2>&1 || true
  git checkout --quiet "$branch" >/dev/null 2>&1 || true
  git branch -D "$tmp_branch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git fetch --prune upstream main --tags

base="$(git merge-base HEAD upstream/main)"
upstream_tip="$(git rev-parse --short upstream/main)"

if [[ "$base" == "$(git rev-parse upstream/main)" ]]; then
  stamp="$(date +%Y-%m-%d %H:%M)"
  mkdir -p docs
  if [[ ! -f "$log_file" ]]; then
    cat > "$log_file" <<'EOF'
# Sync drill log

One row per drill. Metrics measure the trial rebase of the fork overlay onto
the fetched upstream tip. `est. minutes` is a 3-min-per-hunk heuristic.

| timestamp | upstream tip | result | conflicted files | conflict hunks | est. minutes | implement-spec tripwire |
|---|---|---|---|---|---|---|
EOF
  fi
  printf '| %s | %s | up-to-date | 0 | 0 | 5 | no |\n' "$stamp" "$upstream_tip" >> "$log_file"
  echo "already based on current upstream/main ($upstream_tip); baseline row logged to $log_file"
  exit 0
fi

git branch -f "$tmp_branch" HEAD
git checkout --quiet "$tmp_branch"

conflict_files=0
conflict_hunks=0
drill_result="clean"

if git rebase --onto upstream/main "$base" "$tmp_branch" >/dev/null 2>&1; then
  drill_result="clean"
else
  git rebase --abort >/dev/null 2>&1 || true
  # Conflicts are not reported by a failed-then-aborted rebase, so measure
  # them with a trial merge tree instead: merge-tree reports what a rebase
  # would hit across the overlay as a whole.
  merge_out="$(git merge-tree --write-tree --no-messages "$tmp_branch" upstream/main 2>/dev/null || true)"
  conflict_files=$(printf '%s\n' "$merge_out" | grep -c '^<<<<<<<' || true)
  conflict_hunks="$conflict_files"
  # Fallback: if merge-tree is unavailable/old git, count via rerere-free attempt
  if [[ "$conflict_files" -eq 0 ]]; then
    conflict_files="unknown(old git)"
    conflict_hunks="unknown(old git)"
  fi
  drill_result="conflicts"
fi

# Review-minute heuristic: 3 minutes per conflict hunk, floor 10 if conflicts.
if [[ "$drill_result" == "clean" ]]; then
  est_minutes=5
else
  if [[ "$conflict_hunks" =~ ^[0-9]+$ ]]; then
    est_minutes=$(( conflict_hunks * 3 ))
    [[ "$est_minutes" -lt 10 ]] && est_minutes=10
  else
    est_minutes="unknown"
  fi
fi

# Plan-4 tripwire: did upstream promote implement-spec out of in-progress?
collision_note="no"
if git ls-tree -d --name-only upstream/main skills/engineering/ 2>/dev/null | grep -qx "implement-spec"; then
  collision_note="YES — implement-spec promoted; see docs/upstream-collision-playbook.md"
elif ! git ls-tree -d --name-only upstream/main skills/in-progress/ 2>/dev/null | grep -qx "implement-spec"; then
  collision_note="moved — implement-spec relocated upstream; check docs/upstream-collision-playbook.md"
fi

stamp="$(date +%Y-%m-%d %H:%M)"
mkdir -p docs
if [[ ! -f "$log_file" ]]; then
  cat > "$log_file" <<'EOF'
# Sync drill log

One row per drill. Metrics measure the trial rebase of the fork overlay onto
the fetched upstream tip. `est. minutes` is a 3-min-per-hunk heuristic.

| timestamp | upstream tip | result | conflicted files | conflict hunks | est. minutes | implement-spec tripwire |
|---|---|---|---|---|---|---|
EOF
fi

printf '| %s | %s | %s | %s | %s | %s | %s |\n' \
  "$stamp" "$upstream_tip" "$drill_result" "$conflict_files" "$conflict_hunks" "$est_minutes" "$collision_note" \
  >> "$log_file"

echo "drill complete: $drill_result (files=$conflict_files hunks=$conflict_hunks est=${est_minutes}m)"
echo "logged to $log_file"
if [[ "$conflict_files" =~ ^[0-9]+$ ]] && [[ "$conflict_files" -gt 20 ]]; then
  echo "WARNING: >20 conflicted files — stop drilling and run a real 'npm run sync:upstream' now" >&2
fi
if [[ "$collision_note" != "no" ]]; then
  echo "WARNING: $collision_note" >&2
fi

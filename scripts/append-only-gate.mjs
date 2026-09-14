#!/usr/bin/env node
// append-only-gate — mechanical enforcement of the ledgers' append-only rule.
//
// Three files call themselves append-only, and until now that was only prose:
//
//   docs/metrics.md             — one row per validated receipt
//   docs/skill-friction-log.md  — one entry per non-none skill-friction value
//   .tdd-slice-log.jsonl        — one event per red-green slice
//
// A rewritten or deleted line in any of them destroys telemetry history
// silently: /harvest reads these ledgers to draft skill-revision proposals, and
// /project-standards audit reads the friction log. "Nothing is removed" has to
// be checkable, not promised.
//
// Modes:
//   (default)          working tree + index vs HEAD
//   --range <rev>      <rev>...HEAD (a PR base, a pushed-from sha)
//   --paths a,b        check a different path set
//   --check            self-test the deletion detector against fixtures
//
// Exit codes: 0 clean · 1 deletions found · 2 could not verify.
// Fail-closed: an unresolvable range exits 2 rather than reporting clean.
// The one documented no-op is an all-zero range (a new branch has no previous
// state to have deleted anything from).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LEDGERS = [
  "docs/metrics.md",
  "docs/skill-friction-log.md",
  ".tdd-slice-log.jsonl",
];

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", ...options });
}

/** Every removed content line in a unified diff, with the file it came from. */
export function deletionsInDiff(diffText) {
  const removals = [];
  let file = null;
  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith("diff --git ")) {
      file = raw.slice("diff --git ".length);
      continue;
    }
    // `--- a/x` / `+++ b/x` are headers, not content; `\ No newline…` is noise.
    if (raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("\\")) continue;
    if (raw.startsWith("@@")) continue;
    if (raw.startsWith("-")) removals.push({ file, line: raw.slice(1) });
  }
  return removals;
}

function selfCheck() {
  const appendOnly = [
    "diff --git a/docs/metrics.md b/docs/metrics.md",
    "index 1111111..2222222 100644",
    "--- a/docs/metrics.md",
    "+++ b/docs/metrics.md",
    "@@ -1,2 +1,3 @@",
    " | Date | Spec source |",
    "+| 2026-09-14 | .scratch/x/spec.md | fork |",
    "",
  ].join("\n");
  const rewritten = [
    "diff --git a/docs/metrics.md b/docs/metrics.md",
    "--- a/docs/metrics.md",
    "+++ b/docs/metrics.md",
    "@@ -1,3 +1,2 @@",
    "-| 2026-09-13 | old row |",
    "+| 2026-09-14 | new row |",
    "",
  ].join("\n");
  const problems = [];
  const okHits = deletionsInDiff(appendOnly);
  if (okHits.length !== 0) {
    problems.push(`append-only fixture produced ${okHits.length} deletion(s), expected 0`);
  }
  const badHits = deletionsInDiff(rewritten);
  if (badHits.length !== 1) {
    problems.push(`rewrite fixture produced ${badHits.length} deletion(s), expected 1`);
  }
  if (problems.length) {
    for (const problem of problems) console.error(`--check FAILED: ${problem}`);
    return 1;
  }
  console.log(
    "append-only gate self-check OK (append fixture 0 deletions, rewrite fixture 1)",
  );
  return 0;
}

function fail(message) {
  console.error(`append-only gate: ${message}`);
  console.error(
    "append-only gate: refusing to report clean on a check that did not run",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
if (args[0] === "--check") process.exit(selfCheck());

const rangeIdx = args.indexOf("--range");
const pathsIdx = args.indexOf("--paths");
const paths =
  pathsIdx >= 0 && args[pathsIdx + 1]
    ? args[pathsIdx + 1].split(",").map((p) => p.trim()).filter(Boolean)
    : DEFAULT_LEDGERS;

const present = paths.filter((path) => existsSync(join(repo, path)));
if (present.length === 0) {
  console.log(
    `append-only gate: none of the ${paths.length} ledger paths exist yet — nothing to verify`,
  );
  process.exit(0);
}

let diffText;
if (rangeIdx >= 0) {
  const rev = args[rangeIdx + 1];
  if (!rev) fail("--range requires a revision");
  if (/^0+$/.test(rev)) {
    console.log(
      `append-only gate: range ${rev} is all-zero (no previous state) — nothing to verify`,
    );
    process.exit(0);
  }
  try {
    git(["rev-parse", "--verify", `${rev}^{commit}`]);
  } catch {
    fail(`revision ${rev} is not resolvable in this clone`);
  }
  try {
    diffText = git(["diff", `${rev}...HEAD`, "--", ...present]);
  } catch {
    fail(`cannot diff ${rev}...HEAD (no reachable merge base?)`);
  }
} else {
  try {
    git(["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    console.log(
      "append-only gate: HEAD does not resolve yet (no commits) — nothing to verify",
    );
    process.exit(0);
  }
  try {
    diffText = git(["diff", "HEAD", "--", ...present]);
  } catch {
    fail("cannot diff the working tree against HEAD");
  }
}

const removals = deletionsInDiff(diffText);
if (removals.length === 0) {
  const scope = rangeIdx >= 0 ? `${args[rangeIdx + 1]}...HEAD` : "the working tree";
  console.log(
    `append-only gate OK (${present.length} ledger(s) checked against ${scope}, 0 removed lines)`,
  );
  process.exit(0);
}

console.error(
  `append-only gate FAILED: ${removals.length} removed line(s) in append-only ledgers`,
);
for (const removal of removals.slice(0, 20)) {
  console.error(`  ${removal.file}: ${removal.line.slice(0, 120)}`);
}
if (removals.length > 20) console.error(`  … and ${removals.length - 20} more`);
console.error(
  "These files are append-only: /harvest and /project-standards audit read them as history.",
);
console.error(
  "Correct a bad entry by appending a correction, never by rewriting the line.",
);
process.exit(1);

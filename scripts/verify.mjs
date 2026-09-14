#!/usr/bin/env node
// verify.mjs — one entry point for every read-only repo guard.
//
// Why this exists: the guards were eight separate `--check`-style scripts,
// each reachable only by remembering it exists. The ones nobody remembered
// (receipt-gate --check, the tdd gates, the codex payload freshness check)
// drifted unmeasured for exactly that reason. Adding a guard is now one row in
// GUARDS; running every guard is one command — in CI, in pre-push, and by hand.
//
// Modes:
//   (default)       run the read-only guards (no network, no upstream ref)
//   --with-tests    also run the `node --test` suites
//   --only <id>     run a single guard (or test suite) by id
//   --list          print the table and exit
//
// Exits 1 when anything fails. Nothing here mutates the repo.
//
// A file listed in TESTS is checked for shape before it is run. `node --test`
// reports a file that registers no tests as one passing test, so a suite with
// zero assertions is green forever — mailbox-cycle.test.mjs spent its whole life
// that way while wired into this very list. Counting passing tests cannot catch
// that, so the shape is asserted instead.
//
// Deliberately NOT in this list: `lint-skills.mjs --diff-audit upstream/main`
// (npm run verify:upstream) — it needs a fetched upstream ref and full history,
// so it lives where that is guaranteed (CI) instead of failing every clone.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const GUARDS = [
  {
    id: "lint",
    label: "skills lint — inventory, README links, docs pages, invocation pairing",
    script: "scripts/lint-skills.mjs",
    args: [],
  },
  {
    id: "router",
    label: "router coverage + README link integrity",
    script: "scripts/check-router.mjs",
    args: [],
  },
  {
    id: "plugin-version",
    label: "package.json ↔ plugin.json version identity",
    script: "scripts/sync-plugin-version.mjs",
    args: ["--check"],
  },
  {
    id: "codex-payload",
    label: "codex plugin payload freshness (.codex-plugin/ mirror)",
    script: "scripts/build-codex-plugin.mjs",
    args: ["--check"],
  },
  {
    id: "receipt-contract",
    label: "receipt v2 contract vs every landing point",
    script: "scripts/receipt-gate.mjs",
    args: ["--check"],
  },
  {
    id: "append-only",
    label: "append-only ledger gate self-check",
    script: "scripts/append-only-gate.mjs",
    args: ["--check"],
  },
  {
    id: "agents-md",
    label: "AGENTS.md is a real pointer, not a materialised symlink",
    script: "scripts/agents-md-gate.mjs",
    args: [],
  },
  {
    id: "transports",
    label: "transport registry ↔ execute-spec-in-fork detection list",
    script: "scripts/transport-gate.mjs",
    args: [],
  },
  {
    id: "tdd-coupling",
    label: "tdd coupling gate self-check",
    script: "scripts/test-coupling-gate.mjs",
    args: ["--check"],
  },
  {
    id: "tdd-slice",
    label: "tdd slice gate self-check",
    script: "scripts/tdd-slice-gate.mjs",
    args: ["--check"],
  },
];

const TESTS = [
  { id: "test-receipt-gate", label: "receipt gate synthetic-error coverage", file: "scripts/receipt-gate.test.mjs" },
  { id: "test-coupling-gate", label: "coupling gate self-test", file: "scripts/test-coupling-gate.test.mjs" },
  { id: "test-mailbox-cycle", label: "fork-loop mailbox cycle", file: "scripts/fork-loop-mcp/test/mailbox-cycle.test.mjs" },
];

const argv = process.argv.slice(2);
const withTests = argv.includes("--with-tests");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

if (argv.includes("--list")) {
  for (const guard of GUARDS) console.log(`guard  ${guard.id}\t${guard.label}`);
  for (const t of TESTS) console.log(`test   ${t.id}\t${t.label}`);
  process.exit(0);
}

function run(label, scriptPath, args) {
  if (!existsSync(join(repo, scriptPath))) {
    return { ok: false, output: `script missing: ${scriptPath}` };
  }
  const res = spawnSync(process.execPath, [join(repo, scriptPath), ...args], {
    cwd: repo,
    encoding: "utf8",
  });
  const output = `${res.stdout || ""}${res.stderr || ""}`.trim();
  return { ok: res.status === 0, output };
}

const plan = [
  ...GUARDS.filter((g) => !only || g.id === only).map((g) => ({
    id: g.id,
    label: g.label,
    run: () => run(g.label, g.script, g.args),
  })),
  ...(withTests ? TESTS : [])
    .filter((t) => !only || t.id === only)
    .map((t) => ({
      id: t.id,
      label: t.label,
      run: () => runNodeTest(t.file),
    })),
];

/**
 * Why a shape check and not a test count: `node --test` exits 0 for a file that
 * registers nothing, reporting it as one passing test. A `*.test.mjs` that only
 * console.logged "WRONG" would therefore be indistinguishable from a real guard
 * in CI output — which is exactly what happened here. These are the properties
 * that make a run able to fail at all.
 */
const TEST_SHAPE = [
  [/from\s+["']node:test["']/, "must import `node:test`"],
  [/\btest\s*\(/, "must register at least one `test(...)`"],
  [/from\s+["']node:assert/, "must import `node:assert`"],
  [/\bassert\.[A-Za-z]/, "must call an `assert.*` helper"],
];

function testShapeProblems(file) {
  const src = readFileSync(join(repo, file), "utf8");
  const problems = TEST_SHAPE.filter(([re]) => !re.test(src)).map(([, why]) => why);

  const lines = src.split(/\r?\n/).filter((line) => line.trim());
  if (/process\.exit\(\s*0\s*\)/.test(lines[lines.length - 1] || "")) {
    problems.push("must not end with `process.exit(0)` — it masks every failing assertion above it");
  }
  return problems;
}

function runNodeTest(file) {
  if (!existsSync(join(repo, file))) {
    return { ok: false, output: `test file missing: ${file}` };
  }
  const shape = testShapeProblems(file);
  if (shape.length) {
    return {
      ok: false,
      output: [
        `${file} is not a real test file:`,
        ...shape.map((problem) => `  - ${problem}`),
        "",
        "A *.test.mjs that asserts nothing still exits 0 under `node --test`,",
        "so it reports green forever. That is a tautology, not a guard.",
      ].join("\n"),
    };
  }
  const res = spawnSync(process.execPath, ["--test", join(repo, file)], {
    cwd: repo,
    encoding: "utf8",
  });
  const output = `${res.stdout || ""}${res.stderr || ""}`.trim();
  return { ok: res.status === 0, output };
}

if (!plan.length) {
  console.error(`verify: no guard or test matches --only ${only}`);
  process.exit(2);
}

const width = Math.max(...plan.map((p) => p.id.length));
const failures = [];

console.log(`verify: ${plan.length} check${plan.length === 1 ? "" : "s"}`);
for (const item of plan) {
  const { ok, output } = item.run();
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${item.id.padEnd(width)}  ${item.label}`);
  if (!ok) failures.push({ id: item.id, label: item.label, output });
}

if (failures.length) {
  for (const failure of failures) {
    console.error("");
    console.error(`--- ${failure.id}: ${failure.label} ---`);
    for (const line of failure.output.split(/\r?\n/)) console.error(`  ${line}`);
  }
  console.error("");
  console.error(`verify: ${plan.length - failures.length}/${plan.length} passed, ${failures.length} failed`);
  process.exit(1);
}

console.log(`verify: all ${plan.length} passed`);

#!/usr/bin/env node
// receipt-gate.test.mjs — synthetic-error coverage for the N1 receipt gate
// validator (US-4). Covers AC1 (compliant pass-through), AC2–AC5 (each gate
// intercepts its error class), AC6 (four synthetic error classes 4/4),
// AC7 (zero third-party imports), AC8 (--check self-check),
// AC9 (a marker-shaped substring is not evidence), AC10 (labelled criteria do
// not truncate the parse), AC11 (--checkout scopes Gate 6 to the named tree).
// Zero-dependency: node:test only.
//
// Run: node --test scripts/receipt-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "receipt-gate.mjs");
const repo = join(dirname(script), "..");
const node = process.execPath;

/**
 * A worktree this test owns, so Gate 6 asserts against a known tree instead of
 * whatever the host repository happens to have lying around. A pass or a fail
 * then depends on the receipt and the contract, not on the checkout.
 */
function makeWorktree({ file = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "receipt-gate-worktree-"));
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  if (file) {
    writeFileSync(join(dir, file), "// drift\n");
  }
  return dir;
}

function runOn(content, name = "receipt.md", extraArgs = [], opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "receipt-gate-test-"));
  const file = join(dir, name);
  writeFileSync(file, content, "utf8");
  const worktree = opts.worktree ?? makeWorktree();
  try {
    return spawnSync(node, [script, "--receipt", file, "--checkout", worktree, ...extraArgs], {
      cwd: repo,
      encoding: "utf8",
    });
  } finally {
    if (!opts.worktree) rmSync(worktree, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

function runStdin(content, opts = {}) {
  const worktree = opts.worktree ?? makeWorktree();
  try {
    return spawnSync(node, [script, "--receipt", "-", "--checkout", worktree], {
      input: content,
      encoding: "utf8",
    });
  } finally {
    if (!opts.worktree) rmSync(worktree, { recursive: true, force: true });
  }
}

/** JSON report lines the validator prints on a FAIL, one per intercepted gate. */
function envelopes(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

function compliantReceipt(worktreeLines) {
  return `SPEC EXECUTION RECEIPT

- Schema: spec-executor-receipt/v2
- Conclusion: completed
- Spec source: .scratch/demo/issues/01.md
- Review fixed point: abc1234
- Acceptance criteria: AC1 gate CLI validates a compliant receipt - pass \`node scripts/receipt-gate.mjs --receipt fixture.md\` exits 0 with 6/6
- Main changes: added the receipt gate validator
- Changed files: scripts/receipt-gate.mjs
- Branch / commit / review: local branch, not pushed
- Validation results: node --test scripts/receipt-gate.test.mjs all green
- Review findings: none
- Not validated or not executed: push, deploy
- Risks and remaining work: none
- Planning-thread decision needed: none
- Final worktree state: ${worktreeLines.join("\n")}
- External effects: none
- Docs delta: none
- Receipt metrics: fork-or-express: fork | archive-gates: pass | archive-gate-failures: 0 | grill-rounds: 2 | criteria-evidenced: 1/1 | docs-delta: none | skill-friction: none
`;
}

test("AC1: compliant receipt passes all six gates (exit 0)", () => {
  const res = runOn(compliantReceipt([]));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Result: 6\/6 — 归档：放行/);
});

test("AC2: missing Schema first field intercepted by Gate 2 (101011)", () => {
  const bad = compliantReceipt([]).replace(
    /- Schema: spec-executor-receipt\/v2\n/,
    "",
  );
  const res = runOn(bad);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /101011/);
  assert.match(res.stdout, /Gate 2 .*FAIL/);
});

test("AC3: multi-token Conclusion intercepted by Gate 3 (101003)", () => {
  const bad = compliantReceipt([]).replace(
    "- Conclusion: completed",
    "- Conclusion: partially completed",
  );
  const res = runOn(bad);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /101003/);
});

test("AC4: unevidenced acceptance criterion intercepted by Gate 4 (101004)", () => {
  const bad = compliantReceipt([]).replace(
    /- Acceptance criteria: .*\n/,
    "- Acceptance criteria: AC1 gate CLI validates a compliant receipt - pass `node scripts/receipt-gate.mjs` exits 0\nAC2 logout flow clears the session\n",
  );
  const res = runOn(bad);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /101004/);
  assert.match(res.stdout, /第 2 条/);
});

test("AC5: worktree drift intercepted by Gate 6 (101006)", () => {
  // The receipt declares one phantom file, the worktree holds a different one, so
  // the comparison reports both an extra and a missing path.
  const dirty = makeWorktree({ file: "stray-unexpected-file.ts" });
  try {
    const bad = compliantReceipt(["?? phantom-drift-file-definitely-absent.ts"]);
    const res = runOn(bad, "receipt.md", [], { worktree: dirty });
    assert.equal(res.status, 1);
    assert.match(res.stdout, /101006/);
    assert.match(res.stdout, /stray-unexpected-file\.ts/);
    assert.match(res.stdout, /phantom-drift-file-definitely-absent\.ts/);
  } finally {
    rmSync(dirty, { recursive: true, force: true });
  }
});

test("Gate 2: multiple receipts in one file intercepted (101002)", () => {
  const doubled =
    compliantReceipt([]) + "\n" + compliantReceipt([]);
  const res = runOn(doubled);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /101002/);
  assert.match(res.stdout, /2 份 receipt/);
});

test("Gate 2: no receipt block at all intercepted (101002)", () => {
  const res = runOn("hello world, no receipt here\n");
  assert.equal(res.status, 1);
  assert.match(res.stdout, /101002/);
  assert.match(res.stdout, /receipt 缺失/);
});

test("AC6: every interception emits a well-formed JSON envelope with the right code and gate", () => {
  // The envelope is what tooling consumes, so each code is checked for its gate
  // number, severity, trace id and timestamp -- coverage AC2-AC5 do not assert.
  const cases = [
    [
      "101011",
      "six-gate/2",
      compliantReceipt([]).replace(/- Schema: spec-executor-receipt\/v2\n/, ""),
    ],
    [
      "101003",
      "six-gate/3",
      compliantReceipt([]).replace(
        "- Conclusion: completed",
        "- Conclusion: partially completed",
      ),
    ],
    [
      "101004",
      "six-gate/4",
      compliantReceipt([]).replace(/- Acceptance criteria: .*\n/, "- Acceptance criteria: AC1 works\n"),
    ],
    ["101006", "six-gate/6", compliantReceipt(["?? phantom-drift-file-definitely-absent.ts"])],
  ];
  for (const [code, gate, content] of cases) {
    const res = runOn(content);
    assert.equal(res.status, 1, `expected interception for ${code}`);
    const matching = envelopes(res.stdout).filter((envelope) => envelope.code === code);
    assert.equal(matching.length, 1, `${code}: exactly one envelope, got ${matching.length}`);
    assert.equal(matching[0].gate, gate);
    assert.equal(matching[0].severity, "block");
    assert.equal(typeof matching[0].traceId, "string");
    assert.match(matching[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  }
});

test("AC7: validator imports node builtins only (zero third-party deps)", () => {
  const src = readFileSync(script, "utf8");
  assert.doesNotMatch(src, /from\s+["'](?!node:)[^"']+["']/);
  assert.doesNotMatch(src, /require\(/);
});

test("AC8: --check self-check passes against contract sources", () => {
  const res = spawnSync(node, [script, "--check"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /防漂移自检通过/);
});

test("AC1-stdin: compliant receipt piped via stdin passes all six gates (exit 0)", () => {
  const res = runStdin(compliantReceipt([]));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Result: 6\/6 — 归档：放行/);
});

test("AC1-stdin: non-compliant receipt piped via stdin is intercepted (exit 1, JSON envelope)", () => {
  const bad = compliantReceipt([]).replace(
    "- Conclusion: completed",
    "- Conclusion: partially completed",
  );
  const res = runStdin(bad);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /101003/);
  assert.match(res.stdout, /Gate 3 .*FAIL/);
  assert.match(res.stdout, /"code":"101003"/); // same JSON envelope line
});

test("AC2: file-path mode unchanged — --receipt <path> still works", () => {
  const res = runOn(compliantReceipt([]));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Result: 6\/6 — 归档：放行/);
});

// --- Gate 4 marker boundaries + Gate 6 scoping ------------------------------

test("AC9: `bypass` is not a pass marker — a marker-shaped substring is not evidence", () => {
  // Unbounded, MARKER_RE matched the `pass` inside `bypass` and the trailing
  // words counted as evidence, so this entry satisfied Gate 4 while carrying
  // nothing. The gate is the archive's trust anchor; a verdict-shaped substring
  // is exactly what it must not accept.
  const withSubstring = compliantReceipt([]).replace(
    /- Acceptance criteria: .*\n/,
    "- Acceptance criteria: - implement bypass logic\n",
  );
  const rejected = runOn(withSubstring);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout, /101004/);
  assert.match(rejected.stdout, /Gate 4 .*FAIL/);

  // Control: same sentence, only the marker changes — so the gate is reading the
  // marker and its evidence, not merely rejecting unfamiliar wording.
  const withMarker = compliantReceipt([]).replace(
    /- Acceptance criteria: .*\n/,
    "- Acceptance criteria: - implement bypass logic - pass `node --test`\n",
  );
  const accepted = runOn(withMarker);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
});

test("AC10: criteria labelled `- AC1: …` do not truncate the receipt parse", () => {
  // Criteria entries are shaped exactly like fields. Unanchored, `- AC1: …`
  // started a field of its own, leaving Acceptance criteria empty and Gate 4
  // rejecting a receipt that was in fact fully evidenced.
  const receipt = compliantReceipt([]).replace(
    /- Acceptance criteria: .*\n/,
    [
      "- Acceptance criteria:",
      "- AC1: gate CLI validates a compliant receipt - pass `node scripts/receipt-gate.mjs --receipt fixture.md` exits 0",
      "- AC2: unevidenced criterion is intercepted - pass `node --test scripts/receipt-gate.test.mjs` all green",
      "",
    ].join("\n"),
  );
  const res = runOn(receipt);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Gate 4 .*PASS/);
  assert.match(res.stdout, /Result: 6\/6 — 归档：放行/);
});

test("AC11: --checkout makes Gate 6 compare against the named worktree", () => {
  // Gate 6 used to `git status` the validator's own repository. That is invisible
  // while dogfooding and wrong everywhere else: the gate then reports on
  // sam-skills rather than on the checkout the receipt describes.
  const clean = makeWorktree();
  const dirty = makeWorktree({ file: "phantom-drift-file.ts" });
  try {
    const receipt = compliantReceipt([]); // reports an empty worktree

    const cleanRes = runOn(receipt, "receipt.md", [], { worktree: clean });
    assert.equal(cleanRes.status, 0, cleanRes.stdout + cleanRes.stderr);

    const dirtyRes = runOn(receipt, "receipt.md", [], { worktree: dirty });
    assert.equal(dirtyRes.status, 1, dirtyRes.stdout + dirtyRes.stderr);
    assert.match(dirtyRes.stdout, /101006/);
    assert.match(dirtyRes.stdout, /phantom-drift-file\.ts/);
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  }
});

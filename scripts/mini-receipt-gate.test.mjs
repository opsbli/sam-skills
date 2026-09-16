import { test, after } from "node:test";
import assert from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The express lane's gates, exercised against real receipts rather than assumed.
// Why it exists: until this file existed the express lane was described only in
// README prose — a documented route with no contract and nothing checking it.
// A route advertised in the README but skipped by every guard is a hole, and a
// hole nobody tested for would have stayed open indefinitely.
//
// The checkout for gate 4 is a throwaway git repo rather than this repository:
// gate 4 compares the receipt's claim against `git status --porcelain`, and
// running that against sam-skills itself would grade the suite on whoever's
// uncommitted work happened to be sitting in the tree that day — green locally,
// red in CI, for reasons that have nothing to do with the gate.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(repo, "scripts", "mini-receipt-gate.mjs");
// Built once and shared: the cases below only read the tree.
let sharedCheckout = null;
function makeCheckout() {
  if (sharedCheckout) return sharedCheckout;
  const dir = mkdtempSync(join(tmpdir(), "mini-gate-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "gate@example.com"]);
  git(["config", "user.name", "gate"]);
  git(["config", "core.autocrlf", "false"]);
  writeFileSync(join(dir, "clean.md"), "# untouched\n");
  git(["add", "clean.md"]);
  git(["commit", "-q", "-m", "init"]);
  writeFileSync(join(dir, "dirty.md"), "new file\n");
  sharedCheckout = dir;
  return dir;
}

function runGate(text, checkout) {
  const res = spawnSync(process.execPath, [GATE, "--receipt", "-", "--checkout", checkout], {
    input: text,
    encoding: "utf8",
    cwd: repo,
  });
  return { status: res.status, out: `${res.stdout || ""}${res.stderr || ""}` };
}

const VALID = `MINI RECEIPT

- Schema: mini-receipt/v1
- what changed: README.md 一处错字 to-gola → to-goal
- validation run: node scripts/lint-skills.mjs → OK (33 promoted)
- worktree state: dirty.md
`;

after(() => {
  if (sharedCheckout) rmSync(sharedCheckout, { recursive: true, force: true });
});

test("a truthful three-line receipt passes all four gates", () => {
  const { status, out } = runGate(VALID, makeCheckout());
  assert.strictEqual(status, 0, out);
  assert.match(out, /Result: 4\/4/);
});

test("a claim about a file that is not dirty fails gate 4", () => {
  const { status, out } = runGate(VALID.replace("dirty.md", "clean.md"), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102004/);
});

test("a missing Schema pin fails with the mismatch code", () => {
  const { status, out } = runGate(VALID.replace("- Schema: mini-receipt/v1\n", ""), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102011/);
});

test("a hand-patched wrong schema version fails rather than passes", () => {
  const { status, out } = runGate(VALID.replace("mini-receipt/v1", "mini-receipt/v2"), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102011/);
});

test("validation run of none fails gate 3", () => {
  const { status, out } = runGate(VALID.replace(/node scripts.*promoted\)$/m, "none"), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102003/);
});

test("validation run of just OK fails gate 3", () => {
  // "通过" and "OK" are verdicts, not evidence — the whole point of gate 3.
  const { status, out } = runGate(VALID.replace(/node scripts.*promoted\)$/m, "OK"), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102003/);
});

test("a missing third line fails gate 1", () => {
  const { status, out } = runGate(VALID.replace("- worktree state: dirty.md\n", ""), makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102001/);
});

test("two receipts in one block fail gate 1", () => {
  const { status, out } = runGate(`${VALID}\n${VALID}`, makeCheckout());
  assert.strictEqual(status, 1, out);
  assert.match(out, /102001/);
});

test("the contract self-check stays consistent", () => {
  const res = spawnSync(process.execPath, [GATE, "--check"], { encoding: "utf8", cwd: repo });
  assert.strictEqual(res.status, 0, `${res.stdout}${res.stderr}`);
});

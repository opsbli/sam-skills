// stop-hook.cjs — the delivery half of the fork-loop transport.
//
// Why this file exists: the hook had no test at all, and it is the most
// dangerous silent path in the pipeline. It decides whether an execution receipt
// reaches the planning session, and every failure mode is quiet by design — a
// missing mailbox, a malformed box, a session mismatch and an empty mailbox all
// `exit 0` with no output. Delivering a receipt twice, losing one, or handing it
// to the wrong session would all look like "no receipt yet".
//
// The contract this pins down:
//   silent   — empty stdin, unparseable stdin, no mailbox, unreadable mailbox,
//              a box with no `receipts` array, a session mismatch, and a
//              second run for an already-delivered receipt all print nothing
//              and exit 0
//   delivers — a pending receipt for this session is injected as Stop
//              continuation context and marked delivered on disk
//   warns    — a run with no parseable receipt carries the captured tail
//   atomic   — delivery leaves no temp file behind

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(here, "..", "stop-hook.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-hook-test-"));

/** A checkout with the fork-loop state directory but no mailbox yet. */
function makeCheckout() {
  const dir = fs.mkdtempSync(path.join(root, "checkout-"));
  fs.mkdirSync(path.join(dir, ".zcode", "fork-loop"), { recursive: true });
  return dir;
}

const mailboxOf = (dir) => path.join(dir, ".zcode", "fork-loop", "mailbox.json");

function writeBox(dir, box) {
  fs.writeFileSync(mailboxOf(dir), typeof box === "string" ? box : JSON.stringify(box, null, 2));
}

const readBox = (dir) => JSON.parse(fs.readFileSync(mailboxOf(dir), "utf8"));

/**
 * Run the hook the way ZCode does: hook input JSON on stdin, output on stdout.
 * The project-dir and session-id env vars are cleared so the only way the hook
 * can find a checkout is the `cwd` we hand it — otherwise an unrelated variable
 * on the developer's machine would decide the outcome.
 */
function runHook(input, opts = {}) {
  const env = { ...process.env };
  for (const key of ["ZCODE_PROJECT_DIR", "CLAUDE_PROJECT_DIR", "CLAUDE_SESSION_ID"]) delete env[key];
  Object.assign(env, opts.env || {});
  return spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input ?? {}),
    cwd: opts.cwd || root,
    env,
    encoding: "utf8",
  });
}

function entry(overrides = {}) {
  return {
    task_id: "task-1",
    planner_session: "sess_A",
    topic: "demo",
    state: "pending",
    runner_exit: 0,
    receipt: "SPEC EXECUTION RECEIPT\n\n- Schema: spec-executor-receipt/v2\n- Conclusion: completed\n",
    ...overrides,
  };
}

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// --- silent passes ----------------------------------------------------------

test("an empty stdin is a silent pass", () => {
  const res = runHook("");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

test("unparseable hook input is a silent pass", () => {
  const res = runHook("{ this is not json");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

test("no mailbox anywhere means silent, not a guess", () => {
  const dir = makeCheckout(); // state dir exists, mailbox.json does not
  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

test("an unreadable mailbox is a silent pass", () => {
  const dir = makeCheckout();
  writeBox(dir, "{ truncated");
  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

test("a mailbox with no receipts array is a silent pass, not a crash", () => {
  // `box.receipts.find` on `{}` throws a TypeError. A hook that throws blocks the
  // very Stop event it exists to serve, so this must be a clean pass.
  const dir = makeCheckout();
  writeBox(dir, {});
  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

test("a receipts field that is not an array is a silent pass", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: "nope" });
  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "");
});

// --- delivery ---------------------------------------------------------------

test("a pending receipt for this session is injected and marked delivered", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry()] });

  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);

  const out = JSON.parse(res.stdout);
  assert.equal(out.hookEventName, "Stop");
  assert.equal(out.continue, true, "delivery must request the continuation");
  assert.match(out.additionalContext, /task-1/);
  assert.match(out.additionalContext, /Schema: spec-executor-receipt\/v2/);

  const stored = readBox(dir).receipts[0];
  assert.equal(stored.state, "delivered", "delivery must be persisted, not just printed");
  assert.ok(stored.deliveredAt > 0, "the delivery timestamp must be recorded");
});

test("delivery is exactly-once: a second Stop stays silent", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry()] });

  const first = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.notEqual(first.stdout, "", "the first Stop should deliver");

  const second = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(second.status, 0);
  assert.equal(second.stdout, "", "the receipt must not be delivered twice");
});

test("a receipt addressed to another session stays pending", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry({ planner_session: "sess_A" })] });

  const res = runHook({ cwd: dir, session_id: "sess_other" }, { cwd: dir });
  assert.equal(res.stdout, "", "another session's receipt must not be delivered");
  assert.equal(
    readBox(dir).receipts[0].state,
    "pending",
    "a non-matching Stop must not consume the entry",
  );
});

test("a run with no parseable receipt still warns, with the captured tail", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry({ receipt: null, raw_output_tail: "boom: runner died" })] });

  const res = runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.continue, true, "the planner still needs to see the failure");
  assert.match(out.additionalContext, /WARNING: no parseable receipt/);
  assert.match(out.additionalContext, /boom: runner died/);
});

test("delivery leaves the state directory clean", () => {
  // Hygiene, NOT an atomicity proof. A small mailbox leaves no temp file behind
  // whether the write is direct or temp-and-rename, so this assertion does not
  // discriminate between them. Atomicity here is by construction — the hook
  // writes through `<file>.<pid>.tmp` and renames, matching writeJson on the MCP
  // side — and is deliberately not claimed by a test that cannot see it.
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry()] });
  runHook({ cwd: dir, session_id: "sess_A" }, { cwd: dir });

  const leftovers = fs
    .readdirSync(path.join(dir, ".zcode", "fork-loop"))
    .filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "a temp file left behind means a delivery that did not complete");
});

test("the checkout is found by walking up from the hook's cwd", () => {
  const dir = makeCheckout();
  writeBox(dir, { receipts: [entry()] });
  const nested = path.join(dir, "src", "deeper");
  fs.mkdirSync(nested, { recursive: true });

  const res = runHook({ session_id: "sess_A" }, { cwd: nested });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /task-1/, "an upward search from a nested cwd must still find the mailbox");
});

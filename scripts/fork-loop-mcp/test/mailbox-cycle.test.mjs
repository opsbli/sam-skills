// fork-loop mailbox cycle + execution lock — real assertions.
//
// History: this file used to be a tautology. It had no `node:test`, no `assert`,
// and an unconditional `process.exit(0)` at the end, so every internal check
// could print "WRONG" and the suite still exited 0 — green in CI while the
// pipeline it was supposed to protect went untested.
//
// What it pins down now:
//   protocol     — JSON-RPC handshake, exactly five tools, unknown tool is an error
//   mailbox      — session filtering, delivery, exactly-once, persisted state
//   settle       — ack/fail scope the lock release to the task that holds it
//   lock         — refusal, no-holder refusal, orphan grace, scoped release
//   spawn        — full cycle against a stub runner (proves the spawn path works)
//   timeout      — an overrunning runner is killed and the call still settles
//
// Fault paths carry assertions too: any RPC that never gets a reply fails the
// test instead of hanging the suite.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, "..", "server.mjs");
const RPC_TIMEOUT_MS = 15000;
const SPEC_READY = "SPEC READY\n\n- Status: ready for implementation";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "forkloop-"));
const checkout = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "forkloop-checkout-")));

// Stand-in runners, so the spawn path is exercised without ZCode.
// `resolveCliCommand` splits FORK_LOOP_ZCODE_CMD on whitespace, so this only
// works while execPath has no spaces — assert rather than silently misparse.
const SPLIT_SAFE = !process.execPath.includes(" ");
const STUB_RUNNER = path.join(root, "stub-runner.mjs");
const SLOW_RUNNER = path.join(root, "slow-runner.mjs");
const ECHO_RUNNER = path.join(root, "echo-runner.mjs");

const lockPathFor = (stateDir) =>
  path.join(
    stateDir,
    `exec-${crypto.createHash("sha256").update(path.resolve(checkout)).digest("hex").slice(0, 16)}.lock`,
  );

/** Spawn a server with its own state dir and return a small RPC client. */
function makeClient(extraEnv = {}) {
  const stateDir = fs.mkdtempSync(path.join(root, "state-"));
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, FORK_LOOP_STATE_DIR: stateDir, ...extraEnv },
  });

  let buf = "";
  const pending = new Map();
  let seq = 0;

  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const settlePending = pending.get(msg.id);
      if (settlePending) {
        pending.delete(msg.id);
        settlePending(msg);
      }
    }
  });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  function rpc(method, params) {
    const id = `c${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`rpc ${method} timed out after ${RPC_TIMEOUT_MS}ms — no reply from server`));
      }, RPC_TIMEOUT_MS);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`rpc ${method} failed: ${msg.error.message}`));
        else resolve(msg.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  const client = {
    stateDir,
    mailboxPath: path.join(stateDir, "mailbox.json"),
    lockPath: lockPathFor(stateDir),
    rpc,
    async callTool(name, args) {
      const result = await rpc("tools/call", { name, arguments: args });
      const text = result.content?.[0]?.text;
      assert.equal(typeof text, "string", `tools/call ${name} returned no text content`);
      if (result.isError) return { isError: true, error: text };
      return { isError: false, payload: JSON.parse(text) };
    },
    seedMailbox(entries) {
      fs.writeFileSync(client.mailboxPath, JSON.stringify({ receipts: entries }, null, 2));
    },
    readMailbox() {
      return JSON.parse(fs.readFileSync(client.mailboxPath, "utf8"));
    },
    clearLock() {
      fs.rmSync(client.lockPath, { recursive: true, force: true });
    },
    /** A lock directory exactly as acquireLock leaves it behind. */
    holdLock(taskId = "holder-task") {
      fs.mkdirSync(client.lockPath, { recursive: true });
      fs.writeFileSync(
        path.join(client.lockPath, "task.json"),
        JSON.stringify({ id: taskId, startedAt: Date.now() }),
      );
    },
    /** A lock directory with no holder — the crash-between-mkdir-and-write state. */
    orphanLock(ageMs = 0) {
      fs.mkdirSync(client.lockPath, { recursive: true });
      if (ageMs > 0) {
        const when = new Date(Date.now() - ageMs);
        fs.utimesSync(client.lockPath, when, when);
      }
    },
    stop() {
      if (!child.killed) child.kill();
    },
  };
  return client;
}

function makeEntry(overrides = {}) {
  return {
    task_id: "task-1",
    planner_session: "sess_A",
    topic: "demo",
    checkout,
    state: "pending",
    runner_exit: 0,
    receipt: "SPEC EXECUTION RECEIPT\n\n- Schema: spec-executor-receipt/v2\n- Conclusion: completed\n",
    ...overrides,
  };
}

const clients = [];
const main = makeClient();
clients.push(main);

before(() => {
  assert.ok(fs.existsSync(SERVER), `server not found at ${SERVER}`);
  fs.writeFileSync(
    STUB_RUNNER,
    'process.stdout.write("SPEC EXECUTION RECEIPT\\n\\n- Schema: spec-executor-receipt/v2\\n- Conclusion: completed\\n- Spec source: stub\\n");\n',
  );
  // A runner that never finishes on its own, and leaks a grandchild that
  // inherits its stdio — the shape that can keep `close` from firing.
  //
  // Measured on this machine (win32, node 22): Node closes its side of the pipe
  // as soon as the runner dies, so the grandchild does NOT hold it open and
  // `close` fires anyway. The tree-kill escalation in runHeadless is therefore a
  // backstop for a polite kill that fails to close the stream, not the path this
  // test can force. The test asserts what is deterministic here: the call
  // settles and the failed run reaches the mailbox.
  fs.writeFileSync(
    SLOW_RUNNER,
    [
      'import { spawn } from "node:child_process";',
      'spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "inherit", "inherit"] });',
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
  );

  // Echoes its prompt (which embeds the receipt template) and THEN writes its
  // real result — the shape that makes "first marker wins" extract the template.
  fs.writeFileSync(
    ECHO_RUNNER,
    [
      "const template = [",
      '  "SPEC EXECUTION RECEIPT",',
      '  "",',
      '  "- Schema: spec-executor-receipt/v2",',
      '  "- Conclusion: <exactly one single token: completed | blocked | failed>",',
      '].join("\\n");',
      'process.stdout.write("[runner] instruction follows:\\n" + template + "\\n");',
      'process.stdout.write("\\nSPEC EXECUTION RECEIPT\\n\\n- Schema: spec-executor-receipt/v2\\n- Conclusion: completed\\n- Spec source: echo-stub\\n");',
      "",
    ].join("\n"),
  );
});

after(async () => {
  for (const client of clients) client.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rm(checkout, { recursive: true, force: true });
});

// --- protocol ---------------------------------------------------------------

test("initialize advertises the fork-loop-mcp server on protocol 2024-11-05", async () => {
  const result = await main.rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mailbox-cycle-test", version: "0" },
  });
  assert.equal(result.serverInfo.name, "fork-loop-mcp");
  assert.equal(result.protocolVersion, "2024-11-05");
});

test("tools/list exposes exactly the five pipeline tools", async () => {
  const result = await main.rpc("tools/list", {});
  const names = result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "ack_receipt",
    "check_mailbox",
    "fail_receipt",
    "release_execution",
    "spawn_execution",
  ]);
});

test("an unknown tool is reported as isError, not silently ignored", async () => {
  const { isError, error } = await main.callTool("does_not_exist", {});
  assert.equal(isError, true, "unknown tool must come back as isError");
  assert.match(error, /unknown tool: does_not_exist/);
});

// --- mailbox ----------------------------------------------------------------

test("an empty mailbox yields mail: null", async () => {
  main.seedMailbox([]);
  const { payload } = await main.callTool("check_mailbox", { checkout, planner_session: "sess_A" });
  assert.equal(payload.ok, true);
  assert.equal(payload.mail, null);
});

test("a pending receipt is invisible to a different planner session", async () => {
  main.seedMailbox([makeEntry()]);
  const { payload } = await main.callTool("check_mailbox", {
    checkout,
    planner_session: "sess_other",
  });
  assert.equal(payload.mail, null, "sess_other must not receive sess_A's receipt");
  assert.equal(
    main.readMailbox().receipts[0].state,
    "pending",
    "a non-matching poll must not consume the entry",
  );
});

test("a pending receipt is delivered to its planner session and marked delivered", async () => {
  main.seedMailbox([makeEntry()]);
  const { payload } = await main.callTool("check_mailbox", { checkout, planner_session: "sess_A" });
  assert.ok(payload.mail, "sess_A must receive the receipt");
  assert.equal(payload.mail.task_id, "task-1");
  assert.match(payload.mail.receipt, /Schema: spec-executor-receipt\/v2/);
  assert.equal(
    main.readMailbox().receipts[0].state,
    "delivered",
    "delivery must be persisted, not just returned",
  );
});

test("delivery is exactly-once: a second poll returns null", async () => {
  main.seedMailbox([makeEntry()]);
  const first = await main.callTool("check_mailbox", { checkout, planner_session: "sess_A" });
  assert.ok(first.payload.mail, "first poll should deliver");
  const second = await main.callTool("check_mailbox", { checkout, planner_session: "sess_A" });
  assert.equal(second.payload.mail, null, "second poll must not redeliver");
});

// --- settle + lock scoping --------------------------------------------------

test("ack_receipt settles the entry as done and releases its own lock", async () => {
  main.holdLock("task-1");
  main.seedMailbox([makeEntry()]);
  await main.callTool("check_mailbox", { checkout, planner_session: "sess_A" });

  const { payload } = await main.callTool("ack_receipt", { checkout, task_id: "task-1" });
  assert.equal(payload.ok, true);
  assert.equal(payload.state, "done");
  assert.equal(payload.lock_released, true, "the holder's ack must release the lock");
  assert.equal(main.readMailbox().receipts[0].state, "done");
  assert.equal(fs.existsSync(main.lockPath), false);
});

test("a stale ack for another task must NOT release the live lock", async () => {
  // Execution A crashed, the planner recycled the lock, execution B is running.
  // A's receipt then arrives late and is acknowledged. A used to drop B's lock.
  main.holdLock("task-B");
  main.seedMailbox([makeEntry({ task_id: "task-A" })]);

  const { payload } = await main.callTool("ack_receipt", { checkout, task_id: "task-A" });
  assert.equal(payload.ok, true, "the stale receipt still settles");
  assert.equal(payload.state, "done");
  assert.equal(payload.lock_released, false, "it must not release a lock it does not hold");
  assert.match(payload.lock_note, /task-B/);
  assert.equal(
    fs.existsSync(main.lockPath),
    true,
    "task-B's lock must survive task-A's stale ack",
  );
  main.clearLock();
});

test("ack_receipt rejects an unknown task_id", async () => {
  main.seedMailbox([makeEntry()]);
  const { payload } = await main.callTool("ack_receipt", { checkout, task_id: "no-such-task" });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /unknown task_id no-such-task/);
});

test("fail_receipt settles the entry as failed", async () => {
  main.clearLock();
  main.seedMailbox([makeEntry({ task_id: "task-2" })]);
  const { payload } = await main.callTool("fail_receipt", { checkout, task_id: "task-2" });
  assert.equal(payload.ok, true);
  assert.equal(payload.state, "failed");
  assert.equal(main.readMailbox().receipts[0].state, "failed");
});

test("spawn_execution refuses while the lock is held, and launches nothing", async () => {
  main.holdLock("holder-task");
  main.seedMailbox([]);

  const { payload } = await main.callTool("spawn_execution", {
    checkout,
    planner_session: "sess_A",
    spec_ready: SPEC_READY,
  });

  assert.equal(payload.ok, false, "spawn must be refused under an active lock");
  assert.match(payload.error, /locked by an active execution/);
  assert.equal(payload.holder.id, "holder-task", "the refusal must name the current holder");
  assert.deepEqual(
    main.readMailbox().receipts,
    [],
    "a refused spawn must not have launched a runner (no new mailbox entry)",
  );
  assert.equal(fs.existsSync(main.lockPath), true, "a refused spawn must not release the lock");
});

test("spawn_execution refuses a spec that is not a SPEC READY block", async () => {
  main.clearLock();
  main.seedMailbox([]);
  const { payload } = await main.callTool("spawn_execution", {
    checkout,
    planner_session: "sess_A",
    spec_ready: "just some notes, no contract here",
  });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /spec_ready must contain the complete SPEC READY block/);
  assert.equal(fs.existsSync(main.lockPath), false, "a rejected spawn must not leave a lock behind");
});

test("a lock with no recorded holder is refused, never stolen", async () => {
  // The window between mkdir and the task.json write: a competing acquire used to
  // read startedAt as 0, call the brand-new lock infinitely old, and take it.
  main.clearLock();
  main.orphanLock(0);
  main.seedMailbox([]);

  const { payload } = await main.callTool("spawn_execution", {
    checkout,
    planner_session: "sess_A",
    spec_ready: SPEC_READY,
  });

  assert.equal(payload.ok, false, "an unheld-but-present lock must still refuse");
  assert.match(payload.error, /locked by an active execution/);
  assert.deepEqual(main.readMailbox().receipts, [], "nothing may be launched");
  assert.equal(fs.existsSync(main.lockPath), true, "the lock must not be broken by a racer");
});

test("release_execution refuses without a task_id or force", async () => {
  main.clearLock();
  main.holdLock("holder-task");
  const { payload } = await main.callTool("release_execution", { checkout });
  assert.equal(payload.ok, false, "a bare recovery call must not be able to drop a live lock");
  assert.match(payload.error, /force:true/);
  assert.equal(fs.existsSync(main.lockPath), true, "the lock must survive the refusal");
});

test("release_execution drops the lock when the task_id matches", async () => {
  main.holdLock("holder-task");
  const { payload } = await main.callTool("release_execution", {
    checkout,
    task_id: "holder-task",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.released, true);
  assert.equal(fs.existsSync(main.lockPath), false);
});

test("release_execution reports no lock rather than throwing, and force is idempotent", async () => {
  main.clearLock();
  const bare = await main.callTool("release_execution", { checkout });
  assert.equal(bare.payload.ok, true);
  assert.equal(bare.payload.released, false);
  assert.match(bare.payload.note, /no lock held/);

  main.holdLock("holder-task");
  const forced = await main.callTool("release_execution", { checkout, force: true });
  assert.equal(forced.payload.ok, true);
  assert.equal(forced.payload.released, true);
  assert.equal(forced.payload.forced, true);
  assert.equal(fs.existsSync(main.lockPath), false);
});

// --- full spawn cycle against a stub runner ---------------------------------

test(
  "spawn_execution runs the contract end to end: lock, receipt, mailbox, ack",
  { skip: SPLIT_SAFE ? false : "process.execPath contains a space; FORK_LOOP_ZCODE_CMD cannot be split" },
  async () => {
    const stub = makeClient({ FORK_LOOP_ZCODE_CMD: `${process.execPath} ${STUB_RUNNER}` });
    clients.push(stub);

    const spawnResult = await stub.callTool("spawn_execution", {
      checkout,
      planner_session: "sess_A",
      spec_ready: SPEC_READY,
    });

    assert.equal(spawnResult.payload.ok, true, "spawn must succeed against a working runner");
    assert.equal(spawnResult.payload.receipt_extracted, true, "the stub's receipt must be parsed");
    assert.equal(fs.existsSync(stub.lockPath), true, "a live execution holds the lock");

    const box = stub.readMailbox();
    assert.equal(box.receipts.length, 1, "one run produces exactly one mailbox entry");
    assert.equal(box.receipts[0].state, "pending");
    assert.match(box.receipts[0].receipt, /Conclusion: completed/);

    const mail = await stub.callTool("check_mailbox", { checkout, planner_session: "sess_A" });
    assert.ok(mail.payload.mail, "the planner must receive the receipt");

    const ack = await stub.callTool("ack_receipt", {
      checkout,
      task_id: spawnResult.payload.task_id,
    });
    assert.equal(ack.payload.lock_released, true, "ack must hand the checkout back");
    assert.equal(fs.existsSync(stub.lockPath), false);
  },
);

test(
  "an orphan lock past the grace is broken and the run proceeds",
  { skip: SPLIT_SAFE ? false : "process.execPath contains a space" },
  async () => {
    const stub = makeClient({ FORK_LOOP_ZCODE_CMD: `${process.execPath} ${STUB_RUNNER}` });
    clients.push(stub);

    stub.orphanLock(30 * 60 * 1000); // 30min: past ORPHAN_LOCK_MS, no holder recorded

    const { payload } = await stub.callTool("spawn_execution", {
      checkout,
      planner_session: "sess_A",
      spec_ready: SPEC_READY,
    });

    assert.equal(payload.ok, true, "a genuinely abandoned lock must not deadlock the checkout");
    const holder = JSON.parse(fs.readFileSync(path.join(stub.lockPath, "task.json"), "utf8"));
    assert.equal(holder.id, payload.task_id, "the new execution must own the lock");
  },
);

test(
  "a runner that overruns the timeout is killed and the call still settles",
  { skip: SPLIT_SAFE ? false : "process.execPath contains a space" },
  async () => {
    // Before the fix the timeout only called child.kill() and never settled the
    // promise by itself: if the stream stayed open, spawn_execution never
    // returned and the checkout stayed locked until the 6h sweep. Now the kill
    // is followed by a grace and an unconditional settle.
    const slow = makeClient({
      FORK_LOOP_ZCODE_CMD: `${process.execPath} ${SLOW_RUNNER}`,
      FORK_LOOP_RUNNER_TIMEOUT_MS: "300",
      FORK_LOOP_KILL_GRACE_MS: "700",
    });
    clients.push(slow);

    const { payload } = await slow.callTool("spawn_execution", {
      checkout,
      planner_session: "sess_A",
      spec_ready: SPEC_READY,
    });

    assert.equal(payload.ok, true, "the call must return, not hang on a killed runner");
    assert.equal(payload.receipt_extracted, false, "a killed runner produces no receipt");
    assert.equal(payload.runner_exit, null, "a runner terminated by the timeout carries no exit code");

    const box = slow.readMailbox();
    assert.equal(box.receipts.length, 1, "the overrun run must be recorded for the planner");
    assert.equal(box.receipts[0].receipt, null, "no receipt can be extracted from nothing");

    // And the planner can hand the checkout back rather than being stuck.
    const ack = await slow.callTool("fail_receipt", {
      checkout,
      task_id: payload.task_id,
    });
    assert.equal(ack.payload.lock_released, true, "the lock must be releasable after an overrun");
    assert.equal(fs.existsSync(slow.lockPath), false);
  },
);

// --- extraction and advertised contract -------------------------------------

test(
  "extractReceipt takes the runner's result, not an echoed template",
  { skip: SPLIT_SAFE ? false : "process.execPath contains a space" },
  async () => {
    // The launch prompt embeds a receipt template under the same heading. With
    // "first marker wins", a runner that echoed its prompt had the *template*
    // stored as its receipt — and the template satisfies the schema check, so
    // the gates then rejected real work for an invisible reason.
    const echo = makeClient({ FORK_LOOP_ZCODE_CMD: `${process.execPath} ${ECHO_RUNNER}` });
    clients.push(echo);

    const { payload } = await echo.callTool("spawn_execution", {
      checkout,
      planner_session: "sess_A",
      spec_ready: SPEC_READY,
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.receipt_extracted, true);

    const stored = echo.readMailbox().receipts[0].receipt;
    assert.match(stored, /- Conclusion: completed/, "the runner's own block must be extracted");
    assert.doesNotMatch(
      stored,
      /<exactly one single token/,
      "the echoed template must never be stored as the receipt",
    );
  },
);

test("spawn_execution does not advertise an option it cannot honour", async () => {
  const result = await main.rpc("tools/list", {});
  const spawn = result.tools.find((t) => t.name === "spawn_execution");
  assert.ok(spawn, "spawn_execution must be listed");
  const props = Object.keys(spawn.inputSchema.properties || {});
  assert.ok(
    !props.includes("max_turns"),
    "max_turns was advertised but never reached argv — the runner aborts on --max-turns with 'Unknown option', so the cap could never be honoured",
  );
});

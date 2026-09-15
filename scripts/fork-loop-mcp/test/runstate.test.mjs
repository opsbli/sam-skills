// runstate — unit tests for the shared read model.
//
// These pin down the properties three surfaces depend on: `check_status`, the
// `status.mjs` CLI and the web board all render `buildReport`, so a wrong
// liveness answer or a mis-derived phase is wrong in three places at once.
//
// The liveness rules get the most attention because they are the ones that
// mislead an operator: an unrecorded pid must read `unknown` (never `alive`),
// and a dead runner under a live supervisor is a state that resolves itself,
// not a leak.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildReport,
  derivePhase,
  formatReport,
  humanDuration,
  lockVerdict,
  parseReceiptSpecSource,
  parseSpecSource,
  pidAlive,
  readTail,
  recentFiles,
  stateRoot,
  taskList,
} from "../runstate.mjs";

function tmpdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** A pid that is certainly not running: spawn something short and wait for it. */
function deadPid() {
  try {
    const child = spawn(process.execPath, ["-e", "0"], { stdio: "ignore", windowsHide: true });
    const pid = child.pid;
    spawnSync(process.execPath, ["-e", "setTimeout(()=>{},150)"], { stdio: "ignore" });
    try {
      process.kill(pid, 0);
      child.kill("SIGKILL");
      return null; // could not stage a dead pid; callers should skip
    } catch {
      return pid;
    }
  } catch {
    return null;
  }
}

function withStateDir(dir, body) {
  const previous = process.env.FORK_LOOP_STATE_DIR;
  process.env.FORK_LOOP_STATE_DIR = dir;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.FORK_LOOP_STATE_DIR;
    else process.env.FORK_LOOP_STATE_DIR = previous;
  }
}

/** The lock name runstate derives from a checkout path, rebuilt for fixtures. */
function lockName(checkout) {
  return `exec-${crypto.createHash("sha256").update(path.resolve(checkout)).digest("hex").slice(0, 16)}.lock`;
}

function writeLock(stateDir, checkout, holder) {
  const lock = path.join(stateDir, lockName(checkout));
  fs.mkdirSync(lock, { recursive: true });
  if (holder) fs.writeFileSync(path.join(lock, "task.json"), JSON.stringify(holder));
  return lock;
}

test("pidAlive answers true, false and unknown — and never guesses", () => {
  assert.equal(pidAlive(process.pid), true, "this process is alive");

  const dead = deadPid();
  if (dead === null) {
    assert.ok(true, "skipped: could not stage a dead pid on this platform");
  } else {
    assert.equal(pidAlive(dead), false, "a finished process must read as gone");
  }

  assert.equal(pidAlive(undefined), null, "an unrecorded pid is unknown, not alive");
  assert.equal(pidAlive(0), null);
  assert.equal(pidAlive(-1), null);
  assert.equal(pidAlive("8396"), null, "a string pid is unknown, not a number to coerce");
});

test("readTail returns the last lines, whole, whether or not it had to seek", () => {
  const dir = tmpdir("runstate-tail-");
  const small = path.join(dir, "small.log");
  fs.writeFileSync(small, ["one", "two", "three", "four", "five"].join("\n"));

  assert.deepEqual(readTail(small, { maxLines: 2 }), ["four", "five"]);
  assert.deepEqual(readTail(small, { maxLines: 99 }), ["one", "two", "three", "four", "five"]);
  assert.equal(readTail(path.join(dir, "absent.txt"), { maxLines: 5 }), null);

  // Force a seek: the first line of the read lands mid-line and must be dropped,
  // never served as if it were a line of the file.
  const big = path.join(dir, "big.log");
  const lines = [];
  for (let i = 0; i < 400; i += 1) lines.push(`line-${i}`);
  fs.writeFileSync(big, lines.join("\n"));
  const tail = readTail(big, { maxLines: 3, maxChars: 60 });
  assert.equal(tail.length, 3);
  for (const line of tail) {
    assert.match(line, /^line-\d+$/, `a partial line leaked out of readTail: ${JSON.stringify(line)}`);
  }
});

test("recentFiles respects the window and skips the trees nobody wants scanned", () => {
  const dir = tmpdir("runstate-activity-");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "fresh.ts"), "export {};\n");
  fs.writeFileSync(path.join(dir, "node_modules", "pkg", "fresh.js"), "x\n");
  fs.writeFileSync(path.join(dir, ".git", "fresh"), "x\n");

  const old = path.join(dir, "src", "stale.ts");
  fs.writeFileSync(old, "export {};\n");
  const when = new Date(Date.now() - 6 * 60 * 60 * 1000);
  fs.utimesSync(old, when, when);

  const { files } = recentFiles(dir, { sinceMs: 60 * 60 * 1000 });
  const names = files.map((f) => path.relative(dir, f.path).replace(/\\/g, "/"));

  assert.deepEqual(names, ["src/fresh.ts"], `unexpected activity set: ${names.join(", ")}`);
});

test("lockVerdict distinguishes free, no-holder and a dead runner under a live supervisor", () => {
  const checkout = tmpdir("runstate-lock-");
  const stateDir = tmpdir("runstate-state-");

  withStateDir(stateDir, () => {
    assert.equal(lockVerdict(checkout).state, "free");

    const lock = writeLock(stateDir, checkout, null);
    assert.equal(lockVerdict(checkout).state, "no-holder");

    fs.writeFileSync(
      path.join(lock, "task.json"),
      JSON.stringify({ id: "t1", pid: process.pid, runner_pid: null, startedAt: Date.now() }),
    );
    const active = lockVerdict(checkout);
    assert.equal(active.state, "active");
    assert.equal(active.supervisorAlive, true);
    assert.equal(active.runnerAlive, null, "no recorded runner pid must be unknown");

    const dead = deadPid();
    if (dead !== null) {
      fs.writeFileSync(
        path.join(lock, "task.json"),
        JSON.stringify({ id: "t1", pid: process.pid, runner_pid: dead, startedAt: Date.now() }),
      );
      const settling = lockVerdict(checkout);
      assert.equal(settling.runnerAlive, false);
      assert.equal(settling.state, "settling", "a fresh runner death is inside the recording grace");
    }
  });
});

test("stateRoot is the one place the state directory is decided", () => {
  const checkout = tmpdir("runstate-root-");
  const override = tmpdir("runstate-root-override-");

  delete process.env.FORK_LOOP_STATE_DIR;
  assert.equal(stateRoot(checkout), path.join(checkout, ".zcode", "fork-loop"));

  withStateDir(override, () => {
    assert.equal(stateRoot(checkout), override, "the override wins, for tests and for CI");
  });
  assert.equal(stateRoot(checkout), path.join(checkout, ".zcode", "fork-loop"), "and it restores");
});

test("derivePhase answers the operator's question in one word", () => {
  const free = { present: false, state: "free" };
  assert.equal(derivePhase({ lock: free, run: null, mailbox: { receipts: [] } }), "idle");

  assert.equal(
    derivePhase({
      lock: free,
      run: null,
      mailbox: { receipts: [{ task_id: "a", state: "pending", receipt: "SPEC EXECUTION RECEIPT" }] },
    }),
    "receipt-ready",
    "a pending receipt outranks the lock being gone",
  );

  assert.equal(
    derivePhase({
      lock: free,
      run: null,
      mailbox: { receipts: [{ task_id: "a", state: "pending", receipt: null }] },
    }),
    "finished-no-receipt",
    "a queued mailbox entry with no body is not a receipt — a run that died mid-flight leaves exactly that",
  );

  assert.equal(
    derivePhase({
      lock: { present: true, state: "active", holder: {} },
      run: { started_at: Date.now() },
      mailbox: { receipts: [] },
    }),
    "running",
  );

  assert.equal(
    derivePhase({
      lock: { present: true, state: "active", holder: {} },
      run: { started_at: Date.now() - 30 * 60 * 1000, updated_at: Date.now() - 30 * 60 * 1000 },
      mailbox: { receipts: [] },
    }),
    "stalled",
    "no signal well beyond the stall window is a warning, not a healthy run",
  );

  assert.equal(
    derivePhase({ lock: { present: true, state: "orphaned" }, run: null, mailbox: { receipts: [] } }),
    "orphaned",
  );
});

test("taskList joins what only the lock, the journal and the mailbox each know", () => {
  // The failure this prevents: a board reading one source shows a list missing
  // precisely the task the operator is looking for. The live-ops case was a run
  // whose only trace was the lock — no journal entry, no mailbox entry.
  const checkout = tmpdir("runstate-tasks-");
  const stateDir = tmpdir("runstate-tasks-state-");

  withStateDir(stateDir, () => {
    writeLock(stateDir, checkout, {
      id: "live-only",
      topic: "lock only",
      planner_session: "sess_A",
      pid: process.pid,
      runner_pid: process.pid,
      startedAt: Date.now() - 60_000,
    });
    fs.mkdirSync(path.join(checkout, "src"), { recursive: true });
    fs.writeFileSync(path.join(checkout, "src", "fresh.ts"), "export {};\n");

    const tasks = taskList(checkout);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].task_id, "live-only");
    assert.deepEqual(tasks[0].sources, ["lock"], "nothing else knows about this run yet");
    assert.equal(tasks[0].in_flight, true);
    assert.equal(
      tasks[0].phase,
      "running",
      "a lock plus files being written is a working run, not a stall",
    );

    // Now give the same task a finished sibling in each other source.
    fs.writeFileSync(
      path.join(stateDir, "state.json"),
      JSON.stringify({
        runs: [
          { task_id: "live-only", started_at: Date.now() - 60_000, status: "running" },
          { task_id: "journal-only", topic: "j", started_at: Date.now() - 300_000, status: "finished", receipt_present: false },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(stateDir, "mailbox.json"),
      JSON.stringify({
        receipts: [
          {
            task_id: "mailbox-only",
            topic: "m",
            state: "pending",
            finishedAt: Date.now() - 120_000,
            receipt: "SPEC EXECUTION RECEIPT",
          },
        ],
      }),
    );

    const joined = taskList(checkout);
    const byId = Object.fromEntries(joined.map((t) => [t.task_id, t]));

    assert.equal(joined.length, 3, `expected three tasks, got ${joined.map((t) => t.task_id)}`);
    assert.deepEqual(byId["live-only"].sources.sort(), ["journal", "lock"]);
    assert.equal(byId["live-only"].phase, "running", "a live lock outranks the journal's last word");
    assert.equal(byId["journal-only"].phase, "finished-no-receipt");
    assert.equal(byId["mailbox-only"].phase, "receipt-ready", "a pending receipt is the operator's cue");
    assert.equal(byId["mailbox-only"].receipt_present, true);

    // Newest first, so the live run leads.
    assert.equal(joined[0].task_id, "live-only");
  });
});

test("a task with no signal for the stall window is stalled, not conveniently running", () => {
  const checkout = tmpdir("runstate-stall-");
  const stateDir = tmpdir("runstate-stall-state-");

  withStateDir(stateDir, () => {
    writeLock(stateDir, checkout, {
      id: "quiet",
      pid: process.pid,
      startedAt: Date.now() - 30 * 60 * 1000,
    });
    const tasks = taskList(checkout);
    assert.equal(tasks[0].phase, "stalled");
    assert.equal(
      buildReport(checkout).phase,
      "stalled",
      "the checkout phase must agree with the task it is summarising",
    );
  });
});

test("parseSpecSource reads the join key, and only from the SPEC READY block", () => {
  const block = [
    "# Slice 02 — walking skeleton",
    "",
    "- Source: not-this-one.md",
    "",
    "SPEC READY",
    "",
    "- Status: ready for implementation",
    "- Source: `.scratch/watermark-pipeline/slice-02-walking-skeleton.md`",
    "  （父 spec：.scratch/watermark-pipeline/spec.md）",
    "- Next route: fork + /spec-executor",
  ].join("\n");

  assert.equal(
    parseSpecSource(block),
    ".scratch/watermark-pipeline/slice-02-walking-skeleton.md",
    "backticks stripped, path taken, the parenthetical continuation ignored",
  );
  assert.equal(parseSpecSource("no marker here\n- Source: x.md"), "x.md");
  assert.equal(parseSpecSource("SPEC READY\n\n- Status: ready"), null);
  assert.equal(parseSpecSource(""), null);
  assert.equal(parseSpecSource(null), null);

  assert.equal(
    parseReceiptSpecSource("SPEC EXECUTION RECEIPT\n\n- Spec source: .scratch/a/b.md\n"),
    ".scratch/a/b.md",
    "the receipt spells the field differently, so it gets its own reader",
  );
});

test("pipeline lists planned work with a stage, including what has not started", () => {
  const checkout = tmpdir("runstate-pipe-");
  const stateDir = tmpdir("runstate-pipe-state-");

  fs.mkdirSync(path.join(checkout, ".scratch", "feature-a", "issues"), { recursive: true });
  fs.mkdirSync(path.join(checkout, ".scratch", "feature-b"), { recursive: true });
  fs.writeFileSync(path.join(checkout, ".scratch", "feature-a", "spec.md"), "# Feature A spec\n");
  fs.writeFileSync(path.join(checkout, ".scratch", "feature-a", "issues", "01-first.md"), "# First ticket\n");
  fs.writeFileSync(
    path.join(checkout, ".scratch", "feature-b", "slice.md"),
    "# Slice B\n\nSPEC READY\n\n- Source: .scratch/feature-b/slice.md\n",
  );

  withStateDir(stateDir, () => {
    // An in-flight run whose only record is the lock and its launch prompt —
    // the case a real run hit, started before the journal recorded spec sources.
    writeLock(stateDir, checkout, { id: "run-b", pid: process.pid, startedAt: Date.now() - 1000 });
    fs.writeFileSync(
      path.join(stateDir, "prompt-run-b.md"),
      "# launch\n\nSPEC READY\n\n- Source: .scratch/feature-b/slice.md\n",
    );

    const report = buildReport(checkout);
    const byPath = Object.fromEntries(report.pipeline.items.map((item) => [item.path, item]));

    assert.equal(report.pipeline.present, true);
    assert.equal(report.pipeline.items.length, 3);
    assert.equal(byPath[".scratch/feature-a/spec.md"].stage, "spec", "a spec with nothing executed yet");
    assert.equal(byPath[".scratch/feature-a/issues/01-first.md"].stage, "ticketed");
    assert.equal(byPath[".scratch/feature-a/issues/01-first.md"].kind, "ticket");
    assert.equal(
      byPath[".scratch/feature-b/slice.md"].stage,
      "executing",
      "the running task names it, so the planned item shows as executing",
    );
    assert.equal(byPath[".scratch/feature-b/slice.md"].has_spec_ready, true);
    assert.equal(report.pipeline.stages.executing, 1);
    assert.match(formatReport(report), /流水线/);
  });
});

test("a queued mailbox entry with no receipt body is reported as a failure, not as a receipt", () => {
  // The real case: a runner died on a model API error after 90 minutes of work.
  // The transport still queues an entry (it has a raw tail to hand over), and
  // calling that "receipt waiting" sends the operator to collect nothing.
  const checkout = tmpdir("runstate-noreceipt-");
  const stateDir = tmpdir("runstate-noreceipt-state-");

  withStateDir(stateDir, () => {
    fs.writeFileSync(
      path.join(stateDir, "mailbox.json"),
      JSON.stringify({
        receipts: [
          {
            task_id: "died-mid-flight",
            topic: "watermark walking skeleton",
            state: "pending",
            receipt: null,
            runner_exit: null,
            raw_output_tail: "AI_APICallError: ... isRetryable: true",
            finishedAt: Date.now() - 60_000,
          },
        ],
      }),
    );

    const report = buildReport(checkout);
    assert.equal(report.tasks[0].phase, "finished-no-receipt");
    assert.equal(report.tasks[0].receipt_present, false);
    assert.equal(report.phase, "finished-no-receipt", "the headline must agree");
    assert.equal(report.pendingReceipts, 0, "no receipt is waiting, so nothing is pending archival");
    assert.equal(report.noReceipt, 1, "but the failure must be counted, not hidden");
    assert.equal(report.needsRecovery, 0, "no lock stands here, so nothing needs recovering");
    assert.match(formatReport(report), /无回执结束/);
  });
});

test("a lock standing over a finished run is reported as needing recovery", () => {
  // The leak this catches: a run ends without a receipt, so no ack will ever
  // arrive, so the lock waits for an explicit release or the six-hour sweep —
  // during which the next execution is refused. The board said "active" and
  // "executing" through all of it.
  const checkout = tmpdir("runstate-recover-");
  const stateDir = tmpdir("runstate-recover-state-");

  withStateDir(stateDir, () => {
    writeLock(stateDir, checkout, {
      id: "died-no-receipt",
      pid: process.pid,
      runner_pid: 999999, // not running: the runner is gone
      startedAt: Date.now() - 45 * 60 * 1000,
    });
    fs.writeFileSync(
      path.join(stateDir, "mailbox.json"),
      JSON.stringify({
        receipts: [{ task_id: "died-no-receipt", state: "pending", receipt: null, runner_exit: null }],
      }),
    );

    const report = buildReport(checkout);
    assert.equal(report.needsRecovery, 1);
    assert.equal(report.tasks[0].needs_recovery, true);
    assert.equal(report.lock.present, true, "the lock really is still standing");
    assert.match(formatReport(report), /锁未回收/);
  });
});

test("buildReport is the single shape the CLI, the board and the MCP tool render", () => {
  const checkout = tmpdir("runstate-report-");
  const stateDir = tmpdir("runstate-report-state-");

  withStateDir(stateDir, () => {
    fs.mkdirSync(path.join(checkout, "src"), { recursive: true });
    fs.writeFileSync(path.join(checkout, "src", "work.ts"), "export const x = 1;\n");
    const lock = writeLock(stateDir, checkout, {
      id: "task-1",
      topic: "demo",
      planner_session: "sess_A",
      pid: process.pid,
      runner_pid: process.pid,
      startedAt: Date.now() - 5000,
    });
    fs.mkdirSync(path.dirname(path.join(stateDir, "state.json")), { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, "state.json"),
      JSON.stringify({
        runs: [
          {
            task_id: "task-1",
            topic: "demo",
            status: "running",
            started_at: Date.now() - 5000,
            updated_at: Date.now() - 1000,
            log: path.join(stateDir, "runs", "task-1.log"),
            receipt_present: false,
          },
        ],
      }),
    );
    fs.mkdirSync(path.join(stateDir, "runs"), { recursive: true });
    fs.writeFileSync(path.join(stateDir, "runs", "task-1.log"), "reading spec\nediting files\n");

    const report = buildReport(checkout, { logTailLines: 5 });

    assert.equal(report.checkout, checkout);
    assert.equal(report.phase, "running");
    assert.equal(report.lock.present, true);
    assert.equal(report.lock.holder.task_id, "task-1");
    assert.equal(report.lock.holder.runner_pid, process.pid);
    assert.equal(report.run.task_id, "task-1");
    assert.equal(report.run.log, path.join(stateDir, "runs", "task-1.log"));
    assert.equal(report.mailbox.length, 0);
    assert.equal(report.tasks.length, 1, "the report carries the task list, not just the newest run");
    assert.equal(report.tasks[0].task_id, "task-1");
    assert.deepEqual(report.tasks[0].sources.sort(), ["journal", "lock"]);
    assert.equal(report.pendingReceipts, 0);
    assert.equal(report.logTail.lines.includes("editing files"), true);
    assert.equal(report.activity.files.length >= 1, true);
    assert.equal(typeof formatReport(report), "string");
    assert.match(formatReport(report), /任务列表/, "the CLI must print the list too, not only the board");

    // and it must survive a torn state directory rather than throwing
    fs.writeFileSync(path.join(stateDir, "state.json"), "{ not json");
    assert.equal(buildReport(checkout).run, null, "a malformed journal is an absent journal");
    assert.equal(fs.existsSync(lock), true, "reading must never touch the lock");
  });
});

test("humanDuration always carries seconds, so a live duration cannot look frozen", () => {
  assert.equal(humanDuration(0), "0s");
  assert.equal(humanDuration(45_000), "45s");
  assert.equal(humanDuration(90_000), "1m30s");
  assert.equal(
    humanDuration(3 * 3600_000 + 25 * 60_000),
    "3h25m0s",
    "an hour-plus duration keeps its seconds: at minute granularity the display holds still for 60s at a time, which reads as a board that stopped updating",
  );
  assert.equal(humanDuration(Number.NaN), "0s");
});

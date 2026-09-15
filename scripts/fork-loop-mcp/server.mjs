#!/usr/bin/env node
/**
 * fork-loop-mcp — ZCode fork-loop transport (ADR 0005).
 *
 * MCP stdio server with seven tools:
 *   spawn_execution  — machine-lock the checkout, launch `zcode -p` headless with the
 *                      SPEC READY contract as the launch prompt, and return as soon as
 *                      the runner has started. The receipt is appended to the mailbox
 *                      when the runner exits, long after this call returned.
 *   check_mailbox    — return receipts addressed to a planner session (pending first).
 *   check_status     — what is happening right now: phase, both pids and their
 *                      liveness, recent file activity, log tail, mailbox.
 *   ack_receipt      — mark a receipt done (planner accepted it); releases the lock.
 *   fail_receipt     — mark a receipt failed (validation could not proceed); releases the lock.
 *   cancel_execution — kill the runner tree and release the lock, for a runaway run.
 *   release_execution — drop the machine lock without a receipt (recovery path). It
 *                      refuses while the execution is still alive; cancel first.
 *
 * Zero dependencies: speaks JSON-RPC 2.0 over stdio by hand.
 * The runner session needs no MCP client — the transport owns its lifecycle.
 * Paths, locks, the mailbox and the run journal come from ./runstate.mjs, shared
 * with status.mjs and dashboard.mjs so the three surfaces cannot disagree.
 */


import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  buildReport,
  failureLogFile,
  loadRunState,
  lockFile,
  lockHolder,
  mailboxFile,
  parseSpecSource,
  pidAlive,
  promptFile,
  readJson,
  readTail,
  runLogFile,
  runStateFile,
  writeJson,
} from './runstate.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'fork-loop-mcp', version: '1.0.0' };
const RECEIPT_MARKER = 'SPEC EXECUTION RECEIPT';
// The mailbox accepts only a receipt carrying the contract's Schema first
// field. This constant named v1 while the launch prompt wrote v2 — and nothing
// read it, so any old-schema block was stored as a valid receipt. Now it is
// enforced: an unversioned or stale block is not a receipt, and spawn_execution
// reports receipt_extracted:false with the raw tail for the planner to inspect.
const RECEIPT_SCHEMA_LINE = /^\s*-\s*Schema:\s*spec-executor-receipt\/v2\s*$/im;

/**
 * A nested server is the plugin's MCP entry loading *inside* the execution
 * session the plugin itself spawned. The runner has no business starting
 * executions — it implements one — so the flag makes the refusal explicit
 * instead of leaving a second locked checkout as an operator's only clue.
 */
const NESTED_ENV = 'FORK_LOOP_NESTED';
const isNested = () => process.env[NESTED_ENV] === '1';

/** Resolve the CLI entry: env override wins, else the desktop-install default. */
function resolveCliCommand(env) {
  if (env.FORK_LOOP_ZCODE_CMD) return env.FORK_LOOP_ZCODE_CMD;
  return 'node D:/softs/ZCode/resources/glm/zcode.cjs';
}

/**
 * Machine lock for the single-active-execution-thread guard.
 *
 * mkdir is atomic on all platforms, so the directory *is* the mutex. Two ways
 * that mutex used to leak are closed here:
 *
 *  - `task.json` is written *after* the mkdir lands, so a competing acquire can
 *    observe a lock directory with no holder yet. Reading that as
 *    `startedAt: 0` made a brand-new lock look infinitely old, and the loser
 *    broke it and took it — two executions on one checkout. A missing holder is
 *    no longer read as a fabricated timestamp: it falls back to the directory's
 *    own mtime and needs a much longer, deliberately conservative grace. A crash
 *    between mkdir and write is the only way to produce that state, so the
 *    longer grace costs a crash recovery 15 minutes and buys back the mutex.
 *  - release was unconditional, so a late ack/fail belonging to an
 *    already-settled task could drop the *current* execution's lock. Release is
 *    now scoped to the task that actually holds it.
 */
const STALE_LOCK_MS = 6 * 60 * 60 * 1000; // holder recorded, older than 6h
const ORPHAN_LOCK_MS = 15 * 60 * 1000; // no holder recorded, dir untouched 15m

/**
 * True when the process that owns the receipt is not running.
 *
 * `kill(pid, 0)` is the portable probe: ESRCH means gone, EPERM means alive but
 * owned by someone else. Only applied when the lock actually recorded a pid — a
 * legacy holder without one falls through to the time-based sweep rather than
 * being broken on a guess.
 *
 * The pid that matters is the *supervisor's*: it owns the mailbox write, so a
 * lock is only unrecoverable once that process is gone. The runner's pid is
 * recorded beside it for observability (`runner_pid`) and is deliberately not
 * consulted here — a dead runner with a live supervisor is a run that resolves
 * on its own when the exit handler fires.
 */
function holderProcessIsGone(holder) {
  return pidAlive(holder && holder.pid) === false;
}

/** Age of a lock in ms: the holder's clock when recorded, else the directory's. */
function lockAge(file) {
  const holder = lockHolder(file);
  if (holder && Number(holder.startedAt) > 0) return Date.now() - Number(holder.startedAt);
  try {
    return Date.now() - fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function acquireLock(checkout, task) {
  const file = lockFile(checkout);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.mkdirSync(file);
  } catch {
    const holder = lockHolder(file);
    // A holder whose process is gone is stale no matter how recently it was
    // written: the run that was supposed to produce a receipt cannot produce
    // one any more. PID reuse is the only way a dead holder looks alive, and
    // the time-based sweep still bounds that.
    const holderIsDead = holderProcessIsGone(holder);
    const limit = holder ? STALE_LOCK_MS : ORPHAN_LOCK_MS;
    if (holderIsDead || lockAge(file) > limit) {
      fs.rmSync(file, { recursive: true, force: true });
      try {
        fs.mkdirSync(file);
      } catch {
        return { ok: false, holder: lockHolder(file) || {} };
      }
    } else {
      return { ok: false, holder: holder || { note: 'lock present but no holder recorded' } };
    }
  }
  writeJson(path.join(file, 'task.json'), { ...task, pid: process.pid });
  return { ok: true };
}

/** Drop the lock only when `taskId` is the execution that holds it. */
function releaseLockIfHeldBy(checkout, taskId) {
  const file = lockFile(checkout);
  if (!fs.existsSync(file)) return { released: false, reason: 'no lock held' };
  const holder = lockHolder(file);
  if (!holder) {
    return { released: false, reason: 'lock has no recorded holder; refusing to drop it' };
  }
  if (holder.id !== taskId) {
    return { released: false, reason: `lock is held by ${holder.id}, not ${taskId}` };
  }
  fs.rmSync(file, { recursive: true, force: true });
  return { released: true };
}

/** Unconditional drop — reachable only through the explicit recovery tool. */
function releaseLock(checkout) {
  fs.rmSync(lockFile(checkout), { recursive: true, force: true });
}

/**
 * Best-effort sidecar log next to the mailbox, for failures that would
 * otherwise be visible only on a stderr nobody is watching. The status CLI and
 * the dashboard read it back, so it is a surface and not just a funeral note.
 */
function logFailure(checkout, message) {
  try {
    fs.appendFileSync(
      failureLogFile(checkout),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    /* the disk is the thing that failed; there is nowhere left to say so */
  }
}

/**
 * Append or update one task's row in the run journal (`state.json`).
 *
 * The journal is what makes an in-flight run legible: `spawn_execution` used to
 * leave only a lock directory and a prompt dump, so nothing could distinguish a
 * working runner from one that died. Bounded to the last 50 runs — it is a
 * window onto recent activity, not an audit trail (receipts are the audit
 * trail, and `docs/metrics.md` is the ledger).
 */
const RUN_JOURNAL_LIMIT = 50;

function upsertRun(checkout, patch) {
  let state;
  try {
    state = loadRunState(checkout);
    const index = state.runs.findIndex((run) => run.task_id === patch.task_id);
    const now = Date.now();
    if (index >= 0) {
      state.runs[index] = { ...state.runs[index], ...patch, updated_at: now };
    } else {
      state.runs.push({ started_at: now, updated_at: now, ...patch });
    }
    if (state.runs.length > RUN_JOURNAL_LIMIT) {
      state.runs = state.runs.slice(-RUN_JOURNAL_LIMIT);
    }
    writeJson(runStateFile(checkout), state);
  } catch (error) {
    // Losing the journal costs observability, not correctness: the lock, the
    // receipt and the mailbox all still work. Say so instead of taking down the
    // spawn that is already running.
    logFailure(checkout, `could not write run journal for ${patch.task_id}: ${error && error.message}`);
  }
}

/**
 * Attach the runner's pid to the lock holder once the child exists.
 *
 * The lock is taken before the spawn — it has to be, or two spawns could race
 * past it — so `acquireLock` can only record the supervisor. Without this write
 * the holder names the MCP server, and every liveness probe afterwards answers
 * for the wrong process: a crashed runner stays invisible until the six-hour
 * sweep. Scoped to the task that holds the lock so a late update cannot
 * relabel someone else's execution.
 */
function recordRunnerPid(checkout, taskId, runnerPid) {
  const file = lockFile(checkout);
  const holder = lockHolder(file);
  if (!holder || holder.id !== taskId) return false;
  writeJson(path.join(file, 'task.json'), { ...holder, runner_pid: runnerPid });
  return true;
}

function loadMailbox(checkout) {
  return readJson(mailboxFile(checkout), { receipts: [] });
}

function saveMailbox(checkout, box) {
  writeJson(mailboxFile(checkout), box);
}

/**
 * Pull the receipt block out of runner output; tolerate trailing chatter.
 *
 * Uses the LAST occurrence, not the first. The launch prompt embeds a receipt
 * template under the same heading, so a runner that echoes its prompt — a status
 * line, an error dump, a "here is my instruction" preamble — would otherwise
 * have its template extracted instead of its result. The template is a valid
 * receipt, so the gates would then reject real work for a reason the operator
 * cannot see from the mailbox.
 */
function extractReceipt(text) {
  const idx = text.lastIndexOf(RECEIPT_MARKER);
  if (idx < 0) return null;
  const block = text.slice(idx).trim();
  return RECEIPT_SCHEMA_LINE.test(block) ? block : null;
}

function extractSessionId(text) {
  const m = /sess_[0-9a-f-]{36}/i.exec(text);
  return m ? m[0] : null;
}

/**
 * Launch the headless runner; resolve with the runner's full stdout.
 * The prompt is written to a temp file and the runner is asked to Read it:
 * Windows shells truncate multi-line argv at the first newline, but a file
 * reference survives. Tested against 0.16.5 on win32.
 */

// The env overrides exist so the cap is testable without waiting 90 minutes.
const RUNNER_TIMEOUT_MS = Number(process.env.FORK_LOOP_RUNNER_TIMEOUT_MS) || 90 * 60 * 1000;
const KILL_GRACE_MS = Number(process.env.FORK_LOOP_KILL_GRACE_MS) || 30 * 1000;

// Bounded capture. A runaway runner can print far more than any receipt needs,
// and holding the entire stream in memory only to store its last 2000 characters
// is how a process that also hosts the planning session runs out of room. The
// receipt is the runner's final block and extractReceipt scans from the end, so a
// tail is enough. Env-overridable so the bound itself can be asserted.
const MAX_CAPTURE_CHARS = Number(process.env.FORK_LOOP_MAX_CAPTURE_CHARS) || 2 * 1024 * 1024;

/**
 * Kill the runner and everything it spawned.
 *
 * The runner's own children inherit its stdout pipe. If they outlive it, `close`
 * never fires and `spawn_execution` never resolves — so the checkout stays
 * locked and the planning session waits on a call that will not return.
 * `taskkill /T` takes the whole tree on win32; elsewhere SIGKILL cannot be
 * ignored the way SIGTERM can.
 */
function killRunnerTree(child) {
  if (process.platform === 'win32' && child.pid) {
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return 'taskkill /T /F';
    } catch {
      /* fall through to the signal path */
    }
  }
  try {
    child.kill('SIGKILL');
    return 'SIGKILL';
  } catch {
    return 'no signal delivered';
  }
}

function runHeadless(checkout, prompt, taskId, options = {}) {
  const cmd = resolveCliCommand(process.env);
  const [bin, ...baseArgs] = cmd.split(/\s+/);
  // The prompt path is resolved by the shared model, not rebuilt here: the
  // status surfaces read this same file back to join a run to its spec.
  const promptPath = promptFile(checkout, taskId || Date.now());
  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  fs.writeFileSync(promptPath, prompt);
  const launchPrompt =
    `Read ${promptPath.split(path.sep).join('/')} with the Read tool. ` +
    'Its entire content is your launch instruction. Do not describe it, do not report on any pipeline state — follow it exactly and act now.';
  // Strict parser (0.16.5) accepts only: help json output-format no-color no-browser
  // browser-use browser-executable prompt attach cwd locale resume target target-replace
  // continue force force-mcs mode verbose version stdio surface. Flags shown in help text
  // but absent here (--max-turns, --settings, --permission-mode, --allowed-tools) are
  // advertising/implementation mismatches — passing them aborts with "Unknown option".
  // --json is deliberately NOT passed: its response field carries a summary persona that
  // degrades execution (verified: same prompt with --json produced status reports instead
  // of implementing; without it the runner completes the contract). Plain text stdout is
  // captured and the receipt extracted from it.
  const args = [...baseArgs, '-p', launchPrompt, '--cwd', checkout, '--mode', 'yolo'];
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let sessionId = null;
    let truncated = false;
    let settled = false;
    let timer = null;
    let killTimer = null;
    let logStream = null;
    const finish = (code, extra) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (logStream) {
        try {
          logStream.end();
        } catch {
          /* nothing useful to say: the run is over either way */
        }
      }
      resolve({
        code,
        out,
        err: extra ? `${err}\n${extra}` : err,
        sessionId,
        truncated,
        logFile: options.logFile || null,
      });
    };
    const child = spawn(bin, args, {
      cwd: checkout,
      // The runner is a full harness session, so the plugin's MCP entry loads
      // inside it and starts a second fork-loop server. That one must never
      // take a lock, so it is told what it is.
      env: { ...process.env, [NESTED_ENV]: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Never route the runner through a shell. `checkout` and the prompt-file
      // path reach argv verbatim, so shell:true on win32 would hand them to
      // cmd.exe and a perfectly legal directory name containing `&` or `%`
      // would be parsed as syntax — the A03 command injection that
      // delivery/安全设计.md claims is already mitigated. libuv resolves a bare
      // `node` to node.exe on PATH without a shell, so nothing here needs one.
      // The one case that would: FORK_LOOP_ZCODE_CMD pointing at a .cmd/.bat
      // wrapper, which must then be wrapped explicitly.
      shell: false,
    });
    // The runner's output is captured in memory *and* streamed to a file. The
    // in-memory copy is what the receipt is normally extracted from; the file
    // is the copy that survives this process dying — the only way a receipt can
    // still be recovered after the MCP server is restarted mid-run, and the
    // only way anyone can watch a run that is still going.
    if (options.logFile) {
      try {
        fs.mkdirSync(path.dirname(options.logFile), { recursive: true });
        logStream = fs.createWriteStream(options.logFile, { flags: 'a' });
        logStream.on('error', () => {
          logStream = null;
        });
      } catch {
        logStream = null;
      }
    }
    if (typeof options.onSpawn === 'function') options.onSpawn(child);
    const capture = (current, chunk) => {
      const text = String(chunk);
      // The session id can be announced early, so it is picked out of every
      // chunk on the way past — a tail-only capture would lose it.
      if (!sessionId) sessionId = extractSessionId(text);
      const next = current + text;
      if (next.length <= MAX_CAPTURE_CHARS) return next;
      truncated = true;
      return next.slice(next.length - MAX_CAPTURE_CHARS);
    };
    child.stdout.on('data', (d) => {
      out = capture(out, d);
      if (logStream) logStream.write(d);
    });
    child.stderr.on('data', (d) => {
      err = capture(err, d);
      if (logStream) logStream.write(d);
    });
    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      // The polite kill is only the first step. A runner that ignores it — or
      // one whose children keep the pipe open — never emits `close`, so this
      // promise (and the checkout lock it holds) would hang forever. Escalate to
      // a tree kill, then settle anyway: the mailbox records a failed run and
      // the lock becomes releasable instead of leaking until the stale sweep.
      killTimer = setTimeout(() => {
        const how = killRunnerTree(child);
        finish(
          -1,
          `runner exceeded ${Math.round(RUNNER_TIMEOUT_MS / 60000)}min and did not close after ` +
            `${Math.round(KILL_GRACE_MS / 1000)}s; forced kill via ${how}`,
        );
      }, KILL_GRACE_MS);
    }, RUNNER_TIMEOUT_MS); // hard cap on one execution
    child.on('close', (code) => finish(code));
    child.on('error', (e) => finish(-1, e.message));
  });
}

let taskSeq = 0;

/**
 * Resolve and validate the checkout the runner will be spawned against.
 *
 * The path reaches the runner's argv verbatim — as `--cwd <checkout>` and inside
 * the prompt-file path — so it is canonicalised here and rejected unless it is an
 * existing directory. Canonicalising keeps the lock key, the mailbox and the
 * runner's working directory describing the same tree; rejecting non-directories
 * keeps a stray path from aiming the runner at the wrong worktree.
 */
function normalizeCheckout(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'checkout path missing or does not exist' };
  }
  let resolved;
  try {
    resolved = fs.realpathSync(input);
  } catch {
    return { ok: false, error: 'checkout path missing or does not exist' };
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, error: 'checkout path missing or does not exist' };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `checkout is not a directory: ${resolved}` };
  }
  return { ok: true, checkout: resolved };
}

/** spawn_execution — the fork_thread replacement. */
async function spawnExecution(args) {
  if (isNested()) {
    return {
      ok: false,
      error:
        'refusing to spawn from inside an execution session (FORK_LOOP_NESTED=1) — a runner implements one contract, it does not start others',
    };
  }
  const check = normalizeCheckout(args.checkout);
  if (!check.ok) return check;
  const checkout = check.checkout;
  if (!args.spec_ready || !String(args.spec_ready).includes('SPEC READY')) {
    return { ok: false, error: 'spec_ready must contain the complete SPEC READY block' };
  }
  const task = {
    id: `forkloop-${Date.now()}-${++taskSeq}`,
    planner_session: args.planner_session || null,
    topic: args.topic || 'execution',
    startedAt: Date.now(),
  };
  const lock = acquireLock(checkout, task);
  if (!lock.ok) {
    return {
      ok: false,
      error: 'checkout is locked by an active execution (single-active-execution-thread guard)',
      holder: lock.holder,
    };
  }
  const prompt = [
    'You are the implementation agent. From this moment you implement, silently: no narration, no status reports,',
    'no pipeline commentary. Your final message is ONLY the receipt block defined in step 6.',
    '',
    'Execute this contract now:',
    '1. Read the repository instructions if present, then inspect the current code at the spec seam below.',
    '2. Record the current HEAD as the review fixed point. Implement the narrowest change satisfying every',
    '   acceptance criterion in the spec. Use the Edit/Write/Bash tools directly.',
    '3. Validate: run the smallest applicable check for each criterion and capture the real command output.',
    '4. Never commit, push, or take any external action. Leave all changes in the worktree.',
    '5. Never touch anything under .zcode/ — that is pipeline plumbing, not the task.',
    '6. End your FINAL message with exactly one complete receipt block and nothing else:',
    '',
    'SPEC EXECUTION RECEIPT',
    '',
    '- Schema: spec-executor-receipt/v2',
    '- Conclusion: <exactly one single token: completed | blocked | failed — report partial work as blocked, with the remainder under Risks and remaining work>',
    '- Spec source: <path>',
    '- Review fixed point: <baseline commit>',
    '- Acceptance criteria: <each criterion with pass/fail and real evidence (commands + output)>',
    '- Main changes:',
    '- Changed files:',
    '- Validation results:',
    '- Not validated or not executed:',
    '- Risks and remaining work:',
    '- Planning-thread decision needed:',
    '- Final worktree state:',
    '- External effects: none',
    '- Docs delta: <self-decided deviations / new constraints / new terms, one per line, or the literal word "none">',
    '- Receipt metrics: fork-or-express: fork | archive-gates: pass | archive-gate-failures: 0 | grill-rounds: 0 | criteria-evidenced: <n>/<m> | docs-delta: <none|N> | skill-friction: none',
    '',
    'A blank Docs delta or missing Receipt metrics line makes the receipt invalid. Every criterion needs real evidence.',
    '',
    '=== THE APPROVED SPEC FOLLOWS ===',
    '',
    String(args.spec_ready),
  ].join('\n');
  // Sized and journaled before the spawn, so a run is legible from its first
  // second rather than only once it finishes. The spec source is lifted out of
  // the contract here because it is the only join key between "what ran" and
  // "what was planned": without it the pipeline can show that something is
  // running but never which artefact it belongs to.
  const logFile = runLogFile(checkout, task.id);
  const specSource = parseSpecSource(args.spec_ready);
  upsertRun(checkout, {
    task_id: task.id,
    topic: task.topic,
    status: 'running',
    runner_pid: null,
    log: logFile,
    receipt_present: false,
    spec_source: specSource,
  });

  // Detached on purpose, and this is the reason the transport exists at all: the
  // planning session has to stay usable while the runner works, because the Stop
  // hook delivers the receipt *between turns*. Awaiting the runner here would
  // hold the planning turn — and the MCP client — for up to the full timeout,
  // which is precisely what the fork loop was built to avoid. `recordRun` appends
  // the mailbox entry when the runner exits, long after this call has returned.
  //
  // The cost of that choice is a window with no receipt and no visible progress,
  // which is why the log file and the journal are written here: they are the
  // evidence `check_status` and the dashboard read while the call has already
  // returned.
  runHeadless(checkout, prompt, task.id, {
    logFile,
    onSpawn: (child) => {
      recordRunnerPid(checkout, task.id, child.pid);
      upsertRun(checkout, { task_id: task.id, status: 'running', runner_pid: child.pid });
    },
  })
    .then((result) => recordRun(checkout, task, result))
    .catch((error) =>
      recordRun(checkout, task, { code: -1, out: '', err: String(error && error.message) }),
    );

  return {
    ok: true,
    task_id: task.id,
    status: 'running',
    runner_log: logFile,
    spec_source: specSource,
    note:
      'runner started and holds the checkout lock. The receipt lands in the mailbox when the runner exits; the Stop hook delivers it between turns. ' +
      'To watch it while it runs: check_status (MCP) or `node scripts/fork-loop-mcp/dashboard.mjs --checkout <checkout>`.',
  };
}

/**
 * Append a finished run to the mailbox. Invoked from the runner's exit handler,
 * after spawn_execution has already returned to the planner.
 */
function recordRun(checkout, task, result) {
  try {
    // The in-memory capture is authoritative. The log file is the fallback for
    // a run whose supervisor was restarted mid-flight — without it the receipt
    // exists only in a dead process's memory and is gone for good.
    const captured = extractReceipt(result.out) || extractReceipt(result.err);
    let receipt = captured;
    let receiptSource = captured ? 'capture' : null;
    const logFile = result.logFile || runLogFile(checkout, task.id);
    if (!receipt && fs.existsSync(logFile)) {
      const tail = readTail(logFile, { maxLines: 4000, maxChars: MAX_CAPTURE_CHARS });
      if (tail && tail.length) {
        receipt = extractReceipt(tail.join('\n'));
        if (receipt) receiptSource = 'log';
      }
    }
    const box = loadMailbox(checkout);
    box.receipts.push({
      task_id: task.id,
      planner_session: task.planner_session,
      topic: task.topic,
      checkout,
      state: 'pending',
      runner_exit: result.code,
      runner_session_id: result.sessionId || extractSessionId(result.out),
      runner_output_chars: (result.out + result.err).length,
      output_truncated: Boolean(result.truncated),
      receipt,
      receipt_source: receiptSource,
      log_file: logFile,
      raw_output_tail: (result.out + result.err).slice(-2000),
      finishedAt: Date.now(),
    });
    saveMailbox(checkout, box);
    upsertRun(checkout, {
      task_id: task.id,
      status: receipt ? 'finished' : 'failed',
      runner_exit: result.code,
      receipt_present: Boolean(receipt),
      finished_at: Date.now(),
      note: receipt
        ? null
        : 'runner produced no parseable receipt; the mailbox holds the raw output tail',
    });
  } catch (error) {
    // With the entry unwritten the planner is never handed a receipt, and the
    // lock would sit until the stale sweep. The run is over either way, so
    // release it and say so instead of stranding the checkout.
    logFailure(checkout, `recordRun could not record ${task.id}: ${error && error.message}`);
    console.error(`[fork-loop] failed to record run ${task.id}: ${error && error.message}`);
    upsertRun(checkout, {
      task_id: task.id,
      status: 'failed',
      runner_exit: result.code,
      note: `could not record the receipt: ${error && error.message}`,
    });
    releaseLockIfHeldBy(checkout, task.id);
  }
}

/** check_mailbox — the Stop hook polls this; deliver pending receipts once. */
async function checkMailbox(args) {
  const check = normalizeCheckout(args.checkout);
  if (!check.ok) return { ok: false, error: check.error };
  const checkout = check.checkout;
  const box = loadMailbox(checkout);
  const deliverable = box.receipts.filter(
    (r) =>
      r.state === 'pending' &&
      // Every entry records the checkout it ran in. With a shared state directory
      // (FORK_LOOP_STATE_DIR) several checkouts share one mailbox file, and
      // without this filter one of them gets handed another's receipt.
      (!r.checkout || r.checkout === checkout) &&
      (!args.planner_session || r.planner_session === args.planner_session),
  );
  if (deliverable.length === 0) return { ok: true, mail: null };
  const mail = deliverable[0];
  mail.state = 'delivered';
  mail.deliveredAt = Date.now();
  // A failed write must not block the Stop event: the receipt is in hand, and
  // delivering it unpersisted risks a redelivery, which beats losing it to a
  // hook that crashed on an error response. The failure goes to a sidecar log
  // because a stderr nobody is watching is not observability.
  let persisted = true;
  try {
    saveMailbox(checkout, box);
  } catch (error) {
    persisted = false;
    logFailure(checkout, `check_mailbox could not persist delivery of ${mail.task_id}: ${error && error.message}`);
  }
  return {
    ok: true,
    delivery_persisted: persisted,
    mail: {
      task_id: mail.task_id,
      topic: mail.topic,
      runner_exit: mail.runner_exit,
      receipt: mail.receipt,
      raw_output_tail: mail.receipt ? undefined : mail.raw_output_tail,
    },
  };
}

function settle(args, state) {
  const checkout = args.checkout;
  const box = loadMailbox(checkout);
  const entry = box.receipts.find((r) => r.task_id === args.task_id);
  if (!entry) return { ok: false, error: `unknown task_id ${args.task_id}` };
  entry.state = state;
  entry.settledAt = Date.now();
  saveMailbox(checkout, box);
  // Scoped release: a late ack/fail for a task that is no longer the lock
  // holder must not drop the lock of the execution running right now.
  const lock = releaseLockIfHeldBy(checkout, entry.task_id);
  return {
    ok: true,
    task_id: entry.task_id,
    state,
    lock_released: lock.released,
    ...(lock.released ? {} : { lock_note: lock.reason }),
  };
}

/** check_status — the answer to "is it still working?" while a run is in flight. */
async function checkStatus(args) {
  const check = normalizeCheckout(args.checkout);
  if (!check.ok) return check;
  const requested = Number(args.log_tail_lines);
  const logTailLines = Number.isInteger(requested) ? Math.min(400, Math.max(0, requested)) : 40;
  const report = buildReport(check.checkout, { logTailLines });
  return { ok: true, ...report };
}

/**
 * cancel_execution — stop a live runner and release its lock.
 *
 * Before this existed the only way out of a runaway run was release_execution,
 * which drops the lock while the runner keeps writing to the worktree — and the
 * single-active-execution-thread guard then admits a second execution onto a
 * checkout that already has one.
 *
 * Only the runner tree is killed. The supervisor is deliberately spared: it is
 * normally this very process, and when it is not, it is another server that may
 * be supervising a different checkout. It observes the runner's exit and records
 * an honest receipt-less entry, which is exactly what an interrupted run is.
 */
async function cancelExecution(args) {
  const check = normalizeCheckout(args.checkout);
  if (!check.ok) return check;
  const checkout = check.checkout;
  const file = lockFile(checkout);
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'no lock held on this checkout; nothing to cancel' };
  }
  const holder = lockHolder(file);
  if (!holder) {
    return { ok: false, error: 'lock has no recorded holder; use release_execution with force:true' };
  }
  if (args.task_id && holder.id !== args.task_id) {
    return { ok: false, error: `lock is held by ${holder.id}, not ${args.task_id}` };
  }
  const finished = [];
  const runnerPid = Number(holder.runner_pid);
  if (Number.isInteger(runnerPid) && runnerPid > 0) {
    if (pidAlive(runnerPid) !== true) {
      finished.push({ pid: runnerPid, result: 'already gone' });
    } else if (process.platform === 'win32') {
      let how = 'taskkill /T /F';
      try {
        spawnSync('taskkill', ['/PID', String(runnerPid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        how = 'taskkill failed';
      }
      finished.push({ pid: runnerPid, result: how });
    } else {
      let how = 'SIGKILL';
      try {
        process.kill(runnerPid, 'SIGKILL');
      } catch {
        how = 'signal failed';
      }
      finished.push({ pid: runnerPid, result: how });
    }
  }
  const lock = releaseLockIfHeldBy(checkout, holder.id);
  upsertRun(checkout, {
    task_id: holder.id,
    status: 'cancelled',
    finished_at: Date.now(),
    note: `cancelled by the planning session${args.reason ? `: ${args.reason}` : ''}`,
  });
  logFailure(
    checkout,
    `cancel_execution stopped ${holder.id} (runner_pid=${holder.runner_pid ?? 'unrecorded'}): ${JSON.stringify(finished)}`,
  );
  return {
    ok: true,
    cancelled: holder.id,
    runner_pid: holder.runner_pid ?? null,
    killed: finished,
    lock_released: lock.released,
    ...(lock.released ? {} : { lock_note: lock.reason }),
  };
}

const TOOLS = {
  spawn_execution: {
    description:
      'Launch a headless ZCode execution session on this checkout with a SPEC READY contract. Returns as soon as the runner has started — it does NOT wait for the run — so the planning session stays usable; the receipt lands in the mailbox when the runner exits, and the Stop hook delivers it between turns. Requires the planning session to register that Stop hook.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'spec_ready'],
      properties: {
        checkout: { type: 'string', description: 'Absolute path of the shared checkout' },
        spec_ready: { type: 'string', description: 'The complete SPEC READY block (launch command)' },
        topic: { type: 'string', description: 'Short non-sensitive topic for the execution' },
        planner_session: { type: 'string', description: 'sess_… id of the planning session' },
        // No max_turns. It was advertised here but never reached argv, and it
        // could not have worked: the runner's strict parser aborts on
        // --max-turns with "Unknown option" (see runHeadless). An advertised
        // knob that silently does nothing is worse than no knob. A caller that
        // still sends the property is ignored rather than rejected.
      },
    },
  },
  check_mailbox: {
    description:
      'Poll the fork-loop mailbox for a pending receipt addressed to this planner session. Used by the Stop hook between turns; empty output means nothing to deliver.',
    inputSchema: {
      type: 'object',
      required: ['checkout'],
      properties: {
        checkout: { type: 'string' },
        planner_session: { type: 'string' },
      },
    },
  },
  check_status: {
    description:
      'Report what the fork loop is doing on this checkout right now: derived phase, elapsed time, the lock holder plus whether the supervisor and runner processes are alive, the files touched recently, the runner log tail, and the mailbox. Read-only, and safe to call any time — including while an execution is running, which is the only way to tell a working runner from one that died.',
    inputSchema: {
      type: 'object',
      required: ['checkout'],
      properties: {
        checkout: { type: 'string', description: 'Absolute path of the shared checkout' },
        log_tail_lines: {
          type: 'number',
          description: 'How many runner log lines to include (default 40, max 400)',
        },
      },
    },
  },
  cancel_execution: {
    description:
      'Stop the runner for this checkout and release its lock. Kills the runner process tree only — never the supervisor — then records the cancellation in the run journal and the failure log. Use it for a runaway or unwanted execution; do not use release_execution for that, since dropping a live run\u2019s lock admits a second execution onto the same checkout.',
    inputSchema: {
      type: 'object',
      required: ['checkout'],
      properties: {
        checkout: { type: 'string' },
        task_id: { type: 'string', description: 'Cancel only if this task holds the lock' },
        reason: { type: 'string', description: 'Short note recorded with the cancellation' },
      },
    },
  },
  ack_receipt: {
    description:
      'Mark a delivered receipt accepted (six gates passed, Docs delta settled). Releases the checkout execution lock if this task_id is the one holding it.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'task_id'],
      properties: { checkout: { type: 'string' }, task_id: { type: 'string' } },
    },
  },
  fail_receipt: {
    description:
      'Mark a delivered receipt rejected (validation failure). Releases the checkout execution lock if this task_id is the one holding it.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'task_id'],
      properties: { checkout: { type: 'string' }, task_id: { type: 'string' } },
    },
  },
  release_execution: {
    description:
      'Recovery path: drop the checkout execution lock without settling a receipt, for when a runner is confirmed dead and no receipt will arrive. Must name the task_id expected to hold the lock, or pass force:true to drop a lock whose holder cannot be identified. A lock whose execution is still alive is refused — use cancel_execution for that — so recovery can never admit a second execution onto a live checkout.',
    inputSchema: {
      type: 'object',
      required: ['checkout'],
      properties: {
        checkout: { type: 'string' },
        task_id: { type: 'string', description: 'Release only if this task holds the lock' },
        force: {
          type: 'boolean',
          description: 'Drop the lock even when its holder cannot be identified (recovery only)',
        },
      },
    },
  },
};

async function callTool(name, args) {
  switch (name) {
    case 'spawn_execution':
      return spawnExecution(args);
    case 'check_mailbox':
      return checkMailbox(args);
    case 'check_status':
      return checkStatus(args);
    case 'cancel_execution':
      return cancelExecution(args);
    case 'ack_receipt':
      return settle(args, 'done');
    case 'fail_receipt':
      return settle(args, 'failed');
    case 'release_execution': {
      const checkout = args.checkout;
      const file = lockFile(checkout);
      if (!fs.existsSync(file)) return { ok: true, released: false, note: 'no lock held' };
      const holder = lockHolder(file);
      if (args.task_id && holder && holder.id === args.task_id) {
        releaseLock(checkout);
        return { ok: true, released: true, holder: holder.id };
      }
      if (args.force === true) {
        // Dropping a lock whose execution is still running does not stop that
        // execution — it just lets a second one start on the same checkout, which
        // is the contract this lock exists to hold. `force` is for a lock whose
        // owner died; a live run has a real exit.
        const liveElsewhere = (pid) =>
          Number.isInteger(pid) && pid > 0 && pid !== process.pid && pidAlive(pid) === true;
        const supervisorPid = Number(holder && holder.pid);
        const runnerPid = Number(holder && holder.runner_pid);
        if (liveElsewhere(supervisorPid) || liveElsewhere(runnerPid)) {
          return {
            ok: false,
            released: false,
            holder: holder ? holder.id : null,
            error:
              'refusing to drop a lock whose execution is still alive — that would admit a second execution onto the same checkout. Use cancel_execution to stop it first, or wait for the receipt.',
          };
        }
        releaseLock(checkout);
        return { ok: true, released: true, forced: true, holder: holder ? holder.id : null };
      }
      return {
        ok: false,
        released: false,
        holder: holder ? holder.id : null,
        error: holder
          ? `lock is held by ${holder.id}; pass task_id "${holder.id}", or force:true to drop it anyway`
          : 'lock has no recorded holder; pass force:true to drop it',
      };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function writeMessage(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handle(req) {
  if (req.method === 'initialize') {
    return { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO };
  }
  if (req.method === 'notifications/initialized' || String(req.method).startsWith('notifications/')) {
    return undefined;
  }
  if (req.method === 'tools/list') {
    return {
      tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
    };
  }
  if (req.method === 'tools/call') {
    const { name, arguments: args } = req.params || {};
    try {
      const result = await callTool(name, args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: e.message }] };
    }
  }
  if (req.method === 'ping') return {};
  throw new Error(`method not supported: ${req.method}`);
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }
    try {
      const result = await handle(req);
      if (result === undefined) return;
      writeMessage({ jsonrpc: '2.0', id: req.id ?? null, result });
    } catch (e) {
      writeMessage({ jsonrpc: '2.0', id: req.id ?? null, error: { code: -32601, message: e.message } });
    }
  });
}

main();

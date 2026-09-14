#!/usr/bin/env node
/**
 * fork-loop-mcp — ZCode fork-loop transport (ADR 0005).
 *
 * MCP stdio server with five tools:
 *   spawn_execution  — machine-lock the checkout, launch `zcode -p` headless with the
 *                      SPEC READY contract as the launch prompt, capture its stdout on
 *                      exit, extract the SPEC EXECUTION RECEIPT, store it as pending.
 *   check_mailbox    — return receipts addressed to a planner session (pending first).
 *   ack_receipt      — mark a receipt done (planner accepted it); releases the lock.
 *   fail_receipt     — mark a receipt failed (validation could not proceed); releases the lock.
 *   release_execution — drop the machine lock without a receipt (recovery path).
 *
 * Zero dependencies: speaks JSON-RPC 2.0 over stdio by hand.
 * The runner session needs no MCP client — the transport owns its lifecycle.
 */


import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'fork-loop-mcp', version: '1.0.0' };
const RECEIPT_MARKER = 'SPEC EXECUTION RECEIPT';
// The mailbox accepts only a receipt carrying the contract's Schema first
// field. This constant named v1 while the launch prompt wrote v2 — and nothing
// read it, so any old-schema block was stored as a valid receipt. Now it is
// enforced: an unversioned or stale block is not a receipt, and spawn_execution
// reports receipt_extracted:false with the raw tail for the planner to inspect.
const RECEIPT_SCHEMA_LINE = /^\s*-\s*Schema:\s*spec-executor-receipt\/v2\s*$/im;

/** Resolve the CLI entry: env override wins, else the desktop-install default. */
function resolveCliCommand(env) {
  if (env.FORK_LOOP_ZCODE_CMD) return env.FORK_LOOP_ZCODE_CMD;
  return 'node D:/softs/ZCode/resources/glm/zcode.cjs';
}

/** Mailbox root: per-checkout, git-ignorable, overridable for tests. */
function stateRoot(checkout) {
  if (process.env.FORK_LOOP_STATE_DIR) return process.env.FORK_LOOP_STATE_DIR;
  return path.join(checkout, '.zcode', 'fork-loop');
}

function safeName(p) {
  return crypto.createHash('sha256').update(path.resolve(p)).digest('hex').slice(0, 16);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
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

function lockFile(checkout) {
  return path.join(stateRoot(checkout), `exec-${safeName(checkout)}.lock`);
}

/** The holder recorded inside a lock directory, or null when unreadable. */
function lockHolder(file) {
  const holder = readJson(path.join(file, 'task.json'), null);
  return holder && typeof holder === 'object' ? holder : null;
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
    const limit = holder ? STALE_LOCK_MS : ORPHAN_LOCK_MS;
    if (lockAge(file) > limit) {
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
  writeJson(path.join(file, 'task.json'), task);
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

function mailboxFile(checkout) {
  return path.join(stateRoot(checkout), 'mailbox.json');
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

function runHeadless(checkout, prompt, taskId) {
  const cmd = resolveCliCommand(process.env);
  const [bin, ...baseArgs] = cmd.split(/\s+/);
  const promptFile = path.join(stateRoot(checkout), `prompt-${taskId || Date.now()}.md`);
  fs.mkdirSync(path.dirname(promptFile), { recursive: true });
  fs.writeFileSync(promptFile, prompt);
  const launchPrompt =
    `Read ${promptFile.split(path.sep).join('/')} with the Read tool. ` +
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
    const finish = (code, extra) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code, out, err: extra ? `${err}\n${extra}` : err, sessionId, truncated });
    };
    const child = spawn(bin, args, {
      cwd: checkout,
      env: process.env,
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
    });
    child.stderr.on('data', (d) => {
      err = capture(err, d);
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
  // Detached on purpose, and this is the reason the transport exists at all: the
  // planning session has to stay usable while the runner works, because the Stop
  // hook delivers the receipt *between turns*. Awaiting the runner here would
  // hold the planning turn — and the MCP client — for up to the full timeout,
  // which is precisely what the fork loop was built to avoid. `recordRun` appends
  // the mailbox entry when the runner exits, long after this call has returned.
  runHeadless(checkout, prompt, task.id)
    .then((result) => recordRun(checkout, task, result))
    .catch((error) =>
      recordRun(checkout, task, { code: -1, out: '', err: String(error && error.message) }),
    );

  return {
    ok: true,
    task_id: task.id,
    status: 'running',
    note: 'runner started and holds the checkout lock. The receipt lands in the mailbox when the runner exits; the Stop hook delivers it between turns.',
  };
}

/**
 * Append a finished run to the mailbox. Invoked from the runner's exit handler,
 * after spawn_execution has already returned to the planner.
 */
function recordRun(checkout, task, result) {
  try {
    const receipt = extractReceipt(result.out) || extractReceipt(result.err);
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
      raw_output_tail: (result.out + result.err).slice(-2000),
      finishedAt: Date.now(),
    });
    saveMailbox(checkout, box);
  } catch (error) {
    // With the entry unwritten the planner is never handed a receipt, and the
    // lock would sit until the stale sweep. The run is over either way, so
    // release it and say so instead of stranding the checkout.
    console.error(`[fork-loop] failed to record run ${task.id}: ${error && error.message}`);
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
  saveMailbox(checkout, box);
  return {
    ok: true,
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
      'Recovery path: drop the checkout execution lock without settling a receipt, for when a runner is confirmed dead and no receipt will arrive. Must name the task_id expected to hold the lock, or pass force:true to drop a lock whose holder cannot be identified. Anything else is refused, so a stale recovery call cannot release a live execution.',
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

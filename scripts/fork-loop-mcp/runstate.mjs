#!/usr/bin/env node
/**
 * runstate — the read side of the fork loop.
 *
 * Why this module exists: during a run the only on-disk evidence used to be the
 * lock directory and the prompt dump. The planning session got `status: running`
 * back from spawn_execution and then nothing until the receipt landed, so a
 * working run and a dead one looked identical for up to 90 minutes. Everything
 * a third party needs to answer "what is happening right now?" is assembled
 * here once, and consumed by three surfaces: the `check_status` MCP tool, the
 * `status.mjs` CLI, and the `dashboard.mjs` web board.
 *
 * Design rules that keep the three honest:
 *  - Read-only. Nothing here writes to the checkout, the mailbox or the lock.
 *  - Never throw on a malformed state directory. A monitor that dies on a torn
 *    file is useless exactly when it is needed.
 *  - Missing liveness evidence reports `unknown`, never `alive`. Same
 *    refuse-not-degrade rule the receipt gates follow.
 *
 * Zero dependencies. Node 18+.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { summarizeReceipt } from './settlement.mjs';
import { summarizeTelemetry } from './telemetry.mjs';

/**
 * A runner that has produced no new signal for this long reads as stalled.
 *
 * Twenty minutes, deliberately, not ten. One agent turn routinely spends longer
 * than ten minutes without touching disk — running the suite, installing
 * dependencies, composing a long edit — so a shorter window fires on healthy
 * runs. A label that cries wolf on a working run is worse than no label: the
 * operator learns to ignore it, and then misses the run that really is wedged.
 * The measured fact is always shown alongside it (`last_signal_at`), so nobody
 * has to take the verdict on trust.
 */
export const STALL_AFTER_MS = 20 * 60 * 1000;
/** Grace after the runner exits for the supervisor to record the receipt. */
export const RECORD_GRACE_MS = 60 * 1000;
/** How far back the activity scan looks by default. */
export const ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

const SKIP_DIRS = new Set(['.git', 'node_modules', '.zcode', 'dist', 'build', '.next', 'target']);
const MAX_SCAN_ENTRIES = 40000;

export function stateRoot(checkout) {
  if (process.env.FORK_LOOP_STATE_DIR) return process.env.FORK_LOOP_STATE_DIR;
  return path.join(checkout, '.zcode', 'fork-loop');
}

export function safeName(p) {
  return crypto.createHash('sha256').update(path.resolve(p)).digest('hex').slice(0, 16);
}

export function lockFile(checkout) {
  return path.join(stateRoot(checkout), `exec-${safeName(checkout)}.lock`);
}

export function mailboxFile(checkout) {
  return path.join(stateRoot(checkout), 'mailbox.json');
}

export function runStateFile(checkout) {
  return path.join(stateRoot(checkout), 'state.json');
}

export function runsDir(checkout) {
  return path.join(stateRoot(checkout), 'runs');
}

export function runLogFile(checkout, taskId) {
  return path.join(runsDir(checkout), `${taskId}.log`);
}

export function failureLogFile(checkout) {
  return path.join(stateRoot(checkout), 'failures.log');
}

/**
 * The launch prompt written for a run.
 *
 * It is the contract the runner was started with, so it carries the `SPEC
 * READY` block verbatim — which makes it the one place a run started by an
 * older server can still be tied back to the artefact it implements.
 */
export function promptFile(checkout, taskId) {
  return path.join(stateRoot(checkout), `prompt-${taskId}.md`);
}

export function readJson(file, fallback = null) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/** Last `maxLines` lines of a file, capped at `maxChars` from the end. */
export function readTail(file, { maxLines = 60, maxChars = 20000 } = {}) {
  let text;
  let readWholeFile = true;
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxChars);
    readWholeFile = start === 0;
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      text = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  // Starting at an offset usually lands mid-line. That leading fragment is not
  // a line of the file and must not be reported as one.
  if (!readWholeFile && lines.length > 1) lines.shift();
  return lines.slice(-maxLines);
}

export function lockHolder(file) {
  const holder = readJson(path.join(file, 'task.json'), null);
  return holder && typeof holder === 'object' ? holder : null;
}

/**
 * `kill(pid, 0)` is the portable liveness probe: ESRCH means gone, EPERM means
 * alive but owned by another user. A non-integer pid returns null — "unknown",
 * never "alive". A monitor that guesses liveness is worse than one that admits
 * it cannot tell.
 */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    return null;
  }
}

/**
 * Verdict for the checkout lock.
 *
 * Two pids matter and they are not interchangeable. `pid` is the *supervisor*
 * (the MCP server) — the process that owns the mailbox write. `runner_pid` is
 * the headless execution session. A lock is only unrecoverable when the
 * supervisor is gone, because no one is left to record the receipt; a dead
 * runner with a live supervisor is `runner-gone`, which resolves on its own
 * once the exit handler fires.
 *
 * `runner_pid` was added after a run deadlocked in the field: the holder
 * recorded the supervisor, so the liveness probe answered for the wrong
 * process and a crashed runner stayed invisible until the six-hour sweep.
 */
export function lockVerdict(checkout) {
  const file = lockFile(checkout);
  if (!fs.existsSync(file)) return { present: false, state: 'free', ageMs: 0, holder: null };
  const holder = lockHolder(file);
  if (!holder) {
    let ageMs = 0;
    try {
      ageMs = Date.now() - fs.statSync(file).mtimeMs;
    } catch {
      ageMs = 0;
    }
    return { present: true, state: 'no-holder', ageMs, holder: null, supervisorAlive: null, runnerAlive: null };
  }
  const ageMs = Number(holder.startedAt) > 0 ? Date.now() - Number(holder.startedAt) : 0;
  const supervisorAlive = pidAlive(holder.pid);
  const runnerAlive = holder.runner_pid ? pidAlive(holder.runner_pid) : null;
  let state = 'active';
  if (supervisorAlive === false) state = 'orphaned';
  else if (holder.runner_pid && runnerAlive === false) {
    state = ageMs > RECORD_GRACE_MS ? 'runner-gone' : 'settling';
  } else if (runnerAlive === null && supervisorAlive === null) state = 'unknown';
  return { present: true, state, ageMs, holder, supervisorAlive, runnerAlive };
}

export function loadMailbox(checkout) {
  const box = readJson(mailboxFile(checkout), { receipts: [] });
  if (!box || !Array.isArray(box.receipts)) return { receipts: [] };
  return box;
}

export function loadRunState(checkout) {
  const state = readJson(runStateFile(checkout), { runs: [] });
  if (!state || !Array.isArray(state.runs)) return { runs: [] };
  return state;
}

/** Most recent run entry, by start time. */
export function latestRun(checkout, runs) {
  const list = runs || loadRunState(checkout).runs;
  if (!list.length) return null;
  return list.reduce((newest, run) =>
    Number(run.started_at || 0) >= Number(newest.started_at || 0) ? run : newest,
  );
}

/**
 * One task's phase, in the same vocabulary the checkout-level phase uses.
 *
 * A receipt outranks the lock: while a pending receipt is waiting, the action
 * the operator owes is settling it, whether or not the lock still stands. That
 * is also the precedence `derivePhase` applies, so the board cannot label the
 * same moment two different ways.
 */
function taskPhase(task, lock) {
  // A mailbox entry being `pending` says only that the planner has not been
  // handed it yet — not that there is a receipt inside. A run that died on an
  // API error leaves exactly such an entry, and calling that "receipt waiting"
  // tells the operator to go collect something that does not exist.
  if (task.receipt_state === 'pending') {
    return task.receipt_present ? 'receipt-ready' : 'finished-no-receipt';
  }
  if (task.receipt_state === 'delivered') {
    return task.receipt_present ? 'awaiting-settlement' : 'finished-no-receipt';
  }
  if (task.receipt_state === 'done') return 'settled';
  if (task.receipt_state === 'failed') return 'failed';
  if (task.in_flight) {
    if (lock.state === 'orphaned') return 'orphaned';
    if (lock.state === 'settling') return 'settling';
    if (lock.state === 'no-holder') return 'lock-without-holder';
    if (lock.state === 'unknown') return 'unknown';
    const last = Number(task.last_signal_at || task.updated_at || task.started_at || 0);
    if (last && Date.now() - last > STALL_AFTER_MS) return 'stalled';
    return 'running';
  }
  if (task.status === 'cancelled') return 'cancelled';
  if (task.status === 'failed') return 'failed';
  if (task.status === 'finished') {
    return task.receipt_present ? 'receipt-ready' : 'finished-no-receipt';
  }
  return 'unknown';
}

/**
 * The newest evidence that a run is still making progress.
 *
 * `startedAt` is *not* a heartbeat — it is the moment the lock was taken, so
 * treating it as one marks every run longer than the stall window as stalled
 * the moment it passes the threshold, however busy it is. The real signals are
 * the journal's last write, the log file's mtime (the runner writes to it as it
 * prints), and — for an in-flight task only — the newest file the runner has
 * touched under the checkout. That last one is the same evidence an operator
 * uses by eye: files are changing, so it is working.
 */
function lastSignalMs(task, activityFiles) {
  let newest = Number(task.updated_at || 0);
  if (task.log) {
    try {
      newest = Math.max(newest, fs.statSync(task.log).mtimeMs);
    } catch {
      /* no log yet: the run just started, or it never wrote one */
    }
  }
  if (task.in_flight && activityFiles && activityFiles.length) {
    newest = Math.max(newest, Number(activityFiles[0].mtimeMs || 0));
  }
  return newest || Number(task.started_at || 0) || 0;
}

/**
 * The task list: every execution this checkout knows about, newest first.
 *
 * Three sources each hold part of one task, and none of them is complete:
 *  - the **lock** — the execution running *now*. It is the only trace a run
 *    leaves before the journal is written, and the only trace at all for a run
 *    started before the journal existed (which is exactly what an older server
 *    leaves behind);
 *  - the **journal** (`state.json`) — what the supervisor recorded: status, exit
 *    code, whether a receipt was found, the log path;
 *  - the **mailbox** — the receipt's own lifecycle, which outlives the lock.
 *
 * A board that reads one of them shows a list missing precisely the task the
 * operator is looking for, so they are joined here by task_id. The list is a
 * view over files, never a second store: nothing here is written.
 */
export function taskList(checkout, preloaded = {}) {
  const lock = preloaded.lock || lockVerdict(checkout);
  const mailbox = preloaded.mailbox || loadMailbox(checkout);
  const runs = preloaded.runs || loadRunState(checkout).runs;
  const activityFiles = preloaded.activityFiles || null;

  const byId = new Map();
  const ensure = (taskId) => {
    if (!byId.has(taskId)) {
      byId.set(taskId, {
        task_id: taskId,
        topic: null,
        planner_session: null,
        started_at: null,
        updated_at: null,
        finished_at: null,
        status: 'unknown',
        runner_exit: null,
        receipt_present: false,
        receipt_state: null,
        log: null,
        note: null,
        spec_source: null,
        supervisor_pid: null,
        runner_pid: null,
        in_flight: false,
        sources: [],
      });
    }
    return byId.get(taskId);
  };

  for (const run of runs) {
    if (!run || !run.task_id) continue;
    const task = ensure(run.task_id);
    task.topic = run.topic ?? task.topic;
    task.status = run.status ?? task.status;
    task.started_at = run.started_at ?? task.started_at;
    task.updated_at = run.updated_at ?? task.updated_at;
    task.finished_at = run.finished_at ?? task.finished_at;
    task.runner_exit = run.runner_exit ?? task.runner_exit;
    task.receipt_present = Boolean(run.receipt_present) || task.receipt_present;
    task.log = run.log ?? task.log;
    task.note = run.note ?? task.note;
    task.spec_source = run.spec_source ?? task.spec_source;
    task.runner_pid = run.runner_pid ?? task.runner_pid;
    if (!task.sources.includes('journal')) task.sources.push('journal');
  }

  for (const entry of mailbox.receipts) {
    if (!entry || !entry.task_id) continue;
    const task = ensure(entry.task_id);
    task.topic = entry.topic ?? task.topic;
    task.planner_session = entry.planner_session ?? task.planner_session;
    task.finished_at = entry.finishedAt ?? task.finished_at;
    task.runner_exit = entry.runner_exit ?? task.runner_exit;
    task.receipt_present = Boolean(entry.receipt) || task.receipt_present;
    task.receipt_state = entry.state ?? task.receipt_state;
    task.log = entry.log_file ?? task.log;
    if (!task.sources.includes('mailbox')) task.sources.push('mailbox');
    if (task.status === 'unknown' && (entry.state === 'pending' || entry.state === 'delivered')) {
      task.status = 'finished';
    }
  }

  if (lock.present && lock.holder && lock.holder.id) {
    const task = ensure(lock.holder.id);
    task.topic = lock.holder.topic ?? task.topic;
    task.planner_session = lock.holder.planner_session ?? task.planner_session;
    task.started_at = lock.holder.startedAt ?? task.started_at;
    task.supervisor_pid = lock.holder.pid ?? null;
    task.runner_pid = lock.holder.runner_pid ?? task.runner_pid;
    task.in_flight = true;
    if (!task.sources.includes('lock')) task.sources.push('lock');
    // A live lock outranks whatever the journal last recorded for this task.
    if (lock.state === 'active' || lock.state === 'settling') task.status = 'running';
    else if (task.status === 'unknown') task.status = lock.state;
  }

  const LIVE_PHASES = new Set(['running', 'settling', 'stalled', 'unknown']);

  const tasks = [...byId.values()].map((task) => {
    const withSignal = { ...task, last_signal_at: lastSignalMs(task, activityFiles) };
    const phase = taskPhase(withSignal, lock);
    return {
      ...withSignal,
      phase,
      // A lock standing over a run that is already over is a checkout nobody
      // can reuse: the run can never be acked (there is no receipt), so the
      // lock waits for an explicit fail_receipt/release_execution, or the
      // six-hour sweep. Say so instead of reporting a healthy "active" lock.
      needs_recovery: Boolean(task.in_flight) && !LIVE_PHASES.has(phase),
      elapsedMs: task.started_at
        ? Math.max(0, Number(task.finished_at || Date.now()) - Number(task.started_at))
        : 0,
    };
  });

  return tasks.sort(
    (a, b) =>
      Number(b.started_at || b.finished_at || 0) - Number(a.started_at || a.finished_at || 0),
  );
}

/**
 * Files changed under the checkout inside the window.
 *
 * This is the honest progress signal when the runner owns its stdout. The log
 * file is the primary evidence, but it only exists for runs started by a
 * server that writes one — and a run whose log is empty or unreadable still
 * leaves file mtimes behind.
 */
export function recentFiles(checkout, { sinceMs = ACTIVITY_WINDOW_MS, limit = 40 } = {}) {
  const cutoff = Date.now() - sinceMs;
  const found = [];
  let visited = 0;
  const walk = (dir) => {
    if (visited >= MAX_SCAN_ENTRIES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= MAX_SCAN_ENTRIES) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      visited += 1;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs >= cutoff) found.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  };
  walk(checkout);
  return {
    truncated: visited >= MAX_SCAN_ENTRIES,
    files: found.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit),
  };
}

/** `git status --porcelain` for the checkout, or null when git cannot answer. */
export function gitDirty(checkout) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: checkout,
      encoding: 'utf8',
      timeout: 15000,
    });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return null;
  }
}

/** Current HEAD, or null. */
export function gitHead(checkout) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: checkout,
      encoding: 'utf8',
      timeout: 15000,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * A path from a planning artefact, normalised for joining.
 *
 * The `Source` line in a `SPEC READY` block and the `Spec source` field in a
 * receipt are both free text written by an agent, so they arrive absolute or
 * relative, with either slash, sometimes wrapped in backticks. Joining on them
 * raw would silently match nothing.
 */
function normalizeRel(checkout, raw) {
  if (!raw) return null;
  let value = String(raw).trim().replace(/^`+|`+$/g, '').split(/\s+/)[0];
  if (!value) return null;
  value = value.replace(/\\/g, '/');
  const absolute = path.isAbsolute(value) ? value : path.resolve(checkout, value);
  const rel = path.relative(checkout, absolute).replace(/\\/g, '/');
  if (rel.startsWith('..')) return value.replace(/^\.\//, '');
  return rel;
}

/** The first `- <field>: value` line at or after the SPEC READY marker. */
export function parseSourceField(text, field) {
  if (!text) return null;
  const body = String(text);
  const start = body.indexOf('SPEC READY');
  const scope = start >= 0 ? body.slice(start) : body;
  const match = scope.match(new RegExp(`^\\s*-\\s*${field}:\\s*(.+)$`, 'm'));
  if (!match) return null;
  return match[1].trim().replace(/^`+|`+$/g, '') || null;
}

/** The spec a `SPEC READY` block was built from. */
export function parseSpecSource(text) {
  return parseSourceField(text, 'Source');
}

/** The spec a returned receipt implemented (its `Spec source` field). */
export function parseReceiptSpecSource(text) {
  return parseSourceField(text, 'Spec source');
}

const STAGE_RANK = { executing: 5, 'receipt-ready': 4, 'awaiting-settlement': 4, executed: 3, ready: 2, ticketed: 1, spec: 1 };

function readMarkdownFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function firstHeading(text, fallback) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 140);
  const line = text.split(/\r?\n/).find((candidate) => candidate.trim());
  return (line || fallback).trim().slice(0, 140);
}

/**
 * Planned work: everything the local tracker knows about, whether or not it has
 * been executed.
 *
 * The task list answers "what ran". This answers "what is queued" — the half a
 * board is useless without, because the work an operator is deciding about is
 * usually the work that has not started. Stages come from the artefacts
 * themselves (a spec exists, tickets exist, the file carries a `SPEC READY`
 * block) and from the executions that name them, joined on the `Source` /
 * `Spec source` path. Nothing is inferred from a filename.
 *
 * Local tracker convention (CONTEXT.md): `.scratch/<feature>/spec.md` plus one
 * file per ticket under `.scratch/<feature>/issues/`. Feature directories that
 * use some other layout are still listed, as planning documents.
 */
export function pipeline(checkout, preloaded = {}) {
  const root = path.join(checkout, '.scratch');
  if (!fs.existsSync(root)) return { root: '.scratch', present: false, items: [], stages: {} };

  const tasks = preloaded.tasks || taskList(checkout);
  const mailbox = preloaded.mailbox || loadMailbox(checkout);

  const bySource = new Map();
  const record = (rawSource, stage) => {
    const rel = normalizeRel(checkout, rawSource);
    if (!rel) return;
    const current = bySource.get(rel);
    if (!current || (STAGE_RANK[stage] || 0) > (STAGE_RANK[current] || 0)) bySource.set(rel, stage);
  };
  for (const task of tasks) {
    // The journal records the spec source at spawn. A run started before that
    // existed still has its launch prompt on disk, and the prompt carries the
    // `SPEC READY` block verbatim — so the join key is recoverable rather than
    // lost. Reading one small file per in-flight task is the cost of not
    // labelling a running job "unlinked" when the evidence is right there.
    let source = task.spec_source;
    if (!source && task.in_flight && task.task_id) {
      try {
        source = parseSpecSource(fs.readFileSync(promptFile(checkout, task.task_id), 'utf8'));
      } catch {
        source = null;
      }
    }
    if (!source) continue;
    // The stage follows the task's phase, not its `in_flight` flag: a lock
    // standing over a finished run must not make a completed artefact read as
    // "executing".
    const stage =
      task.phase === 'running' || task.phase === 'settling' || task.phase === 'stalled'
        ? 'executing'
        : task.phase === 'receipt-ready'
          ? 'receipt-ready'
          : task.phase === 'awaiting-settlement'
            ? 'awaiting-settlement'
            : 'executed';
    record(source, stage);
  }
  for (const entry of mailbox.receipts) {
    const source = parseReceiptSpecSource(entry.receipt);
    if (!source) continue;
    record(source, entry.state === 'pending' ? 'receipt-ready' : entry.state === 'delivered' ? 'awaiting-settlement' : 'executed');
  }

  const items = [];
  let features = [];
  try {
    features = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    features = [];
  }
  for (const feature of features.slice(0, 60)) {
    const featureDir = path.join(root, feature.name);
    const files = [
      ...readMarkdownFiles(featureDir).map((file) => ({ file, kind: path.basename(file) === 'spec.md' ? 'spec' : 'doc' })),
      ...readMarkdownFiles(path.join(featureDir, 'issues')).map((file) => ({ file, kind: 'ticket' })),
    ];
    for (const { file, kind } of files) {
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(checkout, file).replace(/\\/g, '/');
      const ready = /SPEC READY/.test(text);
      const linked = bySource.get(rel);
      items.push({
        path: rel,
        feature: feature.name,
        kind,
        title: firstHeading(text, rel),
        has_spec_ready: ready,
        stage: linked || (ready ? 'ready' : kind === 'ticket' ? 'ticketed' : 'spec'),
        bytes: text.length,
        modifiedAt: (() => {
          try {
            return fs.statSync(file).mtimeMs;
          } catch {
            return null;
          }
        })(),
      });
    }
  }

  items.sort(
    (a, b) =>
      (STAGE_RANK[b.stage] || 0) - (STAGE_RANK[a.stage] || 0) ||
      a.feature.localeCompare(b.feature) ||
      a.path.localeCompare(b.path),
  );

  const stages = {};
  for (const item of items) stages[item.stage] = (stages[item.stage] || 0) + 1;

  return { root: '.scratch', present: true, items: items.slice(0, 200), truncated: items.length > 200, stages };
}

/**
 * Derived phase. One word that answers "what is happening?" — the field the
 * missing dashboard was supposed to show.
 */
export function derivePhase({ lock, run, mailbox, inFlightPhase, lastSignalMs: signal }) {
  // Same distinction the task phase makes: a queued mailbox entry is not a
  // receipt. A runner that died mid-flight leaves a queued entry with no body.
  const pending = mailbox.receipts.find((r) => r.state === 'pending');
  if (pending) return pending.receipt ? 'receipt-ready' : 'finished-no-receipt';
  const delivered = mailbox.receipts.find((r) => r.state === 'delivered');
  if (delivered) return delivered.receipt ? 'awaiting-settlement' : 'finished-no-receipt';
  if (!lock.present) {
    return mailbox.receipts.length ? 'settled' : 'idle';
  }
  // The in-flight task has already answered this question, with the full set of
  // signals. Deriving it a second way here is how a header and the task row it
  // sits above end up contradicting each other.
  if (inFlightPhase) return inFlightPhase;
  if (lock.state === 'orphaned') return 'orphaned';
  if (lock.state === 'settling') return 'settling';
  if (lock.state === 'runner-gone') return 'runner-exited';
  if (lock.state === 'no-holder') return 'lock-without-holder';
  if (lock.state === 'unknown') return 'unknown';
  const lastSignal = Number(signal || run?.updated_at || run?.started_at || 0);
  if (lastSignal && Date.now() - lastSignal > STALL_AFTER_MS) return 'stalled';
  return 'running';
}

/**
 * The full report. Everything the CLI prints, the dashboard renders and the
 * MCP tool returns comes from here, so the three can never disagree.
 */
export function buildReport(checkout, { logTailLines = 40, activityWindowMs = ACTIVITY_WINDOW_MS } = {}) {
  const lock = lockVerdict(checkout);
  const mailbox = loadMailbox(checkout);
  const journal = loadRunState(checkout);
  const run = latestRun(checkout, journal.runs);
  // Activity is read before the task list because it is one of the task's
  // liveness signals, and the task list is read before the checkout phase
  // because the in-flight task is the authority on that phase.
  const activity = recentFiles(checkout, { sinceMs: activityWindowMs });
  const tasks = taskList(checkout, { lock, mailbox, runs: journal.runs, activityFiles: activity.files });
  const inFlight = tasks.find((task) => task.in_flight) || null;
  const phase = derivePhase({
    lock,
    run,
    mailbox,
    inFlightPhase: inFlight ? inFlight.phase : null,
    lastSignalMs: inFlight ? inFlight.last_signal_at : undefined,
  });
  const logFile = run?.log || (run?.task_id ? runLogFile(checkout, run.task_id) : null);
  const logTail = logFile ? readTail(logFile, { maxLines: logTailLines }) : null;
  const failures = readTail(failureLogFile(checkout), { maxLines: 20 });

  // Settlement: what each returned receipt actually says. Parsing is pure and
  // cheap (the contract is read once per process), so it can ride along on
  // every report build; the live validator run is deliberately NOT here,
  // because that spawns a process and the board polls every two seconds.
  const settlementByTask = new Map();
  for (const entry of mailbox.receipts) {
    if (!entry || !entry.task_id) continue;
    settlementByTask.set(entry.task_id, {
      mailbox_state: entry.state,
      mailbox_finished_at: entry.finishedAt ?? null,
      receipt_source: entry.receipt_source ?? null,
      runner_exit: entry.runner_exit ?? null,
      output_truncated: Boolean(entry.output_truncated),
      summary: summarizeReceipt(entry.receipt),
      failure_tail: entry.receipt ? null : String(entry.raw_output_tail || '').slice(-800),
    });
  }
  for (const task of tasks) {
    if (settlementByTask.has(task.task_id)) task.settlement = settlementByTask.get(task.task_id);
  }
  const latestReceiptEntry = [...mailbox.receipts].reverse().find((entry) => entry && entry.task_id);
  const settlement = latestReceiptEntry
    ? { task_id: latestReceiptEntry.task_id, ...settlementByTask.get(latestReceiptEntry.task_id) }
    : null;

  const now = Date.now();
  const elapsedMs = lock.present && lock.holder
    ? now - Number(lock.holder.startedAt || now)
    : run?.started_at
      ? now - Number(run.started_at)
      : 0;

  return {
    checkout,
    generatedAt: now,
    phase,
    elapsedMs,
    head: gitHead(checkout),
    tasks,
    pendingReceipts: tasks.filter((task) => task.phase === 'receipt-ready').length,
    noReceipt: tasks.filter((task) => task.phase === 'finished-no-receipt').length,
    needsRecovery: tasks.filter((task) => task.needs_recovery).length,
    pipeline: pipeline(checkout, { tasks, mailbox }),
    settlement,
    telemetry: summarizeTelemetry(checkout),
    lock: {
      present: lock.present,
      state: lock.state,
      ageMs: lock.ageMs,
      supervisorAlive: lock.supervisorAlive ?? null,
      runnerAlive: lock.runnerAlive ?? null,
      holder: lock.holder
        ? {
            task_id: lock.holder.id ?? null,
            topic: lock.holder.topic ?? null,
            planner_session: lock.holder.planner_session ?? null,
            startedAt: lock.holder.startedAt ?? null,
            supervisor_pid: lock.holder.pid ?? null,
            runner_pid: lock.holder.runner_pid ?? null,
          }
        : null,
    },
    run: run
      ? {
          task_id: run.task_id,
          topic: run.topic ?? null,
          status: run.status ?? 'unknown',
          started_at: run.started_at ?? null,
          updated_at: run.updated_at ?? null,
          finished_at: run.finished_at ?? null,
          runner_pid: run.runner_pid ?? null,
          runner_exit: run.runner_exit ?? null,
          receipt_present: Boolean(run.receipt_present),
          spec_source: run.spec_source ?? null,
          log: run.log ?? null,
          note: run.note ?? null,
        }
      : null,
    logTail: logFile ? { file: logFile, lines: logTail || [] } : null,
    mailbox: mailbox.receipts.map((r) => ({
      task_id: r.task_id,
      topic: r.topic ?? null,
      state: r.state,
      runner_exit: r.runner_exit ?? null,
      finishedAt: r.finishedAt ?? null,
      hasReceipt: Boolean(r.receipt),
      output_truncated: Boolean(r.output_truncated),
    })),
    activity: {
      windowMs: activityWindowMs,
      truncated: activity.truncated,
      files: activity.files,
    },
    gitDirty: gitDirty(checkout),
    failures: failures || [],
  };
}

const PHASE_LABEL = {
  idle: '空闲',
  running: '执行中',
  settling: '收尾中（runner 已退出，待记回执）',
  stalled: '停滞（>20 分钟无新信号）',
  'receipt-ready': '回执待处理',
  'awaiting-settlement': '等待归档',
  settled: '已结算',
  'finished-no-receipt': '已结束（无可解析回执）',
  cancelled: '已取消',
  failed: '失败',
  'runner-exited': 'runner 已退出（待记回执）',
  'lock-without-holder': '锁存在但无持有者',
  orphaned: '监督进程已死（锁可回收）',
  unknown: '状态未知',
};

export function phaseLabel(phase) {
  return PHASE_LABEL[phase] || phase;
}

// Pipeline stages reuse the execution vocabulary where they overlap, and add
// the three stages that exist only before anything runs.
const STAGE_LABEL = {
  executing: '执行中',
  'receipt-ready': '回执待处理',
  'awaiting-settlement': '等待归档',
  executed: '已执行',
  ready: '就绪待执行',
  ticketed: '已拆分',
  spec: '已成型',
  doc: '规划文档',
};

export function stageLabel(stage) {
  return STAGE_LABEL[stage] || PHASE_LABEL[stage] || stage;
}

/**
 * Durations always carry seconds.
 *
 * A duration that stops at the minute is indistinguishable from a frozen one on
 * a board someone is watching precisely to decide whether a run is still alive.
 * `1h18m` holds still for sixty seconds at a time, which is why a live run read
 * as "the duration never updates" — the seconds are the whole point of the
 * display, so they are never dropped.
 */
export function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h${m}m${s}s`;
  if (m) return `${m}m${s}s`;
  return `${s}s`;
}

const ALIVE_LABEL = { true: '存活', false: '已退出', null: '未知' };

/** Plain-text rendering for the CLI. */
export function formatReport(report) {
  const lines = [];
  lines.push(`fork-loop 状态 · ${report.checkout}`);
  lines.push(`阶段：${phaseLabel(report.phase)}   已运行：${humanDuration(report.elapsedMs)}   HEAD：${report.head || 'n/a'}`);
  lines.push('');
  const lock = report.lock;
  if (!lock.present) {
    lines.push('锁：无（没有活跃执行）');
  } else {
    lines.push(`锁：${lock.state}   持有者=${lock.holder?.task_id || 'unknown'}   主题=${lock.holder?.topic || 'n/a'}`);
    lines.push(
      `     监督进程 pid=${lock.holder?.supervisor_pid ?? 'n/a'} (${ALIVE_LABEL[String(lock.supervisorAlive)]})` +
        `   runner pid=${lock.holder?.runner_pid ?? '未记录'} (${ALIVE_LABEL[String(lock.runnerAlive)]})`,
    );
  }
  lines.push('');
  const tasks = report.tasks || [];
  const actionable = [
    report.pendingReceipts ? `待归档回执：${report.pendingReceipts}` : '',
    report.noReceipt ? `无回执结束：${report.noReceipt}` : '',
    report.needsRecovery ? `待回收锁：${report.needsRecovery}` : '',
  ]
    .filter(Boolean)
    .join('   ');
  lines.push(`任务列表（${tasks.length} 条，最新在前）${actionable ? `   ${actionable}` : ''}`);
  if (!tasks.length) {
    lines.push('  （无：锁、state.json、信箱三处都没有任务记录）');
  } else {
    for (const task of tasks.slice(0, 12)) {
      const when = task.started_at ? new Date(task.started_at).toLocaleString() : '未知时间';
      lines.push(
        `  [${phaseLabel(task.phase)}] ${task.task_id}   ${humanDuration(task.elapsedMs)}   开始 ${when}`,
      );
      lines.push(
        `      主题=${task.topic || 'n/a'}   来源=${task.sources.join('+')}` +
          `   回执=${task.receipt_present ? '已提取' : '未提取'}${task.receipt_state ? `(${task.receipt_state})` : ''}` +
          `   exit=${task.runner_exit ?? 'n/a'}` +
          `${task.needs_recovery ? '   锁未回收（执行已结束但锁仍在，需 fail_receipt 或 release_execution）' : ''}`,
      );
      if (task.last_signal_at) {
        lines.push(
          `      最后信号=${new Date(task.last_signal_at).toLocaleTimeString()}（距今 ${humanDuration(Date.now() - task.last_signal_at)}）` +
            `${task.spec_source ? `   spec=${task.spec_source}` : ''}`,
        );
      }
      if (task.note) lines.push(`      备注=${task.note}`);
    }
    if (tasks.length > 12) lines.push(`  … 另有 ${tasks.length - 12} 条`);
  }
  lines.push('');

  const pipeline = report.pipeline || { present: false, items: [] };
  if (!pipeline.present) {
    lines.push('流水线：该 checkout 没有 .scratch 目录（本地 tracker 约定 .scratch/<feature>/spec.md + issues/）');
  } else {
    const counts = Object.entries(pipeline.stages || {})
      .map(([stage, count]) => `${stageLabel(stage)}×${count}`)
      .join('  ');
    lines.push(`流水线（计划中的工作，共 ${pipeline.items.length} 项）${counts ? `   ${counts}` : ''}`);
    if (!pipeline.items.length) lines.push('  （.scratch 下没有 markdown 规划件）');
    for (const item of pipeline.items.slice(0, 15)) {
      lines.push(`  [${stageLabel(item.stage)}] ${item.path}`);
      lines.push(`      ${item.title}${item.has_spec_ready ? '　（含 SPEC READY）' : ''}`);
    }
    if (pipeline.items.length > 15) lines.push(`  … 另有 ${pipeline.items.length - 15} 项`);
    if (pipeline.truncated) lines.push('  （列表已截断，只显示前 200 项）');
  }
  lines.push('');

  const settlement = report.settlement;
  if (!settlement) {
    lines.push('结算：没有回执可结算（最近一次运行没有产出，或还没有运行过）');
  } else {
    const s = settlement.summary || {};
    lines.push(
      `结算（task=${settlement.mailbox_state || 'n/a'}，回执=${s.present ? '有正文' : '无正文'}）`,
    );
    if (s.present) {
      const m = s.metrics || {};
      lines.push(
        `  结论=${s.conclusion ?? '（不合法）'}   验收证据=${s.criteria_evidenced ?? 0}/${s.criteria_total ?? 0}` +
          `   Docs delta=${s.docs_delta_none ? 'none' : `${s.docs_delta_count ?? 0} 行`}` +
          `   路由=${m.route ?? 'n/a'}`,
      );
      lines.push(
        `  归档门（本次记录）=${m.archive_gates ?? 'n/a'}   失败数=${m.archive_gate_failures ?? 'n/a'}` +
          `   grill 轮数=${m.grill_rounds ?? 'n/a'}   skill-friction=${m.skill_friction ?? 'n/a'}`,
      );
      if (s.docs_delta_lines && s.docs_delta_lines.length) {
        lines.push('  Docs delta 首几行（规划线程须沉淀进 CONTEXT.md / ADR）：');
        for (const line of s.docs_delta_lines.slice(0, 4)) lines.push(`    - ${line}`);
      }
      lines.push(
        s.problems && s.problems.length
          ? `  ⚠ 结构问题（${s.problems.length}）：${s.problems.slice(0, 3).join('；')}`
          : '  结构检查：通过（Schema / 结论 token / 逐条证据 / 无待决决策 / Docs delta / metrics 行）',
      );
      lines.push('  逐门机器校验：node scripts/receipt-gate.mjs --receipt <文件> --checkout <checkout>');
    } else if (settlement.failure_tail) {
      lines.push('  原始输出尾段（无可解析回执）：');
      for (const line of settlement.failure_tail.split(/\r?\n/).slice(-6)) lines.push(`    ${line}`);
    }
  }
  lines.push('');

  const telemetry = report.telemetry || {};
  const metrics = telemetry.metrics || { present: false };
  if (!metrics.present) {
    lines.push('遥测台账：该 checkout 没有 docs/metrics.md（回执归档时由规划线程追加）');
  } else if (!metrics.rows) {
    lines.push('遥测台账（docs/metrics.md）：还没有数据行');
  } else {
    lines.push(`遥测台账（docs/metrics.md，${metrics.rows} 行）`);
    lines.push(
      `  门放行=${metrics.gate_pass}/${metrics.rows}   门失败累计=${metrics.gate_failures}` +
        `   证据累计=${metrics.criteria_evidenced ?? 'n/a'}   摩擦非 none=${metrics.friction_rows} 行`,
    );
    const quality = Object.entries(metrics.quality || {})
      .map(([label, count]) => `${label}×${count}`)
      .join('  ');
    const routes = Object.entries(metrics.routes || {})
      .map(([route, count]) => `${route}×${count}`)
      .join('  ');
    lines.push(`  质量标签：${quality || '（无）'}   路由：${routes || '（无）'}`);
    if (metrics.weeks && metrics.weeks.length) {
      lines.push(`  周分布：${metrics.weeks.map((week) => `${week.week}×${week.rows}`).join('  ')}`);
    }
    lines.push('  最近 8 行（最新在前）：');
    for (const row of metrics.recent || []) {
      lines.push(
        `    ${row.date || '?'}  ${row.spec_source || '?'}  路由=${row.route || '?'}` +
          `  门=${row.archive_gates || '?'}  质量=${row.quality || '（未填）'}`,
      );
    }
  }

  const friction = telemetry.friction || { present: false, entries: 0 };
  if (!friction.present) {
    lines.push('摩擦日志：该 checkout 没有 docs/skill-friction-log.md');
  } else if (!friction.entries) {
    lines.push('摩擦日志（docs/skill-friction-log.md）：无条目（= 无跨回执重复摩擦）');
  } else {
    const bySkill = Object.entries(friction.by_skill || {})
      .map(([skill, count]) => `${skill}×${count}`)
      .join('  ');
    lines.push(`摩擦日志（${friction.entries} 条）  按技能：${bySkill}`);
    for (const entry of friction.recent || []) {
      lines.push(`    ${entry.date || '?'}  ${entry.skill || '?'}  ${entry.friction || ''}`);
    }
  }
  const signals = telemetry.signals || {};
  if (signals.repeat_friction_skills && signals.repeat_friction_skills.length) {
    lines.push(`  ⚠ 重复摩擦（≥2 次，是 /project-standards audit 与 /harvest 的输入）：${signals.repeat_friction_skills.join('、')}`);
  }
  lines.push('');
  if (report.gitDirty === null) {
    lines.push('工作树：git 不可用，无法核验');
  } else if (report.gitDirty.length === 0) {
    lines.push('工作树：干净');
  } else {
    lines.push(`工作树：${report.gitDirty.length} 项改动`);
    for (const line of report.gitDirty.slice(0, 15)) lines.push(`  ${line}`);
    if (report.gitDirty.length > 15) lines.push(`  … 另有 ${report.gitDirty.length - 15} 项`);
  }
  lines.push('');
  const activity = report.activity.files;
  lines.push(`最近 ${humanDuration(report.activity.windowMs)} 内改动文件：${activity.length} 个${report.activity.truncated ? '（扫描被截断）' : ''}`);
  for (const file of activity.slice(0, 12)) {
    lines.push(`  ${new Date(file.mtimeMs).toLocaleTimeString()}  ${path.relative(report.checkout, file.path)}`);
  }
  if (activity.length > 12) lines.push(`  … 另有 ${activity.length - 12} 个`);
  if (report.logTail) {
    lines.push('');
    lines.push(`runner 日志尾段（${path.relative(report.checkout, report.logTail.file) || report.logTail.file}）：`);
    const tail = report.logTail.lines.slice(-12);
    if (!tail.length) lines.push('  （空）');
    for (const line of tail) lines.push(`  ${line}`);
  }
  if (report.failures.length) {
    lines.push('');
    lines.push('failures.log 尾段：');
    for (const line of report.failures.slice(-5)) lines.push(`  ${line}`);
  }
  return lines.join('\n');
}

/** True when something is in flight or awaiting settlement. */
export function isBusy(report) {
  return report.lock.present || report.phase === 'receipt-ready' || report.phase === 'awaiting-settlement';
}

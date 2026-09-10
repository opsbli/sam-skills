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


import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'fork-loop-mcp', version: '1.0.0' };
const RECEIPT_MARKER = 'SPEC EXECUTION RECEIPT';
const RECEIPT_SCHEMA_LINE = /Schema:\s*spec-executor-receipt\/v1/i;

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
 * mkdir is atomic on all platforms; a stale lock older than 6h is broken.
 */
function lockFile(checkout) {
  return path.join(stateRoot(checkout), `exec-${safeName(checkout)}.lock`);
}

function acquireLock(checkout, task) {
  const file = lockFile(checkout);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.mkdirSync(file);
  } catch {
    const stale = Date.now() - (readJson(path.join(file, 'task.json'), { startedAt: 0 }).startedAt || 0);
    if (stale > 6 * 60 * 60 * 1000) {
      fs.rmSync(file, { recursive: true, force: true });
      try {
        fs.mkdirSync(file);
      } catch {
        return { ok: false, holder: readJson(path.join(file, 'task.json'), {}) };
      }
    } else {
      return { ok: false, holder: readJson(path.join(file, 'task.json'), {}) };
    }
  }
  writeJson(path.join(file, 'task.json'), task);
  return { ok: true };
}

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

/** Pull the receipt block out of runner output; tolerate trailing chatter. */
function extractReceipt(text) {
  const idx = text.indexOf(RECEIPT_MARKER);
  if (idx < 0) return null;
  return text.slice(idx).trim();
}

function extractSessionId(text) {
  const m = /sess_[0-9a-f-]{36}/i.exec(text);
  return m ? m[0] : null;
}

/** Launch the headless runner; resolve with the runner's full stdout. */
function runHeadless(checkout, prompt, maxTurns) {
  const cmd = resolveCliCommand(process.env);
  const [bin, ...baseArgs] = cmd.split(/\s+/);
  const args = [...baseArgs, '-p', prompt, '--cwd', checkout, '--json'];
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(bin, args, {
      cwd: checkout,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, 90 * 60 * 1000); // hard cap: 90 minutes
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: `${err}\n${e.message}` });
    });
  });
}

let taskSeq = 0;

/** spawn_execution — the fork_thread replacement. */
async function spawnExecution(args) {
  const checkout = args.checkout;
  if (!checkout || !fs.existsSync(checkout)) {
    return { ok: false, error: 'checkout path missing or does not exist' };
  }
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
    'The following SPEC READY block is the launch command for this session. Run /spec-executor against it.',
    'When finished, end your final message with exactly one complete SPEC EXECUTION RECEIPT block',
    '(first field: Schema: spec-executor-receipt/v1). Do not commit, push, or take any external action.',
    '',
    String(args.spec_ready),
  ].join('\n');
  const result = await runHeadless(checkout, prompt, args.max_turns);
  const receipt = extractReceipt(result.out) || extractReceipt(result.err);
  const box = loadMailbox(checkout);
  const entry = {
    task_id: task.id,
    planner_session: task.planner_session,
    topic: task.topic,
    checkout,
    state: 'pending',
    runner_exit: result.code,
    runner_session_id: extractSessionId(result.out),
    receipt,
    raw_output_tail: (result.out + result.err).slice(-2000),
    finishedAt: Date.now(),
  };
  box.receipts.push(entry);
  saveMailbox(checkout, box);
  return {
    ok: true,
    task_id: task.id,
    runner_exit: result.code,
    runner_session_id: entry.runner_session_id,
    receipt_extracted: Boolean(receipt),
    note: receipt
      ? 'receipt stored as pending; planner Stop hook will deliver it'
      : 'runner produced no parseable receipt; stored with raw output tail for inspection',
  };
}

/** check_mailbox — the Stop hook polls this; deliver pending receipts once. */
async function checkMailbox(args) {
  const checkout = args.checkout;
  const box = loadMailbox(checkout);
  const deliverable = box.receipts.filter(
    (r) => r.state === 'pending' && (!args.planner_session || r.planner_session === args.planner_session)
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
  releaseLock(checkout);
  return { ok: true, task_id: entry.task_id, state };
}

const TOOLS = {
  spawn_execution: {
    description:
      'Launch a headless ZCode execution session on this checkout with a SPEC READY contract. Returns when the runner exits; the receipt lands in the mailbox. Requires the planning session to register the Stop hook that delivers it.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'spec_ready'],
      properties: {
        checkout: { type: 'string', description: 'Absolute path of the shared checkout' },
        spec_ready: { type: 'string', description: 'The complete SPEC READY block (launch command)' },
        topic: { type: 'string', description: 'Short non-sensitive topic for the execution' },
        planner_session: { type: 'string', description: 'sess_… id of the planning session' },
        max_turns: { type: 'number', description: 'Optional --max-turns cap for the headless runner' },
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
      'Mark a delivered receipt accepted (six gates passed, Docs delta settled). Releases the checkout execution lock.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'task_id'],
      properties: { checkout: { type: 'string' }, task_id: { type: 'string' } },
    },
  },
  fail_receipt: {
    description:
      'Mark a delivered receipt rejected (validation failure). Releases the checkout execution lock.',
    inputSchema: {
      type: 'object',
      required: ['checkout', 'task_id'],
      properties: { checkout: { type: 'string' }, task_id: { type: 'string' } },
    },
  },
  release_execution: {
    description:
      'Recovery path: drop the checkout execution lock without settling a receipt. Only when a runner is confirmed dead and no receipt will arrive.',
    inputSchema: {
      type: 'object',
      required: ['checkout'],
      properties: { checkout: { type: 'string' } },
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
    case 'release_execution':
      releaseLock(args.checkout);
      return { ok: true, released: true };
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

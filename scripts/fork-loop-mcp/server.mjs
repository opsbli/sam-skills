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

/**
 * Launch the headless runner; resolve with the runner's full stdout.
 * The prompt is written to a temp file and the runner is asked to Read it:
 * Windows shells truncate multi-line argv at the first newline, but a file
 * reference survives. Tested against 0.16.5 on win32.
 */
function runHeadless(checkout, prompt, maxTurns, taskId) {
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
    '- Conclusion: completed / partially completed / blocked',
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
  const result = await runHeadless(checkout, prompt, args.max_turns, task.id);
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

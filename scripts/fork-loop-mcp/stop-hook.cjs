#!/usr/bin/env node
/**
 * stop-hook — ZCode Stop hook for the fork-loop mailbox (ADR 0005).
 *
 * Reads the hook input JSON on stdin, asks the mailbox for a pending receipt
 * addressed to this planner session, and — only when one exists — emits the
 * Stop-continuation output that injects the receipt into the conversation:
 *   {"hookEventName":"Stop","additionalContext":"<receipt>","continue":true}
 * Empty mailbox → empty stdout, exit 0 (silent pass).
 *
 * One receipt consumes one of ZCode's three Stop continuations, so the loop
 * is bounded by design.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Locate the checkout: hook input cwd, else walk up from CWD looking for .zcode/fork-loop. */
function findCheckout(input) {
  const candidates = [];
  if (input && input.cwd) candidates.push(input.cwd);
  if (process.env.ZCODE_PROJECT_DIR) candidates.push(process.env.ZCODE_PROJECT_DIR);
  if (process.env.CLAUDE_PROJECT_DIR) candidates.push(process.env.CLAUDE_PROJECT_DIR);
  candidates.push(process.cwd());
  for (const start of candidates) {
    if (!start) continue;
    let dir = path.resolve(start);
    for (let i = 0; i < 12; i++) {
      if (fs.existsSync(path.join(dir, '.zcode', 'fork-loop', 'mailbox.json'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/**
 * The mailbox path, resolved the same way the MCP server resolves it.
 *
 * FORK_LOOP_STATE_DIR has to be honoured here as well. With an override the
 * mailbox lives outside the checkout, so the upward search above finds no
 * anchor — and the hook would go permanently silent while the server kept
 * writing receipts nobody ever delivered.
 */
function stateDir(checkout) {
  return process.env.FORK_LOOP_STATE_DIR || path.join(checkout, '.zcode', 'fork-loop');
}

function mailboxFile(checkout) {
  return path.join(stateDir(checkout), 'mailbox.json');
}

/** The anchored search first; under an override, the directory we were handed. */
function resolveCheckout(input) {
  const anchored = findCheckout(input);
  if (anchored) return anchored;
  if (!process.env.FORK_LOOP_STATE_DIR) return null;
  const start =
    (input && input.cwd) ||
    process.env.ZCODE_PROJECT_DIR ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.cwd();
  return path.resolve(start);
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // unparseable hook input: stay silent rather than fail the run
  }
  const checkout = resolveCheckout(input);
  if (!checkout) process.exit(0);

  let box;
  try {
    box = JSON.parse(fs.readFileSync(mailboxFile(checkout), 'utf8'));
  } catch {
    process.exit(0);
  }
  // A malformed mailbox must never fail the run. `box.receipts.find` on a `{}` —
  // or on anything that is not an array — throws a TypeError, and a hook that
  // throws blocks the very Stop event it exists to serve.
  if (!box || !Array.isArray(box.receipts)) process.exit(0);
  const sessionId = input.session_id || input.sessionId || process.env.CLAUDE_SESSION_ID || null;
  // An unidentified session must not be read as "anyone". The runner session
  // inherits this same Stop hook, so a wildcard match would hand the planner's
  // receipt to whichever session stopped first — a silent mis-delivery that
  // looks exactly like a successful one. A receipt with no recorded planner
  // session is the only one an unidentified hook may take.
  const mail = box.receipts.find(
    (r) => r.state === 'pending' && (r.planner_session ? r.planner_session === sessionId : true)
  );
  if (!mail) process.exit(0);

  // Mark delivered so the next Stop does not re-deliver (exactly-once per receipt).
  // Written through a temp file and renamed, matching writeJson on the MCP side:
  // the two processes read-modify-write the same mailbox, and a torn write there
  // loses whichever update landed first.
  mail.state = 'delivered';
  mail.deliveredAt = Date.now();
  const file = mailboxFile(checkout);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(box, null, 2));
    fs.renameSync(tmp, file);
  } catch (error) {
    // Delivering unpersisted risks a redelivery on the next Stop; blocking the
    // Stop event instead loses the receipt entirely, because a hook that exits
    // non-zero does not hand the planner anything. Choose the redelivery, and
    // leave a line where the next diagnosis will look.
    try {
      fs.appendFileSync(
        path.join(path.dirname(file), 'failures.log'),
        `${new Date().toISOString()} stop-hook could not persist delivery of ${mail.task_id}: ${error && error.message}\n`,
      );
    } catch {
      /* the disk is the thing that failed */
    }
  }

  const context = [
    `[fork-loop] Execution receipt returned (task ${mail.task_id}, topic: ${mail.topic || 'n/a'}).`,
    'Process it now per execute-spec-in-fork: validate against the six archive gates, settle a non-`none`',
    'Docs delta via /domain-modeling, then call fork-loop-mcp ack_receipt (or fail_receipt on validation failure).',
    mail.receipt ? '' : `[fork-loop] WARNING: no parseable receipt in runner output. Raw tail:\n${(mail.raw_output_tail || '').slice(-800)}`,
    '',
    mail.receipt || '',
  ]
    .filter(Boolean)
    .join('\n');

  process.stdout.write(
    JSON.stringify({ hookEventName: 'Stop', additionalContext: context, continue: true })
  );
}

main();

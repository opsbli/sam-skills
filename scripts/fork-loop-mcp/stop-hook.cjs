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

function mailboxFile(checkout) {
  return path.join(checkout, '.zcode', 'fork-loop', 'mailbox.json');
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // unparseable hook input: stay silent rather than fail the run
  }
  const checkout = findCheckout(input);
  if (!checkout) process.exit(0);

  let box;
  try {
    box = JSON.parse(fs.readFileSync(mailboxFile(checkout), 'utf8'));
  } catch {
    process.exit(0);
  }
  const sessionId = input.session_id || input.sessionId || process.env.CLAUDE_SESSION_ID || null;
  const mail = box.receipts.find(
    (r) => r.state === 'pending' && (!sessionId || !r.planner_session || r.planner_session === sessionId)
  );
  if (!mail) process.exit(0);

  // Mark delivered so the next Stop does not re-deliver (exactly-once per receipt).
  mail.state = 'delivered';
  mail.deliveredAt = Date.now();
  fs.writeFileSync(mailboxFile(checkout), JSON.stringify(box, null, 2));

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

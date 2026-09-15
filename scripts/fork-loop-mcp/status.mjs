#!/usr/bin/env node
/**
 * status.mjs — "what is the fork loop doing right now?"
 *
 * The gap this closes: `spawn_execution` returns as soon as the runner starts,
 * and the receipt only lands when the runner exits. In between, the planning
 * session has a task id and nothing else — a runner making steady progress and
 * a runner that died on launch look exactly the same. This prints the phase,
 * the two pids and whether each is alive, the files the runner has touched, its
 * log tail, and the mailbox state.
 *
 * Usage:
 *   node status.mjs --checkout <path> [--json] [--log-tail 60]
 *   node status.mjs --checkout <path> --watch [--interval 3000]
 *   node status.mjs --scan <dir>            # every checkout under <dir>
 *   node status.mjs --checkout <path> --require-idle   # exit 3 when busy
 *
 * Exit codes: 0 report printed · 2 bad usage · 3 --require-idle found work.
 * Read-only. Zero dependencies. Node 18+.
 *
 * It is placed in the checkout, not in the plugin, on purpose: this is the
 * command an operator reaches for when the plugin itself is suspect, so it must
 * keep working when the MCP server, the Stop hook, or the harness is the thing
 * that broke.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildReport, formatReport, isBusy, phaseLabel, humanDuration } from './runstate.mjs';

function parseArgs(argv) {
  const opts = { json: false, watch: false, interval: 3000, logTail: 60, requireIdle: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--watch') opts.watch = true;
    else if (arg === '--require-idle') opts.requireIdle = true;
    else if (arg === '--checkout') opts.checkout = argv[++i];
    else if (arg === '--scan') opts.scan = argv[++i];
    else if (arg === '--interval') opts.interval = Number(argv[++i]) || 3000;
    else if (arg === '--log-tail') opts.logTail = Number(argv[++i]) || 60;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error(`status: unknown argument ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

const USAGE = `用法:
  node status.mjs --checkout <path> [--json] [--log-tail 60]
  node status.mjs --checkout <path> --watch [--interval 3000]
  node status.mjs --scan <dir>
  node status.mjs --checkout <path> --require-idle     # 有在执行或待归档即 exit 3

退出码: 0 已输出 · 2 用法错误 · 3 --require-idle 发现有工作`;

/** Checkouts under `dir` that carry fork-loop state (depth-limited, no descent into skill trees). */
function findCheckouts(dir, depth = 3, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  if (fs.existsSync(path.join(dir, '.zcode', 'fork-loop'))) out.push(dir);
  if (depth <= 0) return out;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (['.git', 'node_modules', '.zcode', 'dist', 'build'].includes(entry.name)) continue;
    findCheckouts(path.join(dir, entry.name), depth - 1, out);
  }
  return out;
}

function render(report, opts) {
  if (opts.json) return JSON.stringify(report, null, 2);
  return formatReport(report);
}

function runOnce(opts) {
  const report = buildReport(opts.checkout, { logTailLines: opts.logTail });
  process.stdout.write(`${render(report, opts)}\n`);
  if (opts.requireIdle && isBusy(report)) {
    if (!opts.json) {
      process.stdout.write('\n--require-idle: 有执行在飞或回执待归档，exit 3\n');
    }
    process.exit(3);
  }
  process.exit(0);
}

function runWatch(opts) {
  const draw = () => {
    const report = buildReport(opts.checkout, { logTailLines: opts.logTail });
    process.stdout.write('\u001b[2J\u001b[H');
    process.stdout.write(`${formatReport(report)}\n`);
    process.stdout.write(`\n（每 ${opts.interval}ms 刷新，Ctrl-C 退出）\n`);
  };
  draw();
  const timer = setInterval(draw, Math.max(500, opts.interval));
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write('\n');
    process.exit(0);
  });
}

function runScan(dir) {
  const checkouts = findCheckouts(path.resolve(dir));
  if (!checkouts.length) {
    console.log(`status: ${dir} 下没有找到 fork-loop 状态目录`);
    process.exit(0);
  }
  console.log(`status: ${checkouts.length} 个 checkout 带 fork-loop 状态`);
  for (const checkout of checkouts) {
    const report = buildReport(checkout, { logTailLines: 0 });
    const lock = report.lock.present
      ? `${report.lock.state} task=${report.lock.holder?.task_id || '?'}`
      : 'free';
    console.log(
      `  ${phaseLabel(report.phase).padEnd(12)} ${humanDuration(report.elapsedMs).padEnd(7)} ${lock.padEnd(48)} ${checkout}`,
    );
  }
  process.exit(0);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}
if (opts.scan) runScan(opts.scan);
if (!opts.checkout) {
  console.error(USAGE);
  process.exit(2);
}
opts.checkout = path.resolve(opts.checkout);
if (!fs.existsSync(opts.checkout)) {
  console.error(`status: checkout not found: ${opts.checkout}`);
  process.exit(2);
}
if (opts.watch) runWatch(opts);
runOnce(opts);

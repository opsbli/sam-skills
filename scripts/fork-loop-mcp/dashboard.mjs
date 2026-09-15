#!/usr/bin/env node
/**
 * dashboard.mjs — the web board for in-flight fork-loop executions.
 *
 * This is the surface that was missing: `status.mjs` answers the question once,
 * in a terminal the operator may not be looking at. The board answers it
 * continuously — phase, elapsed time, both pids and whether each is alive, the
 * files the runner has touched, its log tail, and the mailbox — from any
 * browser on the machine.
 *
 * Usage:
 *   node dashboard.mjs --checkout <path> [--port 7788] [--log-tail 60]
 *   node dashboard.mjs --checkout <path> --snapshot <out.html>   # static, publishable
 *
 * Binds 127.0.0.1 by default. A non-loopback --host is refused unless
 * --allow-remote is also passed, because the board prints real filesystem paths
 * and a runner's raw output; that is not something to expose by accident.
 *
 * Read-only: it reads the checkout and the fork-loop state directory, and
 * serves. It never writes into the checkout. Zero dependencies. Node 18+.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, loadMailbox } from './runstate.mjs';
import { validateReceipt } from './settlement.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, 'dashboard.html');
const PLACEHOLDER = '__FORK_LOOP_BOOTSTRAP__';

function parseArgs(argv) {
  const opts = { port: 7788, host: '127.0.0.1', logTail: 60, allowRemote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--checkout') opts.checkout = argv[++i];
    else if (arg === '--port') opts.port = Number(argv[++i]);
    else if (arg === '--host') opts.host = argv[++i];
    else if (arg === '--log-tail') opts.logTail = Number(argv[++i]) || 60;
    else if (arg === '--snapshot') opts.snapshot = argv[++i];
    else if (arg === '--allow-remote') opts.allowRemote = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error(`dashboard: unknown argument ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

const USAGE = `用法:
  node dashboard.mjs --checkout <path> [--port 7788] [--host 127.0.0.1] [--log-tail 60]
  node dashboard.mjs --checkout <path> --snapshot <out.html>

看板默认只监听 127.0.0.1。要绑定非回环地址必须显式加 --allow-remote
（看板会显示真实文件路径与 runner 原始输出）。`;

function renderPage(bootstrap) {
  let template;
  try {
    template = fs.readFileSync(TEMPLATE, 'utf8');
  } catch (error) {
    console.error(`dashboard: cannot read template ${TEMPLATE}: ${error.message}`);
    process.exit(2);
  }
  // `</script>` inside a JSON payload would close the host script element early.
  const payload = JSON.stringify(bootstrap).replace(/<\//g, '<\\/');
  return template.replace(PLACEHOLDER, payload);
}

function reportFor(checkout, logTail) {
  try {
    return buildReport(checkout, { logTailLines: logTail });
  } catch (error) {
    return { checkout, generatedAt: Date.now(), phase: 'unknown', error: String(error && error.message) };
  }
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!opts.checkout) {
  console.error(USAGE);
  process.exit(2);
}
opts.checkout = path.resolve(opts.checkout);
if (!fs.existsSync(opts.checkout)) {
  console.error(`dashboard: checkout not found: ${opts.checkout}`);
  process.exit(2);
}

if (opts.snapshot) {
  const page = renderPage({ report: reportFor(opts.checkout, opts.logTail), snapshot: true });
  fs.mkdirSync(path.dirname(path.resolve(opts.snapshot)), { recursive: true });
  fs.writeFileSync(path.resolve(opts.snapshot), page, 'utf8');
  console.log(`dashboard: 快照已写入 ${path.resolve(opts.snapshot)}`);
  process.exit(0);
}

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(opts.host);
if (!loopback && !opts.allowRemote) {
  console.error(
    `dashboard: 拒绝绑定 ${opts.host} — 看板会暴露本地文件路径与 runner 输出。\n` +
      '           确认要这么做再加 --allow-remote。',
  );
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/state') {
    const body = JSON.stringify(reportFor(opts.checkout, opts.logTail));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (url.pathname === '/api/validate') {
    // Live per-gate verdict, on demand. Deliberately NOT part of /api/state: it
    // spawns the validator, the board polls every two seconds, and a written
    // receipt never changes — so it runs once per task and is memoised.
    const taskId = url.searchParams.get('task');
    const entry = loadMailbox(opts.checkout).receipts.find((r) => r.task_id === taskId);
    const body = !entry
      ? JSON.stringify({ ran: false, reason: `unknown task_id ${taskId}` })
      : JSON.stringify(validateReceipt(entry.receipt, { checkout: opts.checkout, taskId: entry.task_id }));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const body = renderPage({ report: reportFor(opts.checkout, opts.logTail), snapshot: false });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`dashboard: 端口 ${opts.port} 已被占用，换一个 --port 再试。`);
    process.exit(2);
  }
  console.error(`dashboard: ${error.message}`);
  process.exit(2);
});

server.listen(opts.port, opts.host, () => {
  const port = server.address().port;
  console.log(`fork-loop 看板: http://${opts.host}:${port}/`);
  console.log(`checkout: ${opts.checkout}`);
  console.log('Ctrl-C 停止。');
  if (!loopback) console.log('注意：已绑定非回环地址，--allow-remote 生效。');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    process.exit(0);
  });
}

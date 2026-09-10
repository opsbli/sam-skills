import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forkloop-'));
const stateDir = path.join(os.tmpdir(), 'flstate-' + Date.now());

const server = spawn('node', ['scripts/fork-loop-mcp/server.mjs'], { stdio: ['pipe','pipe','pipe'], env: { ...process.env, FORK_LOOP_STATE_DIR: stateDir } });
let buf = '';
const pending = new Map();
server.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i+1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
server.stderr.on('data', d => process.stderr.write('[srv] '+d));
function rpc(method, params) {
  return new Promise(res => {
    const id = Math.random().toString(36).slice(2);
    pending.set(id, res);
    server.stdin.write(JSON.stringify({ jsonrpc:'2.0', id, method, params }) + '\n');
  });
}
const init = await rpc('initialize', { protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'test',version:'0'} });
console.log('init:', init.result.serverInfo.name, init.result.protocolVersion);
const list = await rpc('tools/list', {});
console.log('tools:', list.result.tools.map(t=>t.name).join(','));
const checkout = tmp;
const mailbox = path.join(stateDir, 'mailbox.json');
fs.mkdirSync(path.dirname(mailbox), {recursive:true});
fs.writeFileSync(mailbox, JSON.stringify({receipts:[{
  task_id:'t1', planner_session:'sess_A', topic:'demo', checkout, state:'pending', runner_exit:0,
  receipt:'SPEC EXECUTION RECEIPT\n\n- Schema: spec-executor-receipt/v1\n- Conclusion: completed\n'}]}));
const lockDir = path.join(stateDir, `exec-${crypto.createHash('sha256').update(path.resolve(checkout)).digest('hex').slice(0,16)}.lock`);
fs.mkdirSync(lockDir, {recursive:true});
fs.writeFileSync(path.join(lockDir,'task.json'), JSON.stringify({id:'t1',startedAt:Date.now()}));

const empty = await rpc('tools/call', { name:'check_mailbox', arguments:{ checkout, planner_session:'sess_other' } });
console.log('other-session mail:', JSON.parse(empty.result.content[0].text).mail === null ? 'none (correct)' : 'WRONG');
const hit = await rpc('tools/call', { name:'check_mailbox', arguments:{ checkout, planner_session:'sess_A' } });
const mail = JSON.parse(hit.result.content[0].text).mail;
console.log('planner mail:', mail && mail.receipt.includes('Schema: spec-executor-receipt/v1') ? 'delivered with v1 schema (correct)' : 'WRONG');
const again = await rpc('tools/call', { name:'check_mailbox', arguments:{ checkout, planner_session:'sess_A' } });
console.log('re-poll:', JSON.parse(again.result.content[0].text).mail === null ? 'none, exactly-once (correct)' : 'WRONG');
const ack = await rpc('tools/call', { name:'ack_receipt', arguments:{ checkout, task_id:'t1' } });
const ackRes = JSON.parse(ack.result.content[0].text);
console.log('ack:', ackRes.ok && ackRes.state==='done' ? 'done, lock released (correct)' : 'WRONG');
console.log('lockdir after ack:', fs.existsSync(lockDir) ? 'WRONG still exists' : 'gone (correct)');
server.kill();
process.exit(0);

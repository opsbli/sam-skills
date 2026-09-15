#!/usr/bin/env node
/**
 * settlement — the read side of the receipt: what did this run hand back, and
 * did it pass?
 *
 * The board could say "a receipt arrived" and nothing else, which leaves the
 * two questions an operator actually has unanswered: *what is in it* (the
 * conclusion, the evidenced criteria, the Docs delta the planning thread must
 * settle) and *did it clear the archive gates*.
 *
 * Two levels of result, deliberately separated by cost:
 *
 *  - `summarizeReceipt` is pure parsing against contracts/receipt-v2.json. It
 *    runs on every report build, so it must never spawn anything or throw.
 *  - `validateReceipt` spawns the real validator (`scripts/receipt-gate.mjs`)
 *    and reports its per-gate verdict. It is a child process, so it is called
 *    on demand — never once per dashboard poll — and memoised, because a
 *    written receipt never changes.
 *
 * The gate rules live in the validator and the contract, never here: a second
 * copy of "what gate 4 means" is how the board and the gate start disagreeing.
 * Read-only. Zero dependencies. Node 18+.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, '..', '..');
const CONTRACT_PATH = path.join(REPO, 'contracts', 'receipt-v2.json');
const VALIDATOR = path.join(REPO, 'scripts', 'receipt-gate.mjs');

const FIELD_RE = /^\s*-\s*([A-Za-z][A-Za-z0-9 /-]*?)\s*:\s?(.*)$/;
const MARKER_RE = /(pass|fail|✅|❌)/i;

let contractCache = null;

/** The contract, read once per process: it cannot change under a running board. */
export function loadReceiptContract() {
  if (!contractCache) contractCache = loadContract();
  return contractCache;
}

function loadContract() {
  const raw = fs.readFileSync(CONTRACT_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Field name → value, in order, from the receipt block. Tolerates fences. */
export function parseReceiptFields(receiptText) {
  const lines = String(receiptText || '').split(/\r?\n/);
  const fields = [];
  let current = null;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) continue;
    const match = raw.match(FIELD_RE);
    if (match) {
      current = { name: match[1].trim(), value: match[2] };
      fields.push(current);
      continue;
    }
    if (current && raw.trim() !== '') current.value += `\n${raw}`;
  }
  return fields;
}

function fieldValue(fields, name) {
  const found = fields.find((field) => field.name === name);
  return found ? found.value.trim() : null;
}

/**
 * The same evidence bar the validator's gate 4 applies: a pass/fail marker plus
 * something that reads as evidence — a command, an output, or a sentence.
 */
function criterionIsEvidenced(entry) {
  if (!entry.trim()) return false;
  if (!MARKER_RE.test(entry)) return false;
  if (/`[^`]+`/.test(entry)) return true;
  const match = entry.match(/(pass|fail|✅|❌)\s*[:：\-—–]?\s*([\s\S]*)$/i);
  if (!match) return false;
  return match[2].replace(/[`*_\s:：，,。.；;—\-–]/g, '').length >= 3;
}

/** `archive-gates: pass | archive-gate-failures: 0 | …` → an object. */
export function parseMetricsLine(line) {
  if (!line) return null;
  const metrics = {};
  for (const part of String(line).split('|')) {
    const [key, ...rest] = part.split(':');
    if (!key || rest.length === 0) continue;
    const name = key.trim().replace(/-/g, '_');
    if (!name) continue;
    metrics[name] = rest.join(':').trim();
  }
  return Object.keys(metrics).length ? metrics : null;
}

function firstLines(text, count) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Pure summary of one receipt. Never spawns, never throws — a malformed
 * receipt is reported as problems, because a monitor that dies on the thing it
 * is meant to report is useless exactly when it is needed.
 */
export function summarizeReceipt(receiptText, { contract } = {}) {
  let active;
  try {
    active = contract || loadReceiptContract();
  } catch (error) {
    return {
      ok: false,
      present: Boolean(receiptText),
      problems: [`契约不可读，无法判定回执：${error && error.message}`],
      fields: [],
      gates_expected: null,
    };
  }

  if (!receiptText) {
    return {
      ok: false,
      present: false,
      problems: ['没有回执正文 — 这是一次没有产出的运行'],
      fields: [],
      schema_expected: active.schema,
      conclusion_tokens: active.conclusionTokens,
      gates_expected: active.gates.length,
    };
  }

  const fields = parseReceiptFields(receiptText);
  const names = fields.map((field) => field.name);
  const problems = [];

  const missing = active.requiredFields.filter((name) => !names.includes(name));
  if (missing.length) problems.push(`缺字段：${missing.join('、')}`);

  if (names[0] !== 'Schema') {
    problems.push(`首字段是 ${names[0] || '（无）'}，契约要求 Schema（结构准入，不手补）`);
  }
  const schema = fieldValue(fields, 'Schema');
  if (schema !== active.schema) {
    problems.push(`Schema 为 "${schema ?? '（缺失）'}"，契约要求 "${active.schema}"`);
  }

  const conclusionRaw = fieldValue(fields, 'Conclusion');
  const conclusionLine = (conclusionRaw || '').split(/\r?\n/)[0].trim();
  const tokens = conclusionLine.split(/\s+/).filter(Boolean);
  const conclusion = tokens.length === 1 ? tokens[0] : null;
  if (!conclusion) {
    problems.push(`Conclusion 首行不是单一 token："${conclusionLine}"`);
  } else if (!active.conclusionTokens.includes(conclusion)) {
    problems.push(`Conclusion "${conclusion}" 不在契约词表 ${active.conclusionTokens.join('/')} 内`);
  }
  if (conclusion && conclusion !== 'completed') {
    problems.push(`Conclusion 为 "${conclusion}"，归档门只放行 completed`);
  }

  const criteria = (fieldValue(fields, 'Acceptance criteria') || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const evidenced = criteria.filter(criterionIsEvidenced).length;
  if (!criteria.length) problems.push('验收标准区为空');
  else if (evidenced !== criteria.length) {
    problems.push(`验收标准 ${evidenced}/${criteria.length} 条附证据，其余缺 pass/fail 标记或证据`);
  }

  const decision = fieldValue(fields, 'Planning-thread decision needed');
  const decisionLine = (decision || '').split(/\r?\n/)[0].trim();
  const decisionClear = /^(none|无|n\/a)$/i.test(decisionLine);
  if (!decision) problems.push('缺 Planning-thread decision needed 字段');
  else if (!decisionClear) problems.push(`仍有待决规划决策：${decisionLine}`);

  const deltaRaw = fieldValue(fields, 'Docs delta');
  const deltaLines = firstLines(deltaRaw, 8);
  const deltaNone = !deltaRaw || /^none$/i.test(deltaRaw.trim());
  if (!deltaRaw) problems.push('Docs delta 为空白 — 空白是缺陷，不是零');

  const metrics = parseMetricsLine(fieldValue(fields, 'Receipt metrics'));
  if (!metrics) problems.push('缺 Receipt metrics 行（机器可读遥测）');
  else if (!metrics.skill_friction) problems.push('Receipt metrics 缺 skill-friction 值');

  return {
    ok: problems.length === 0,
    present: true,
    schema_expected: active.schema,
    schema,
    conclusion,
    conclusion_tokens: active.conclusionTokens,
    criteria_total: criteria.length,
    criteria_evidenced: evidenced,
    planning_decision_clear: decisionClear,
    docs_delta_none: deltaNone,
    docs_delta_lines: deltaLines,
    docs_delta_count: deltaNone ? 0 : (deltaRaw || '').split(/\r?\n/).filter((l) => l.trim()).length,
    metrics: metrics
      ? {
          route: metrics.fork_or_express ?? null,
          archive_gates: metrics.archive_gates ?? null,
          archive_gate_failures: metrics.archive_gate_failures ?? null,
          grill_rounds: metrics.grill_rounds ?? null,
          criteria_evidenced: metrics.criteria_evidenced ?? null,
          docs_delta: metrics.docs_delta ?? null,
          skill_friction: metrics.skill_friction ?? null,
        }
      : null,
    worktree_state: firstLines(fieldValue(fields, 'Final worktree state'), 12),
    external_effects: fieldValue(fields, 'External effects'),
    fields_present: names,
    missing_fields: missing,
    problems,
  };
}

const validationCache = new Map();

/**
 * Run the real validator over one receipt.
 *
 * `--checkout` is passed so gate 6 compares against the worktree the run
 * actually happened in — without it the validator would judge a foreign
 * checkout against its own repository, which is worse than not checking.
 *
 * Memoised per task: a receipt is written once and never edited, and the
 * dashboard must not spawn a process on every poll.
 */
export function validateReceipt(receiptText, { checkout, taskId = 'receipt', timeoutMs = 20000 } = {}) {
  if (!receiptText) return { ran: false, reason: 'no receipt body to validate' };
  const key = `${taskId}:${receiptText.length}:${checkout || ''}`;
  if (validationCache.has(key)) return validationCache.get(key);

  let result;
  try {
    const stdout = execFileSync(
      process.execPath,
      [VALIDATOR, '--receipt', '-', '--checkout', checkout || REPO],
      { input: receiptText, encoding: 'utf8', timeout: timeoutMs, cwd: REPO },
    );
    result = { ran: true, exit: 0, gates: parseGateLines(stdout) };
  } catch (error) {
    const stdout = `${error.stdout || ''}`;
    result = {
      ran: true,
      exit: typeof error.status === 'number' ? error.status : null,
      gates: parseGateLines(stdout),
      raw: stdout.trim().split(/\r?\n/).slice(-6),
    };
  }
  validationCache.set(key, result);
  return result;
}

/** `Gate 4 验收标准逐条有证据 .......... PASS` → structured entries. */
export function parseGateLines(stdout) {
  const gates = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const match = line.match(/^Gate\s+(\d+)\s+(.*?)\s*\.{2,}\s*(PASS|FAIL|SKIP)(?:（(.*)）)?\s*$/);
    if (!match) continue;
    gates.push({ num: Number(match[1]), label: match[2].trim(), status: match[3], detail: match[4] || null });
  }
  return gates;
}

export function contractPath() {
  return CONTRACT_PATH;
}

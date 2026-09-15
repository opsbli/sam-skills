#!/usr/bin/env node
/**
 * telemetry — the receipt pipeline's own ledgers, read back.
 *
 * Two append-only files record what the pipeline did with itself, and until now
 * nothing surfaced them except a text editor:
 *
 *   docs/metrics.md             one row per validated receipt
 *   docs/skill-friction-log.md  one entry per non-`none` skill-friction value
 *
 * On their own they answer "what happened". Aggregated they answer the question
 * the pipeline exists to make answerable: *is it getting better?* Rising
 * archive-gate failures, repeating non-`accurate` quality labels, or friction
 * that keeps naming the same skill are the signals `/project-standards audit`
 * and `/harvest` act on — this just makes them visible before someone thinks to
 * open the file.
 *
 * Absence is reported, never faked: a checkout with no ledgers has not
 * accumulated telemetry yet, which is different from having none.
 *
 * Read-only. Zero dependencies. Node 18+.
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_ROWS = 400;

function readIfPresent(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * The receipt-telemetry table.
 *
 * Located by its header row rather than by position: the file carries prose
 * above and below it, and a table that moved a paragraph down must not silently
 * parse as empty.
 */
export function parseMetricsTable(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    if (!cells) continue;
    const keys = cells.map(normalizeHeader);
    if (keys.includes('date') && (keys.includes('route') || keys.includes('quality'))) {
      headerIndex = i;
      var header = keys;
      break;
    }
  }
  if (headerIndex < 0) return { headered: false, columns: [], rows: [] };

  const rows = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    if (!cells) break;
    if (cells.every((cell) => /^[-: ]*$/.test(cell))) continue;
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? '';
    });
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  return { headered: true, columns: header, rows };
}

/**
 * `## 2026-09-14 · harvest` blocks with `- Friction:` / `- Source:` lines.
 *
 * Fenced code is skipped and a heading only counts when it starts with a date.
 * The ledger documents its own entry format in a code fence, and the first
 * version of this parser counted that template — plus `## Entry format` and
 * `## Review cadence` — as four real friction entries, one of them naming
 * `<skill-name>` twice. A telemetry reader that invents rows is worse than one
 * that finds none.
 */
export function parseFrictionLog(markdown) {
  const entries = [];
  let current = null;
  let inFence = false;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const title = heading[1].trim();
      const match = title.match(/^(\d{4}-\d{2}-\d{2})\s*[·|—]?\s*(.*)$/);
      if (!match) {
        current = null; // a section heading, not an entry
        continue;
      }
      current = {
        date: match[1],
        skill: match[2].trim() || null,
        friction: null,
        source: null,
        title,
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*-\s*(Friction|Source)\s*[:：]\s*(.+)$/i);
    if (field) current[field[1].toLowerCase()] = field[2].trim();
  }
  return entries;
}

function leadingInt(value) {
  const match = String(value || '').match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function isoWeek(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Ledger aggregates. Every number here is derived from a row that exists; a
 * cell the ledger left blank stays blank in the aggregate rather than counting
 * as a zero, which would quietly improve every rate.
 */
export function summarizeTelemetry(checkout) {
  const metricsFile = path.join(checkout, 'docs', 'metrics.md');
  const frictionFile = path.join(checkout, 'docs', 'skill-friction-log.md');
  const metricsText = readIfPresent(metricsFile);
  const frictionText = readIfPresent(frictionFile);

  const table = metricsText === null ? { headered: false, columns: [], rows: [] } : parseMetricsTable(metricsText);
  const rows = table.rows;
  const frictionEntries = frictionText === null ? [] : parseFrictionLog(frictionText);

  const gatePass = rows.filter((row) => /^pass/i.test(String(row.archive_gates || ''))).length;
  const gateFail = rows.filter((row) => /^fail/i.test(String(row.archive_gates || ''))).length;
  const gateFailures = rows.reduce((total, row) => {
    const value = leadingInt(row.archive_gate_failures);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  const quality = {};
  for (const row of rows) {
    const label = String(row.quality || '').trim() || '(未填)';
    quality[label] = (quality[label] || 0) + 1;
  }
  const routes = {};
  for (const row of rows) {
    const route = String(row.route || '').trim() || '(未填)';
    routes[route] = (routes[route] || 0) + 1;
  }

  let criteriaEvidenced = 0;
  let criteriaTotal = 0;
  for (const row of rows) {
    const match = String(row.criteria_evidenced || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) continue;
    criteriaEvidenced += Number(match[1]);
    criteriaTotal += Number(match[2]);
  }

  const frictionRows = rows.filter((row) => {
    const value = String(row.skill_friction || '').trim().toLowerCase();
    return value && value !== 'none';
  }).length;

  const grillRounds = rows.reduce((total, row) => {
    const value = leadingInt(row.grill_rounds);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  const byWeek = {};
  for (const row of rows) {
    const week = isoWeek(String(row.date || '').trim());
    if (!week) continue;
    byWeek[week] = (byWeek[week] || 0) + 1;
  }
  const weeks = Object.entries(byWeek)
    .map(([week, count]) => ({ week, rows: count }))
    .sort((a, b) => (a.week < b.week ? 1 : -1))
    .slice(0, 8);

  const frictionBySkill = {};
  for (const entry of frictionEntries) {
    const skill = entry.skill || '(未记名)';
    frictionBySkill[skill] = (frictionBySkill[skill] || 0) + 1;
  }

  return {
    metrics: {
      present: metricsText !== null,
      file: 'docs/metrics.md',
      headered: table.headered,
      rows: rows.length,
      latest: rows.length ? rows[rows.length - 1] : null,
      recent: rows.slice(-8).reverse(),
      gate_pass: gatePass,
      gate_fail: gateFail,
      gate_failures: gateFailures,
      quality,
      routes,
      criteria_evidenced: criteriaTotal ? `${criteriaEvidenced}/${criteriaTotal}` : null,
      friction_rows: frictionRows,
      grill_rounds: grillRounds,
      weeks,
    },
    friction: {
      present: frictionText !== null,
      file: 'docs/skill-friction-log.md',
      entries: frictionEntries.length,
      by_skill: frictionBySkill,
      recent: frictionEntries.slice(-6).reverse(),
    },
    // The two prompts the ledgers exist to answer.
    signals: {
      gate_failures: gateFailures,
      quality_not_accurate: rows.filter((row) => {
        const label = String(row.quality || '').trim().toLowerCase();
        return label && label !== 'accurate';
      }).length,
      repeat_friction_skills: Object.entries(frictionBySkill)
        .filter(([, count]) => count >= 2)
        .map(([skill]) => skill),
    },
  };
}

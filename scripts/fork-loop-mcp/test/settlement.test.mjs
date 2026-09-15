// settlement + telemetry — the read side of what the pipeline handed back.
//
// These two modules answer the questions the board could not: *what is in the
// receipt* (conclusion, evidenced criteria, the Docs delta the planning thread
// owes) and *is the pipeline getting better* (gate failures, quality labels,
// repeating friction). Both read files an agent wrote, so both are tested
// against the shapes a human ledger actually has: template fences, prose above
// and below the table, and cells left blank rather than zero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseGateLines,
  parseMetricsLine,
  parseReceiptFields,
  summarizeReceipt,
  validateReceipt,
} from "../settlement.mjs";
import { parseFrictionLog, parseMetricsTable, summarizeTelemetry } from "../telemetry.mjs";

function tmpdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function compliantReceipt(overrides = {}) {
  const fields = {
    Schema: "spec-executor-receipt/v2",
    Conclusion: "completed",
    "Spec source": ".scratch/demo/issues/01.md",
    "Review fixed point": "abc1234",
    "Acceptance criteria":
      "AC1 the gate CLI validates a compliant receipt — pass `node scripts/receipt-gate.mjs --receipt fixture.md` exits 0 with 6/6",
    "Main changes": "added the receipt gate validator",
    "Changed files": "scripts/receipt-gate.mjs",
    "Branch / commit / review": "local branch, not pushed",
    "Validation results": "node --test scripts/receipt-gate.test.mjs all green",
    "Review findings": "none",
    "Not validated or not executed": "push, deploy",
    "Risks and remaining work": "none",
    "Planning-thread decision needed": "none",
    "Final worktree state": "clean",
    "External effects": "none",
    "Docs delta": "none",
    "Receipt metrics":
      "fork-or-express: fork | archive-gates: pass | archive-gate-failures: 0 | grill-rounds: 2 | criteria-evidenced: 1/1 | docs-delta: none | skill-friction: none",
    ...overrides,
  };
  return `SPEC EXECUTION RECEIPT\n\n${Object.entries(fields)
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n")}\n`;
}

test("summarizeReceipt reads a compliant receipt without inventing problems", () => {
  const summary = summarizeReceipt(compliantReceipt());

  assert.equal(summary.present, true);
  assert.deepEqual(summary.problems, [], `unexpected problems: ${summary.problems.join("; ")}`);
  assert.equal(summary.ok, true);
  assert.equal(summary.conclusion, "completed");
  assert.equal(summary.criteria_total, 1);
  assert.equal(summary.criteria_evidenced, 1);
  assert.equal(summary.docs_delta_none, true);
  assert.equal(summary.planning_decision_clear, true);
  assert.equal(summary.metrics.route, "fork");
  assert.equal(summary.metrics.archive_gates, "pass");
  assert.equal(summary.metrics.skill_friction, "none");
  assert.deepEqual(summary.missing_fields, []);
});

test("summarizeReceipt names every defect it can see, per the contract", () => {
  const summary = summarizeReceipt(
    compliantReceipt({
      Conclusion: "partially completed",
      "Docs delta": "",
      "Receipt metrics": "fork-or-express: fork | archive-gates: pass",
    }),
  );

  assert.equal(summary.ok, false);
  const all = summary.problems.join(" | ");
  assert.match(all, /Conclusion 首行不是单一 token/, "a two-word outcome is not a token");
  assert.match(all, /Docs delta 为空白/);
  assert.match(all, /缺 skill-friction 值/);
  assert.equal(summary.problems.length, 3, `unexpected problem set: ${all}`);
});

test("a missing required field is named against the contract, not guessed", () => {
  const receipt = compliantReceipt().replace(/^- Branch \/ commit \/ review:.*\n/m, "");
  const summary = summarizeReceipt(receipt);

  assert.deepEqual(summary.missing_fields, ["Branch / commit / review"]);
  assert.match(summary.problems.join(" "), /缺字段：Branch \/ commit \/ review/);
  assert.equal(summary.ok, false);
});

test("a receipt that is missing entirely is reported, not thrown", () => {
  for (const value of [null, undefined, ""]) {
    const summary = summarizeReceipt(value);
    assert.equal(summary.present, false);
    assert.equal(summary.ok, false);
    assert.match(summary.problems.join(" "), /没有回执正文/);
  }
});

test("parseMetricsLine tolerates the pipe-delimited line an agent actually writes", () => {
  const metrics = parseMetricsLine(
    "fork-or-express: fork | archive-gates: pass (6/6) | archive-gate-failures: 0 (1 bounce) | skill-friction: none",
  );
  assert.equal(metrics.fork_or_express, "fork");
  assert.equal(metrics.archive_gates, "pass (6/6)");
  assert.equal(metrics.archive_gate_failures, "0 (1 bounce)");
  assert.equal(parseMetricsLine(""), null);
});

test("parseGateLines reads the validator's own table", () => {
  const stdout = [
    "Gate 1 outcome=completed ..................... PASS",
    "Gate 4 验收标准逐条有证据 .................. FAIL（第 2 条验收标准缺 pass/fail 标记或证据）",
    "Gate 6 工作树终态无意外漂移 .................. SKIP（receipt 不可解析，无法读取 Final worktree state）",
    "Result: 1/6 — 归档：拒绝",
  ].join("\n");
  const gates = parseGateLines(stdout);

  assert.equal(gates.length, 3);
  assert.deepEqual(gates[0], { num: 1, label: "outcome=completed", status: "PASS", detail: null });
  assert.equal(gates[1].num, 4);
  assert.equal(gates[1].status, "FAIL");
  assert.match(gates[1].detail, /第 2 条/);
  assert.equal(gates[2].status, "SKIP");
});

test("validateReceipt runs the real validator against the named worktree", (t) => {
  const checkout = tmpdir("settlement-checkout-");
  try {
    execFileSync("git", ["init"], { cwd: checkout, stdio: "ignore" });
  } catch {
    t.skip("git unavailable");
    return;
  }

  const result = validateReceipt(compliantReceipt(), { checkout, taskId: "task-demo" });

  assert.equal(result.ran, true, "the validator must actually have run");
  assert.equal(result.exit, 0, `expected a clean archive, got exit ${result.exit}`);
  assert.equal(result.gates.length, 6, "six gates, one line each");
  assert.deepEqual(
    result.gates.map((gate) => gate.status),
    ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS"],
  );

  // A second call for the same task must not re-spawn: the receipt is immutable
  // and the board polls every two seconds.
  const again = validateReceipt(compliantReceipt(), { checkout, taskId: "task-demo" });
  assert.equal(again, result, "memoised by task_id, not revalidated");

  const failing = validateReceipt(compliantReceipt({ Conclusion: "blocked" }), {
    checkout,
    taskId: "task-blocked",
  });
  assert.equal(failing.exit, 1);
  assert.equal(failing.gates.find((gate) => gate.num === 1).status, "FAIL");
});

const METRICS_FIXTURE = `# Pipeline metrics

One row per validated receipt. Prose above the table must not confuse the reader.

| Date | Spec source | Route | Grill rounds | Archive gates | Archive-gate failures | Criteria evidenced | Docs delta lines | Skill friction | Quality |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-14 | .scratch/a/spec.md | fork | 2 | pass (6/6) | 0 | 3/3 | 1 | none | accurate |
| 2026-09-15 | .scratch/b/spec.md | fork | 0 | fail (5/6) | 1 (Gate 4) | 2/3 | 2 | 校验器口径歧义 | criteria-too-vague |

## How to read it

- Prose after the table, also not part of it.
`;

test("parseMetricsTable finds the table by its header, not by position", () => {
  const parsed = parseMetricsTable(METRICS_FIXTURE);

  assert.equal(parsed.headered, true);
  assert.equal(parsed.rows.length, 2, "and stops at the prose below it");
  assert.equal(parsed.rows[0].date, "2026-09-14");
  assert.equal(parsed.rows[1].archive_gates, "fail (5/6)");
  assert.equal(parsed.rows[1].quality, "criteria-too-vague");
  assert.equal(Object.hasOwn(parsed.rows[0], "how_to_read_it"), false);
});

test("parseFrictionLog ignores the template the ledger documents itself with", () => {
  // The bug this pins: the ledger shows its entry format in a code fence, and
  // the unfenced sections are called `## Entry format` / `## Entries`. All three
  // used to be counted as friction entries, one of them naming `<skill-name>`.
  const withTemplate = `# Skill friction log

## Entry format

\`\`\`text
## YYYY-MM-DD · <skill-name>
- Friction: <one line from the receipt>
- Source: <receipt reference>
\`\`\`

## Review cadence

Prose about cadence.

## Entries

_No friction recorded yet._
`;
  assert.deepEqual(parseFrictionLog(withTemplate), []);

  const withEntries = `${withTemplate}
## 2026-09-15 · harvest
- Friction: 校验器口径歧义
- Source: receipt forkloop-1

## 2026-09-15 · harvest
- Friction: 又一次同一步骤卡住
- Source: receipt forkloop-2
`;
  const entries = parseFrictionLog(withEntries);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-09-15");
  assert.equal(entries[0].skill, "harvest");
  assert.equal(entries[0].friction, "校验器口径歧义");
  assert.equal(entries[0].source, "receipt forkloop-1");
});

test("summarizeTelemetry aggregates the ledgers, and admits when there are none", () => {
  const bare = tmpdir("telemetry-bare-");
  const empty = summarizeTelemetry(bare);
  assert.equal(empty.metrics.present, false);
  assert.equal(empty.friction.present, false);
  assert.equal(empty.metrics.rows, 0);

  const checkout = tmpdir("telemetry-full-");
  fs.mkdirSync(path.join(checkout, "docs"), { recursive: true });
  fs.writeFileSync(path.join(checkout, "docs", "metrics.md"), METRICS_FIXTURE);
  fs.writeFileSync(
    path.join(checkout, "docs", "skill-friction-log.md"),
    `## 2026-09-15 · harvest\n- Friction: a\n- Source: r1\n\n## 2026-09-15 · harvest\n- Friction: b\n- Source: r2\n`,
  );

  const summary = summarizeTelemetry(checkout);
  assert.equal(summary.metrics.rows, 2);
  assert.equal(summary.metrics.gate_pass, 1);
  assert.equal(summary.metrics.gate_fail, 1);
  assert.equal(summary.metrics.gate_failures, 1);
  assert.equal(summary.metrics.criteria_evidenced, "5/6", "summed across rows");
  assert.equal(summary.metrics.friction_rows, 1, "`none` is not friction");
  assert.deepEqual(summary.metrics.routes, { fork: 2 });
  assert.deepEqual(summary.metrics.quality, { accurate: 1, "criteria-too-vague": 1 });
  assert.equal(summary.metrics.weeks.length, 1, "both rows share ISO week 38 of 2026");
  assert.equal(summary.friction.entries, 2);
  assert.deepEqual(summary.signals.repeat_friction_skills, ["harvest"]);
  assert.equal(summary.signals.quality_not_accurate, 1);
});

test("parseReceiptFields keeps multi-line values with their field", () => {
  const receipt = compliantReceipt({
    "Acceptance criteria": "AC1 first\nAC2 second — pass `npm test`",
    "Docs delta": "术语：photos 归口\n约束：DDL 只前进",
  });
  const fields = parseReceiptFields(receipt);
  const criteria = fields.find((field) => field.name === "Acceptance criteria");

  assert.equal(criteria.value.includes("AC2 second"), true);
  const delta = fields.find((field) => field.name === "Docs delta");
  assert.equal(delta.value.split("\n").filter(Boolean).length, 2);
  assert.equal(summarizeReceipt(receipt).docs_delta_count, 2);
});

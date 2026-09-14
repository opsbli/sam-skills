#!/usr/bin/env node
// receipt-gate.mjs — N1: receipt six-gate archival validator (US-4, MVP).
//
// Scripted form of the six archive gates. Contract sources:
//   - receipt v2 schema (X1, frozen): skills/engineering/spec-executor/SKILL.md
//   - gate table + error codes: delivery/系统设计.md §3.2.M6.3 / §3.5.1
// Gate mapping to the v2 receipt fields (the contract has no separate
// "Outcome" field; the execution outcome IS the Conclusion line):
//   pre.  first field must be exactly `Schema: spec-executor-receipt/v2`
//         — checked as part of Gate 2 parseability; mismatch -> 101011,
//         never hand-patched (D39)
//   1.    Conclusion outcome = completed                 -> 101001
//   2.    exactly one parseable receipt in the file      -> 101002
//   3.    Conclusion first line is a single token from
//         {completed, blocked, failed}                   -> 101003
//   4.    every Acceptance criteria entry carries a pass/fail
//         marker followed by evidence (command/output/wording;
//         a backtick span also counts)                   -> 101004
//   5.    Planning-thread decision needed is none        -> 101005
//   6.    worktree file set matches the receipt's Final
//         worktree state lines (git status --porcelain
//         form, or plain paths; "clean"/"无改动" = empty) -> 101006
//   9xx.  validator-internal errors (unreadable file...) -> 901001, exit 9
//
// Modes:
//   --receipt <path>   validate one receipt file; per-gate report on stdout,
//                      JSON report line per FAIL, exit 0 / 1 / 9
//   --receipt -        same as above, but read the raw receipt text from
//                      stdin (piped auto/mailbox channel) instead of a file
//   --check            anti-drift self-check: embedded gate rules must match
//                      the contract sources (exit 0 = consistent)
//
// refuse-not-degrade: a gate whose input is unavailable reports SKIP, never
// PASS; the validator never repairs a receipt and writes nothing. Git
// unavailable at Gate 6 is an explicit "无法核验" rejection, not a skip.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const TENANT = "sam-skills";
const SCHEMA_TOKEN = "spec-executor-receipt/v2";
const HEADING = "SPEC EXECUTION RECEIPT";
const CONCLUSION_TOKENS = ["completed", "blocked", "failed"];
const GATES = [
  { num: 1, label: "outcome=completed", code: "101001" },
  { num: 2, label: "单一可解析 receipt", code: "101002" },
  { num: 3, label: "Conclusion 单 token", code: "101003" },
  { num: 4, label: "验收标准逐条有证据", code: "101004" },
  { num: 5, label: "无待决规划决策", code: "101005" },
  { num: 6, label: "工作树终态无意外漂移", code: "101006" },
];
const SCHEMA_MISMATCH_CODE = "101011";
const INTERNAL_CODE = "901001";

const FIELD_RE = /^\s*-\s*([A-Za-z][A-Za-z0-9 /-]*?)\s*:\s?(.*)$/;
const MARKER_RE = /(pass|fail|✅|❌)/i;

function fail(code, gateNum, msg) {
  return { status: "FAIL", code, gateNum, msg };
}
function pass(detail) {
  return { status: "PASS", detail };
}
function skip(detail) {
  return { status: "SKIP", detail };
}

function parseReceipt(text) {
  const lines = text.split(/\r?\n/);
  const headingIdx = [];
  lines.forEach((line, i) => {
    if (line.trim() === HEADING) headingIdx.push(i);
  });
  const fields = [];
  if (headingIdx.length === 1) {
    let current = null;
    for (let i = headingIdx[0] + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (/^\s*```/.test(raw)) continue; // transport fence noise
      const m = raw.match(FIELD_RE);
      if (m) {
        current = { name: m[1].trim(), value: m[2], line: i + 1 };
        fields.push(current);
        continue;
      }
      if (current && raw.trim() !== "") current.value += "\n" + raw;
      // prose before the first field is transport noise; ignored
    }
  }
  return { count: headingIdx.length, fields };
}

function fieldOf(fields, name) {
  return fields.find((f) => f.name === name) || null;
}

function normalizePath(p) {
  return p.trim().replace(/^"|"$/g, "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function pathsFromWorktreeLines(value) {
  const paths = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const rename = line.match(/^.+\s->\s(.+)$/); // porcelain rename entry
    if (rename) {
      paths.push(normalizePath(rename[1]));
      continue;
    }
    const porc = line.match(/^[MADRC?!U!]{1,2}\s+(.+)$/); // XY + path
    if (porc) {
      paths.push(normalizePath(porc[1]));
      continue;
    }
    if (/[\\/]/.test(line) || /\.[A-Za-z0-9]+$/.test(line)) {
      paths.push(normalizePath(line)); // bare path line
    }
    // prose lines carry no path tokens; ignored
  }
  return paths;
}

function actualWorktreePaths() {
  let out;
  try {
    out = execFileSync("git", ["status", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
    });
  } catch {
    return { ok: false, paths: [] };
  }
  const paths = [];
  for (const rawLine of out.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const rename = line.match(/^.+\s->\s(.+)$/);
    if (rename) {
      paths.push(normalizePath(rename[1]));
      continue;
    }
    const porc = line.match(/^[MADRC?!U!]{1,2}\s+(.+)$/);
    if (porc) paths.push(normalizePath(porc[1]));
  }
  return { ok: true, paths };
}

function evidencePresent(entry) {
  if (/`[^`]+`/.test(entry)) return true; // explicit command/output span
  const m = entry.match(/(pass|fail|✅|❌)\s*[:：\-—–]?\s*([\s\S]*)$/i);
  if (!m) return false;
  const tail = m[2].replace(/[`*_\s:：，,。.；;—\-–]/g, "");
  return tail.length >= 3;
}

function gate2(parsed) {
  if (parsed.count === 0) {
    return fail("101002", 2, "receipt 缺失：文件中未找到 SPEC EXECUTION RECEIPT 块");
  }
  if (parsed.count > 1) {
    return fail("101002", 2, `存在 ${parsed.count} 份 receipt，回数必须恰为 1`);
  }
  const first = parsed.fields[0];
  if (!first || first.name !== "Schema") {
    return fail(
      SCHEMA_MISMATCH_CODE,
      2,
      `首字段必须是 Schema: ${SCHEMA_TOKEN}（缺失/不匹配即拒收，禁止手补；实际首字段：${first ? first.name : "（无字段）"}）`,
    );
  }
  if (first.value.trim() !== SCHEMA_TOKEN) {
    return fail(
      SCHEMA_MISMATCH_CODE,
      2,
      `Schema 首字段期望 "${SCHEMA_TOKEN}"，实际 "${first.value.trim()}"（禁止手补 Schema 字段）`,
    );
  }
  return pass("单一 receipt、Schema 首字段匹配");
}

function gate1(fields) {
  const conclusion = fieldOf(fields, "Conclusion");
  if (!conclusion) {
    return fail("101001", 1, "Conclusion 字段缺失，无法确认 outcome=completed");
  }
  const line1 = conclusion.value.split(/\r?\n/)[0].trim();
  const token = line1.split(/\s+/).filter(Boolean)[0] || "";
  if (token === "completed") return pass("outcome=completed");
  return fail(
    "101001",
    1,
    `执行结果未标记 completed（实际首 token："${token || "（空）"}"）`,
  );
}

function gate3(fields) {
  const conclusion = fieldOf(fields, "Conclusion");
  if (!conclusion) return fail("101003", 3, "Conclusion 字段缺失");
  const line1 = conclusion.value.split(/\r?\n/)[0].trim();
  const tokens = line1.split(/\s+/).filter(Boolean);
  const ok = tokens.length === 1 && CONCLUSION_TOKENS.includes(tokens[0]);
  if (ok) return pass(`单 token（${tokens[0]}）；理由句可在后续行`);
  return fail(
    "101003",
    3,
    `Conclusion 首行必须为单一合法 token（${CONCLUSION_TOKENS.join("/")}）；实际 "${line1 || "（空）"}"`,
  );
}

function gate4(fields) {
  const ac = fieldOf(fields, "Acceptance criteria");
  const entries = ac
    ? ac.value.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
    : [];
  if (!ac || entries.length === 0) {
    return fail("101004", 4, "验收标准区缺失或为空（Acceptance criteria）");
  }
  const bad = [];
  entries.forEach((entry, idx) => {
    if (!MARKER_RE.test(entry) || !evidencePresent(entry)) bad.push(idx + 1);
  });
  if (bad.length) {
    return fail(
      "101004",
      4,
      `第 ${bad.join("、")} 条验收标准缺 pass/fail 标记或证据`,
    );
  }
  return pass(`${entries.length}/${entries.length} 条均附证据`);
}

function gate5(fields) {
  const dec = fieldOf(fields, "Planning-thread decision needed");
  if (!dec) {
    return fail("101005", 5, "Planning-thread decision needed 字段缺失，无法确认无待决决策");
  }
  const v = dec.value.trim();
  if (v === "") {
    return fail("101005", 5, "待决决策字段为空白（空白≠none，无法确认）");
  }
  const line1 = v.split(/\r?\n/)[0].trim();
  if (/^(none|无|n\/a)$/i.test(line1) && v.split(/\r?\n/).every((l) => l.trim() === "" || /^(none|无|n\/a)$/i.test(l.trim()))) {
    return pass("无待决规划决策");
  }
  return fail("101005", 5, `存在待决规划决策：${line1}`);
}

function gate6(fields) {
  const wt = fieldOf(fields, "Final worktree state");
  if (!wt) {
    return fail("101006", 6, "Final worktree state 缺失，无法核验工作树终态");
  }
  // 契约口径（D39）：字段存在但为空（或 "clean"/"无改动"）= 报告为空集，
  // 与实际工作树比对；仅字段整体缺失才是无法核验。空值 + 实际脏 → 由下方漂移比对报 extra。
  const expected = pathsFromWorktreeLines(wt.value);
  const actual = actualWorktreePaths();
  if (!actual.ok) {
    return fail("101006", 6, "git 不可用，无法核验工作树终态（本门不跳过，整体拒绝归档）");
  }
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual.paths);
  const extra = actual.paths.filter((p) => !expectedSet.has(p));
  const missing = expected.filter((p) => !actualSet.has(p));
  if (extra.length || missing.length) {
    const parts = [];
    if (extra.length) parts.push(`实际多出 [${extra.slice(0, 5).join(", ")}${extra.length > 5 ? ", …" : ""}]`);
    if (missing.length) parts.push(`报告缺失 [${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}]`);
    return fail("101006", 6, `工作树与 receipt 报告终态漂移：${parts.join("；")}`);
  }
  return pass(
    expected.length
      ? `工作树与报告终态一致（${expected.length} 项）`
      : "工作树干净，与报告一致",
  );
}

function envelope(code, gateNum, msg, traceId) {
  return JSON.stringify({
    code,
    severity: "block",
    gate: `six-gate/${gateNum}`,
    msg,
    traceId,
    tenantId: TENANT,
    timestamp: new Date().toISOString(),
  });
}

function renderGateLine(num, label, result) {
  const head = `Gate ${num} ${label}`;
  const dots = ".".repeat(Math.max(3, 38 - head.length));
  if (result.status === "PASS") return `${head} ${dots} PASS`;
  return `${head} ${dots} ${result.status}（${result.msg}）`;
}

function internalError(msg) {
  console.log(
    JSON.stringify({
      code: INTERNAL_CODE,
      severity: "block",
      gate: "six-gate/0",
      msg,
      traceId: "receipt-validator",
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(9);
}

function readReceiptSource(receiptPath) {
  // stdin mode: `--receipt -` reads the raw receipt text from the pipe
  // (the auto/mailbox channel, US-4 §数据描述) instead of a file.
  if (receiptPath === "-") {
    try {
      return readFileSync(0, "utf8"); // fd 0 = stdin
    } catch {
      internalError(
        "无法从 stdin 读取 receipt（请通过管道传入文本，例如 echo '<receipt>' | node scripts/receipt-gate.mjs --receipt -）",
      );
    }
  }
  try {
    return readFileSync(receiptPath, "utf8");
  } catch {
    internalError(`receipt 文件不可读: ${receiptPath}`);
  }
}

function runValidation(receiptPath) {
  const text = readReceiptSource(receiptPath).replace(/^\uFEFF/, "");
  const traceId =
    receiptPath === "-"
      ? "receipt-stdin"
      : `receipt-${basename(receiptPath).replace(/\.[^.]+$/, "")}`;
  const parsed = parseReceipt(text);

  const g2 = gate2(parsed);
  const parseable = g2.status === "PASS";
  const results = [];
  results.push({ num: 2, result: g2 }); // gate 2 first: structural precondition

  if (parseable) {
    results.push({ num: 1, result: gate1(parsed.fields) });
    results.push({ num: 3, result: gate3(parsed.fields) });
    results.push({ num: 4, result: gate4(parsed.fields) });
    results.push({ num: 5, result: gate5(parsed.fields) });
  } else {
    for (const num of [1, 3, 4, 5]) {
      results.push({ num, result: skip("receipt 不可解析，无法核验") });
    }
  }
  results.push({
    num: 6,
    result: parseable ? gate6(parsed.fields) : skip("receipt 不可解析，无法读取 Final worktree state"),
  });
  results.sort((a, b) => a.num - b.num);

  let passCount = 0;
  for (const { num } of GATES) {
    const item = results.find((r) => r.num === num);
    const line = renderGateLine(num, GATES[num - 1].label, item.result);
    console.log(line);
    if (item.result.status === "PASS") passCount++;
    if (item.result.status === "FAIL") {
      console.log(envelope(item.result.code, num, item.result.msg, traceId));
    }
  }

  const allPass = passCount === 6;
  console.log(`Result: ${passCount}/6 — 归档：${allPass ? "放行" : "拒绝"}`);
  if (!allPass) {
    console.log("建议：回执行线程修复后重新提交 receipt；禁止手补 Schema 字段（D39）");
    process.exit(1);
  }
  process.exit(0);
}

function runCheck() {
  const problems = [];
  if (GATES.length !== 6) problems.push(`内置门数量 ${GATES.length} ≠ 6`);
  const codes = GATES.map((g) => g.code);
  if (new Set(codes).size !== codes.length) problems.push("门错误码存在重复");
  for (const code of codes) {
    if (!/^\d{6}$/.test(code)) problems.push(`错误码 ${code} 非 6 位数字`);
  }
  if (CONCLUSION_TOKENS.join("/") !== "completed/blocked/failed") {
    problems.push("Conclusion 合法 token 集偏离契约口径（completed/blocked/failed）");
  }
  if (!/^[a-z-]+\/v\d+$/.test(SCHEMA_TOKEN)) {
    problems.push(`Schema token 格式异常: ${SCHEMA_TOKEN}`);
  }

  let skill = "";
  try {
    skill = readFileSync(
      join(repo, "skills", "engineering", "spec-executor", "SKILL.md"),
      "utf8",
    );
  } catch {
    problems.push("契约源不可读: skills/engineering/spec-executor/SKILL.md");
  }
  if (skill && !skill.includes(`Schema: ${SCHEMA_TOKEN}`)) {
    problems.push(`spec-executor SKILL.md 不含 "Schema: ${SCHEMA_TOKEN}"（Schema 版本漂移？）`);
  }
  if (skill && !skill.includes(HEADING)) {
    problems.push(`spec-executor SKILL.md 不含 "${HEADING}" 模板`);
  }

  let sys = "";
  try {
    sys = readFileSync(join(repo, "delivery", "系统设计.md"), "utf8");
  } catch {
    problems.push("契约源不可读: delivery/系统设计.md（错误码注册表 §3.5.1）");
  }
  if (sys) {
    for (const code of [...codes, SCHEMA_MISMATCH_CODE, INTERNAL_CODE]) {
      if (!sys.includes(code)) problems.push(`系统设计错误码注册表缺少 ${code}`);
    }
  }

  if (problems.length) {
    console.error(`校验器规则与契约文档不一致（${problems.length}）：`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("校验器规则与契约文档一致：OK（防漂移自检通过）");
  process.exit(0);
}

function usage() {
  console.error(`用法:
  node scripts/receipt-gate.mjs --receipt <receipt 文件路径>   # 六道门校验（exit 0 全过 / 1 拦截 / 9 内部错误）
  node scripts/receipt-gate.mjs --receipt -                   # 同上，但 receipt 文本从 stdin 管道读取
  node scripts/receipt-gate.mjs --check                       # 防漂移自检（规则与契约文档一致性）`);
}

const args = process.argv.slice(2);
if (args[0] === "--check") {
  runCheck();
} else if (args[0] === "--receipt" && args[1]) {
  runValidation(args[1]);
} else if (args[0] === "--help" || args[0] === "-h") {
  usage();
  process.exit(0);
} else {
  usage();
  process.exit(2);
}

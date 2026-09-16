#!/usr/bin/env node
// mini-receipt-gate.mjs — the express lane's traceability floor.
//
// Why this file exists rather than a flag on receipt-gate.mjs: the two receipts
// answer different questions and their gate sets do not overlap. v2 grades an
// eighteen-field archival record against six gates including a review fixed
// point; this grades three lines against four. Sharing one validator would mean
// one contract file carrying two schemas, two gate tables and two error-code
// ranges, and every gate asking "which mode am I in?" before it can say what it
// checks. Two small contract-driven validators beat one mode-switching one.
//
// What it closes: until this existed, express work finished with a three-line
// receipt that nothing validated, nothing harvested, and no ledger recorded —
// the only route to completed work in this pipeline that no gate touched. The
// lane itself stays cheap on purpose; what it now costs is three truthful lines.
//
// Rules are derived from contracts/mini-receipt-v1.json; --check walks the
// landing points it names so a field rename cannot land in one document and
// silently miss the others.
//
// Modes:
//   --receipt <path> [--checkout <dir>]   validate one mini receipt; per-gate
//                                         report on stdout, JSON envelope per
//                                         FAIL, exit 0 / 1 / 9
//   --receipt -                           same, reading the text from stdin
//   --check                               anti-drift self-check
//
// refuse-not-degrade: an input a gate cannot see is SKIP, never PASS. Git
// unavailable at gate 4 is an explicit rejection, not a skip. Nothing is
// written and nothing is repaired.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = join("contracts", "mini-receipt-v1.json");
const TENANT = "sam-skills";

const CONTRACT = loadContract();
const SCHEMA_TOKEN = CONTRACT.schema;
const HEADING = CONTRACT.heading;
const GATES = CONTRACT.gates.map((gate) => ({ num: gate.num, label: gate.label, code: gate.code }));
const NONE_TOKENS = Array.isArray(CONTRACT.noneTokens) ? CONTRACT.noneTokens : ["none"];
const FIELD_NAMES = new Set(Array.isArray(CONTRACT.fields) ? CONTRACT.fields : []);
const SCHEMA_MISMATCH_CODE = CONTRACT.preGate.code;
const INTERNAL_CODE = CONTRACT.internalErrorCode;

// Same anchoring problem as the v2 parser: without the declared field list an
// unquoted continuation line is indistinguishable from a new field.
const FIELD_RE = /^\s*-\s*([A-Za-z][A-Za-z0-9 /-]*?)\s*:\s?(.*)$/;

if (FIELD_NAMES.size === 0) {
  console.error(
    "mini-receipt-gate: contracts/mini-receipt-v1.json declares no `fields` list; without it the parser cannot tell a field from prose.",
  );
  process.exit(9);
}

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
      if (m && FIELD_NAMES.has(m[1].trim())) {
        current = { name: m[1].trim(), value: m[2], line: i + 1 };
        fields.push(current);
        continue;
      }
      if (current && raw.trim() !== "") current.value += "\n" + raw;
    }
  }
  return { count: headingIdx.length, fields };
}

function fieldOf(fields, name) {
  return fields.find((f) => f.name === name) || null;
}

function substantive(value) {
  // Strip punctuation and whitespace: "- x" and "..." are not substance.
  return value.replace(/[\s`*_:：，,。.；;—\-–]/g, "").length >= 3;
}

function normalizePath(p) {
  return p.trim().replace(/^"|"$/g, "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function porcelainPaths(text) {
  const paths = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const rename = line.match(/^.+\s->\s(.+)$/);
    if (rename) {
      paths.push(normalizePath(rename[1]));
      continue;
    }
    const porc = line.match(/^[MADRC?!U!]{1,2}\s+(.+)$/);
    if (porc) {
      paths.push(normalizePath(porc[1]));
      continue;
    }
    if (/[\\/]/.test(line) || /\.[A-Za-z0-9]+$/.test(line)) {
      paths.push(normalizePath(line));
    }
  }
  return paths;
}

function gate1(parsed) {
  if (parsed.count === 0) {
    return fail("102001", 1, `没有找到 ${HEADING} 块——轻量直通不留三行记录就等于没做过`);
  }
  if (parsed.count > 1) {
    return fail("102001", 1, `存在 ${parsed.count} 份 ${HEADING}，一次直通必须恰为 1 份`);
  }
  const first = parsed.fields[0];
  if (!first || first.name !== "Schema") {
    return fail(
      SCHEMA_MISMATCH_CODE,
      1,
      `首字段必须是 Schema: ${SCHEMA_TOKEN}（缺失/不匹配即拒收，禁止手补；实际：${first ? first.name : "（无字段）"}）`,
    );
  }
  if (first.value.trim() !== SCHEMA_TOKEN) {
    return fail(
      SCHEMA_MISMATCH_CODE,
      1,
      `Schema 首字段期望 "${SCHEMA_TOKEN}"，实际 "${first.value.trim()}"`,
    );
  }
  const missing = [...FIELD_NAMES].filter((name) => !fieldOf(parsed.fields, name));
  if (missing.length) {
    return fail("102001", 1, `${HEADING} 缺字段：${missing.join(" / ")}——三行一行都不能少`);
  }
  return pass("单一 mini receipt，三字段齐全");
}

function gate2(fields) {
  const f = fieldOf(fields, "what changed");
  if (!f) return fail("102002", 2, "what changed 字段缺失");
  if (!substantive(f.value)) {
    return fail("102002", 2, "what changed 无实质内容——写清改了什么，不是留一个占位符");
  }
  return pass(f.value.trim().split(/\r?\n/)[0].slice(0, 60));
}

function gate3(fields) {
  const f = fieldOf(fields, "validation run");
  if (!f) return fail("102003", 3, "validation run 字段缺失");
  const v = f.value.trim();
  if (v === "") return fail("102003", 3, "validation run 为空——必须写明实际跑过的校验");
  const line1 = v.split(/\r?\n/)[0].trim();
  if (NONE_TOKENS.some((t) => line1.toLowerCase() === t.toLowerCase())) {
    return fail(
      "102003",
      3,
      `validation run 为 "${line1}"——没有廉价验证触点的工作按准入准则不该走轻量直通，回 fork 路由`,
    );
  }
  if (!substantive(v)) {
    return fail("102003", 3, "validation run 无实质内容（「OK」「通过」不算，要写出跑的那个命令）");
  }
  return pass(line1.slice(0, 60));
}

function gate4(fields, worktreeDir) {
  const wt = fieldOf(fields, "worktree state");
  if (!wt) return fail("102004", 4, "worktree state 字段缺失");
  const reported = porcelainPaths(wt.value);
  if (reported.length === 0) {
    // "clean" / "无改动" claims nothing changed — nothing to assert against the
    // tree, and no lie to catch either.
    return pass(substantive(wt.value) ? "声明无残留改动" : skip("worktree state 无实质内容").detail);
  }
  let out;
  try {
    out = execFileSync("git", ["status", "--porcelain"], { cwd: worktreeDir, encoding: "utf8" });
  } catch {
    return fail("102004", 4, `git 不可用（${worktreeDir}），无法核验声明的改动（本门不跳过）`);
  }
  const actual = new Set(porcelainPaths(out));
  const missing = reported.filter((p) => !actual.has(p));
  if (missing.length) {
    return fail(
      "102004",
      4,
      `receipt 声称改动了 [${missing.join(", ")}]，但工作树（${worktreeDir}）里它们没有改动`,
    );
  }
  return pass(`${reported.length} 项声明改动均在工作树中真实存在`);
}

function envelope(code, gateNum, msg, traceId) {
  return JSON.stringify({
    code,
    severity: "block",
    gate: `mini-receipt/${gateNum}`,
    msg,
    traceId,
    tenantId: TENANT,
    timestamp: new Date().toISOString(),
  });
}

function renderGateLine(num, label, result) {
  const head = `Gate ${num} ${label}`;
  const dots = ".".repeat(Math.max(3, 42 - head.length));
  if (result.status === "PASS") return `${head} ${dots} PASS（${result.detail}）`;
  if (result.status === "SKIP") return `${head} ${dots} SKIP（${result.detail}）`;
  return `${head} ${dots} ${result.status}（${result.msg}）`;
}

function internalError(msg) {
  console.log(
    JSON.stringify({
      code: INTERNAL_CODE,
      severity: "block",
      gate: "mini-receipt/0",
      msg,
      traceId: "mini-receipt-validator",
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(9);
}

function loadContract() {
  try {
    return JSON.parse(readFileSync(join(repo, CONTRACT_PATH), "utf8"));
  } catch (error) {
    internalError(`mini receipt contract unreadable: ${CONTRACT_PATH} (${error.message})`);
  }
}

function readReceiptSource(receiptPath) {
  if (receiptPath === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch {
      internalError("无法从 stdin 读取 mini receipt");
    }
  }
  try {
    return readFileSync(receiptPath, "utf8");
  } catch {
    internalError(`mini receipt 文件不可读: ${receiptPath}`);
  }
}

function runValidation(receiptPath, worktreeDir) {
  const text = readReceiptSource(receiptPath).replace(/^\uFEFF/, "");
  const traceId =
    receiptPath === "-"
      ? "mini-receipt-stdin"
      : `mini-receipt-${basename(receiptPath).replace(/\.[^.]+$/, "")}`;
  const parsed = parseReceipt(text);

  const g1 = gate1(parsed);
  const usable = g1.status === "PASS";
  const results = [{ num: 1, result: g1 }];

  if (usable) {
    results.push({ num: 2, result: gate2(parsed.fields) });
    results.push({ num: 3, result: gate3(parsed.fields) });
    results.push({ num: 4, result: gate4(parsed.fields, worktreeDir) });
  } else {
    for (const num of [2, 3, 4]) {
      results.push({ num, result: skip("receipt 不可解析，无法核验") });
    }
  }
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

  const allPass = passCount === GATES.length;
  console.log(`Result: ${passCount}/${GATES.length} — 轻量直通：${allPass ? "放行" : "拒绝"}`);
  if (!allPass) {
    console.log("建议：补齐三行记录后重新校验；禁止手补 Schema 字段");
    process.exit(1);
  }
  process.exit(0);
}

function runCheck() {
  const problems = [];

  if (GATES.length !== 4) problems.push(`契约门数量 ${GATES.length} ≠ 4`);
  const codes = GATES.map((gate) => gate.code);
  if (new Set(codes).size !== codes.length) problems.push("门错误码存在重复");
  for (const code of [...codes, SCHEMA_MISMATCH_CODE, INTERNAL_CODE]) {
    if (!/^\d{6}$/.test(code)) problems.push(`错误码 ${code} 非 6 位数字`);
  }
  if (!/^[a-z0-9-]+\/v\d+$/.test(SCHEMA_TOKEN)) {
    problems.push(`Schema token 格式异常: ${SCHEMA_TOKEN}`);
  }
  if (!HEADING) problems.push("heading 缺失");
  // 3 content lines + the Schema pin. Adding a content line is a version bump:
  // the value of this receipt is that it stays cheap.
  if (FIELD_NAMES.size !== 4) problems.push(`契约字段数 ${FIELD_NAMES.size} ≠ 4（3 行内容 + Schema pin）`);

  const points = Array.isArray(CONTRACT.landingPoints) ? CONTRACT.landingPoints : [];
  if (points.length === 0) problems.push("landingPoints 为空——契约漂移将无人拦截");
  if (points.every((point) => point.required === false)) {
    problems.push("所有落点均为 optional——契约实际上未被强制");
  }
  for (const point of points) {
    const file = join(repo, point.path);
    if (!existsSync(file)) {
      if (point.required !== false) problems.push(`落点文件缺失: ${point.path}`);
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const raw of point.mustContain || []) {
      const token = raw.replace(/\{schema\}/g, SCHEMA_TOKEN).replace(/\{heading\}/g, HEADING);
      if (!source.includes(token)) problems.push(`${point.path} 不含 "${token}"（契约漂移？）`);
    }
    for (const raw of point.mustNotContain || []) {
      const token = raw.replace(/\{schema\}/g, SCHEMA_TOKEN).replace(/\{heading\}/g, HEADING);
      if (source.includes(token)) problems.push(`${point.path} 仍含过期契约文本 "${token}"`);
    }
  }

  if (problems.length) {
    console.error(`mini receipt 契约与落点不一致（${problems.length}）：`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `mini receipt 契约一致：OK（${SCHEMA_TOKEN}，${GATES.length} 门，${points.length} 个落点）`,
  );
  process.exit(0);
}

function usage() {
  console.error(`用法:
  node scripts/mini-receipt-gate.mjs --receipt <文件> [--checkout <工作树>]   # 轻量直通三行记录校验
  node scripts/mini-receipt-gate.mjs --receipt - [--checkout <工作树>]        # 从 stdin 读取
  node scripts/mini-receipt-gate.mjs --check                                  # 防漂移自检`);
}

const args = process.argv.slice(2);
const checkoutIdx = args.indexOf("--checkout");
const checkoutArg = checkoutIdx >= 0 ? args[checkoutIdx + 1] : null;
if (checkoutIdx >= 0 && !checkoutArg) {
  console.error("--checkout requires a path");
  process.exit(2);
}
const worktreeDir = checkoutArg || process.cwd();

if (args[0] === "--check") {
  runCheck();
} else if (args[0] === "--receipt" && args[1]) {
  runValidation(args[1], worktreeDir);
} else if (args[0] === "--help" || args[0] === "-h") {
  usage();
  process.exit(0);
} else {
  usage();
  process.exit(2);
}

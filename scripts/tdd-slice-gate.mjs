#!/usr/bin/env node
// tdd-slice-gate: mechanical enforcement of the tdd skill's "one slice at a
// time" rule. Bulk test-writing (all tests before any implementation) is an
// ordering violation — invisible in the final file state — so this gate turns
// the ordering into a recorded state sequence:
//
//   node scripts/tdd-slice-gate.mjs --init
//        Record the baseline test inventory (run before the first RED).
//   node scripts/tdd-slice-gate.mjs --record "<what happened>"
//        Snapshot the current inventory and diff it against the previous
//        record. Invariant: at most ONE new test per record. A record that
//        adds 2+ new tests is bulk writing — the gate refuses it (exit 1,
//        nothing appended): delete the extras, keep one, re-record.
//   node scripts/tdd-slice-gate.mjs --verify
//        Replay the whole log and assert every step respected the invariant.
//        GREEN also requires this to pass.
//   node scripts/tdd-slice-gate.mjs --check
//        Self-test against embedded sequence fixtures.
//
// Log: `.tdd-slice-log.jsonl` (one JSON event per line, append-only).
// Zero dependencies. Node 18+. Same limitation as any recorded sequence: it
// is honest only while the records are — but it converts bulk writing from an
// invisible ordering choice into a checkable event, and the eval scorer reads
// the log as evidence.

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { walk } from "./test-file-utils.mjs";

const LOG = ".tdd-slice-log.jsonl";
const TEST_NAME_RE = /(?:^|\s)(?:test|it)\(\s*['"`]([^'"`]+)['"`]/;

function inventory() {
  const files = [];
  walk(".", files);
  const tests = [];
  for (const f of files.sort()) {
    const content = readFileSync(f, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = line.match(TEST_NAME_RE);
      if (m) tests.push(`${f.replace(/\\/g, "/")}#${m[1]}`);
    });
  }
  return tests.sort();
}

function readLog() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function diffTests(prev, cur) {
  const prevSet = new Set(prev);
  return cur.filter((t) => !prevSet.has(t));
}

function cmdInit() {
  if (existsSync(LOG)) {
    console.error(`slice gate: ${LOG} already exists — delete it to start a new loop`);
    return 1;
  }
  const tests = inventory();
  appendFileSync(LOG, JSON.stringify({ kind: "baseline", ts: new Date().toISOString(), tests }) + "\n");
  console.log(`slice gate: baseline recorded (${tests.length} tests)`);
  return 0;
}

function cmdRecord(desc) {
  if (!desc) {
    console.error("slice gate: --record requires a description");
    return 1;
  }
  if (!existsSync(LOG)) {
    console.error("slice gate: no log — run --init before the first RED");
    return 1;
  }
  const log = readLog();
  const prev = log[log.length - 1]?.tests ?? [];
  const cur = inventory();
  const newTests = diffTests(prev, cur);
  if (newTests.length > 1) {
    console.error(
      `slice gate FAILED: this record adds ${newTests.length} new tests — bulk writing (one slice = one test):\n` +
        newTests.map((t) => `  NEW ${t}`).join("\n") +
        `\nDelete the extras, keep one, re-record.`,
    );
    return 1;
  }
  appendFileSync(LOG, JSON.stringify({ kind: "record", ts: new Date().toISOString(), desc, tests: cur, newTests: newTests.length }) + "\n");
  console.log(`slice gate: recorded (+${newTests.length} new test(s)) — "${desc}"`);
  return 0;
}

function cmdVerify() {
  if (!existsSync(LOG)) {
    console.error("slice gate: no log to verify");
    return 1;
  }
  const log = readLog();
  let prev = [];
  let bad = 0;
  log.forEach((ev, i) => {
    if (ev.kind === "baseline") {
      prev = ev.tests;
      return;
    }
    const newTests = diffTests(prev, ev.tests);
    if (newTests.length > 1) {
      bad += 1;
      console.error(`BULK  event ${i + 1} ("${ev.desc}") added ${newTests.length} new tests:\n` + newTests.map((t) => `  NEW ${t}`).join("\n"));
    }
    prev = ev.tests;
  });
  console.log(
    bad === 0
      ? `slice gate OK (${log.filter((e) => e.kind === "record").length} records, invariant held: ≤1 new test per record)`
      : `slice gate FAILED: ${bad} bulk-writing record(s) in the loop`,
  );
  return bad === 0 ? 0 : 1;
}

function selfCheck() {
  const seq = [
    { kind: "baseline", tests: ["a#1#base one"] },
    { kind: "record", desc: "add first failing test", tests: ["a#1#base one", "a#1#new one"], newTests: 1 },
    { kind: "record", desc: "implement", tests: ["a#1#base one", "a#1#new one"], newTests: 0 },
    { kind: "record", desc: "bulk write", tests: ["a#1#base one", "a#1#new one", "a#1#new two", "a#1#new three"], newTests: 2 },
  ];
  let prev = [];
  let caught = 0;
  seq.forEach((ev, i) => {
    const newTests = diffTests(prev, ev.tests);
    if (i > 0 && newTests.length > 1) caught += 1;
    prev = ev.tests;
  });
  if (caught !== 1) {
    console.error(`--check FAILED: expected exactly 1 bulk record caught, got ${caught}`);
    return 1;
  }
  console.log("slice gate self-check OK (bulk record correctly identified)");
  return 0;
}

const args = process.argv.slice(2);
const mode = args[0];
if (mode === "--init") process.exit(cmdInit());
if (mode === "--record") process.exit(cmdRecord(args.slice(1).join(" ")));
if (mode === "--verify") process.exit(cmdVerify());
if (mode === "--check") process.exit(selfCheck());
console.log("usage: tdd-slice-gate.mjs --init | --record <desc> | --verify | --check");
process.exit(1);

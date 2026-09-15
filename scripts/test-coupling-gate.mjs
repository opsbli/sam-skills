#!/usr/bin/env node
// test-coupling-gate: mechanical enforcement of the tdd skill's anti-patterns.
//
// Scans test files for implementation-coupled access patterns — assertions or
// calls that reach into internal members (underscore-prefixed properties,
// bracket-string access to them) instead of going through the public seam.
// The tdd skill's "Inherited anti-patterns" rule says repo conventions never
// license these; this gate makes that check mechanical instead of judgement:
// GREEN is not GREEN until the gate passes.
//
// Modes:
//   node scripts/test-coupling-gate.mjs [--scan <paths...>]
//        Scan the given paths (default: tests/ and test/ if present, else cwd)
//        for test files; report every internal-member access hit. Exit 0 clean,
//        exit 1 violations.
//   node scripts/test-coupling-gate.mjs --check
//        Self-test: run the detector against embedded clean/coupled fixtures
//        and assert the results. Exit 0 on self-verification pass.
//
// Zero dependencies. Node 18+. Detection is line-based; documented limitation:
// it catches underscore-member coupling (the dominant form in this ecosystem's
// fixtures), not every conceivable coupling shape — it is a floor, not a proof.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { collectTestFiles } from "./test-file-utils.mjs";

const INTERNAL_MEMBER_RE = /\.\s*_[a-zA-Z]\w*|\[\s*['"]_[a-zA-Z]\w*['"]\s*\]/;
export function detectCoupling(content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (INTERNAL_MEMBER_RE.test(line)) {
      hits.push({ line: i + 1, snippet: line.trim().slice(0, 120) });
    }
  });
  return hits;
}

function scan(paths) {
  const files = collectTestFiles(paths);
  let violations = 0;
  for (const file of files) {
    const hits = detectCoupling(readFileSync(file, "utf8"));
    for (const hit of hits) {
      violations += 1;
      console.log(`COUPLED  ${file}:${hit.line}  ${hit.snippet}`);
    }
  }
  console.log(
    violations === 0
      ? `coupling gate OK (${files.length} test files scanned, 0 internal-member access)`
      : `coupling gate FAILED: ${violations} internal-member access hit(s) across ${files.length} test files — rewrite through the public seam (tdd Anti-patterns: Implementation-coupled / Inherited anti-patterns)`,
  );
  return violations === 0 ? 0 : 1;
}

function selfCheck() {
  const clean = `import { priceFor } from "../src/pricing.js";\ntest("discount applies", () => {\n  assert.equal(priceFor(item), 270);\n});\n`;
  const coupled = `test("release normalizes its input exactly once", () => {\n  inv.reserve(3);\n  assert.equal(inv._normalizedCalls, 1);\n});\ntest("spy on helper", () => {\n  const spy = mod['_clamp'](2);\n});\n`;
  const cleanHits = detectCoupling(clean);
  const coupledHits = detectCoupling(coupled);
  if (cleanHits.length !== 0) {
    console.error(`--check FAILED: clean fixture produced ${cleanHits.length} hit(s)`);
    return 1;
  }
  if (coupledHits.length !== 2) {
    console.error(`--check FAILED: coupled fixture produced ${coupledHits.length} hit(s), expected 2`);
    return 1;
  }
  console.log("coupling gate self-check OK (clean fixture 0 hits, coupled fixture 2 hits)");
  return 0;
}

const args = process.argv.slice(2);
if (args[0] === "--check") {
  process.exit(selfCheck());
}
const paths = args[0] === "--scan" ? (args.length > 1 ? args.slice(1) : []) : args;
const defaults = ["tests", "test"].filter((d) => existsSync(d));
process.exit(scan(paths.length ? paths : defaults.length ? defaults : ["."]));

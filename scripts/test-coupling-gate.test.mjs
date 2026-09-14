import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const GATE = new URL("./test-coupling-gate.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function runGate(dir) {
  return spawnSync(process.execPath, [GATE, "--scan", dir], { encoding: "utf8" });
}

test("gate passes a clean test file and flags internal-member access", () => {
  const dir = mkdtempSync(join(tmpdir(), "coupling-gate-"));
  try {
    writeFileSync(
      join(dir, "clean.test.js"),
      'import { priceFor } from "../src/pricing.js";\ntest("discount applies", () => {\n  assert.equal(priceFor(item), 270);\n});\n',
    );
    const clean = runGate(dir);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /coupling gate OK/);

    writeFileSync(
      join(dir, "coupled.test.js"),
      'test("counter", () => {\n  assert.equal(inv._normalizedCalls, 1);\n});\ntest("bracket", () => {\n  mod[\'_clamp\'](2);\n});\n',
    );
    const coupled = runGate(dir);
    assert.equal(coupled.status, 1, coupled.stdout + coupled.stderr);
    assert.match(coupled.stdout, /coupling gate FAILED/);
    assert.match(coupled.stdout, /_normalizedCalls/);
    assert.match(coupled.stdout, /_clamp/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gate --check self-verification passes", () => {
  const r = spawnSync(process.execPath, [GATE, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /self-check OK/);
});

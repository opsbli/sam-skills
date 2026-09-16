#!/usr/bin/env node
// explainer-page-gate.test.mjs — teeth for the published-page drift sentinel.
//
// Why this exists: a gate that watches a remote page can only see one thing
// offline — whether the transport registry moved since the page was last
// verified — and that is very easy to implement in a way that is green forever.
// A missing observation, a retired token quietly dropped from the hits map, or
// a fingerprint nobody recomputes would all sail through a lazily written
// inspect(). Every case below is a mutation that MUST fail; the control case
// asserts an honest page still passes. The last two run the script itself, so
// the fixtures and the wiring are exercised by CI rather than by whoever
// happens to remember `--check`.
//
// Run: node --test scripts/explainer-page-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { inspect, observe, registryFingerprint } from "./explainer-page-gate.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "explainer-page-gate.mjs");
const repo = join(dirname(script), "..");
const node = process.execPath;

const REGISTRY = {
  transports: [{ id: "codex-app" }, { id: "manual-runbook" }],
  retired: [{ id: "fork-loop-mcp", tokens: ["fork-loop", "spawn_execution", "check_status"] }],
};

function contract(over = {}) {
  return {
    nodeId: "x",
    publishUrl: "u",
    artifactUrl: "a",
    observed: {
      contentHash: "sha256:deadbeef",
      bytes: 1,
      transportCards: 2,
      gridColumns: 2,
      headingNumeral: "两",
      retiredTokenHits: { "fork-loop": 0, spawn_execution: 0, check_status: 0 },
    },
    transportsFingerprintAtSync: registryFingerprint(REGISTRY),
    lastSyncedAt: "2026-09-16",
    ...over,
  };
}

function withObservation(patch) {
  const c = contract();
  c.observed = { ...c.observed, ...patch };
  return c;
}

test("a page verified against the current registry passes", () => {
  assert.deepEqual(inspect(contract(), REGISTRY), []);
});

test("the drift that actually happened: the registry moves, nobody re-verifies", () => {
  const moved = { ...REGISTRY, transports: [...REGISTRY.transports, { id: "zcode-auto" }] };
  const problems = inspect(contract(), moved);
  assert.ok(problems.length > 0, "a registry that moved must not pass silently");
  assert.ok(
    problems.some((p) => p.includes("transport registry moved")),
    `expected a fingerprint complaint, got: ${problems.join("; ")}`,
  );
});

test("a page still rendering the old number of transport cards fails", () => {
  const problems = inspect(
    withObservation({ transportCards: 3, gridColumns: 3, headingNumeral: "三" }),
    REGISTRY,
  );
  assert.ok(problems.length >= 3, `expected card, grid and heading complaints, got: ${problems.join("; ")}`);
});

test("a page still naming a retired route fails", () => {
  const c = contract();
  c.observed = {
    ...c.observed,
    retiredTokenHits: { ...c.observed.retiredTokenHits, "fork-loop": 4 },
  };
  const problems = inspect(c, REGISTRY);
  assert.ok(
    problems.some((p) => p.includes('retired token "fork-loop"')),
    `expected a retired-token complaint, got: ${problems.join("; ")}`,
  );
});

test("a retired token dropped from the hits map fails instead of passing", () => {
  const hits = { ...contract().observed.retiredTokenHits };
  delete hits.spawn_execution;
  const problems = inspect(withObservation({ retiredTokenHits: hits }), REGISTRY);
  assert.ok(
    problems.some((p) => p.includes("was never checked")),
    `an unchecked token must not read as zero hits, got: ${problems.join("; ")}`,
  );
});

test("wiping the observation to silence the gate fails", () => {
  const problems = inspect(contract({ observed: null }), REGISTRY);
  assert.ok(problems.length > 0, "no observation is not a clean bill of health");
});

test("an unparseable heading numeral fails rather than being skipped", () => {
  const problems = inspect(withObservation({ headingNumeral: "百" }), REGISTRY);
  assert.ok(
    problems.some((p) => p.includes("is not one this gate knows")),
    `got: ${problems.join("; ")}`,
  );
});

test("observe() reads the page's own numbers — including off a stale page", () => {
  const html = [
    ".trans{grid-template-columns:repeat(3,1fr)}",
    '<div class="trcard">a</div><div class="trcard">b</div><div class="trcard">c</div>',
    "<h2>三条传输，同一套契约</h2>",
    "fork-loop … fork-loop … spawn_execution",
  ].join("\n");
  const seen = observe(html, ["fork-loop", "spawn_execution", "check_status"]);
  assert.equal(seen.transportCards, 3);
  assert.equal(seen.gridColumns, 3);
  assert.equal(seen.headingNumeral, "三");
  assert.equal(seen.retiredTokenHits["fork-loop"], 2);
  assert.equal(seen.retiredTokenHits["spawn_execution"], 1);
  assert.equal(seen.retiredTokenHits["check_status"], 0);
});

test("--check self-test passes", () => {
  const res = spawnSync(node, [script, "--check"], { encoding: "utf8" });
  assert.equal(res.status, 0, `${res.stdout || ""}${res.stderr || ""}`);
});

test("the gate runs green end to end against the real contracts", () => {
  const res = spawnSync(node, [script], { encoding: "utf8", cwd: repo });
  assert.equal(res.status, 0, `${res.stdout || ""}${res.stderr || ""}`);
});

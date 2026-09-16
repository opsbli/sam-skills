#!/usr/bin/env node
// explainer-page-gate — the published pipeline explainer still describes the
// transports the registry declares.
//
// Why this exists: the pipeline description has four copies — the skill, the
// README, the ADRs, and a published WorkBuddy page (workbuddy.link). Three live
// in the repo and are covered by gates. The page does not: it is edited through
// an upload API, has no owner here, and nothing failed when it went on
// describing a transport the repo had already retired. It did exactly that
// after ADR 0007 — still "三条传输" with a fork-loop card a full day after the
// code was deleted, noticed only because a human happened to look.
//
// What it can and cannot see — read this before trusting it:
//   - CAN, offline: whether the transport registry moved since the page was
//     last verified against it. That is the drift that actually happened, and
//     it is knowable without network because "the registry moved" is a local
//     fact. When it moves, this gate fails and asks for a re-verify.
//   - CANNOT, offline: whether someone edited the page behind our back. No
//     local file can know that. `--sync` (opt-in, network) is what looks at the
//     live artifact.
// So this is a sentinel that turns "did anyone re-check the page?" into a
// failing build step. It is not a monitor, and a green run does not prove the
// page is current — it proves the registry has not moved since the last time
// somebody looked. Only `--sync` looks.
//
// Modes:
//   (default)   offline sentinel: the contract vs contracts/transports.json
//   --check     self-test the checks against fixtures
//   --sync      network: fetch the live artifact, re-derive the observations,
//               and only if it agrees, record them in the contract
//   --sync --url <artifact-url>   override the recorded URL (the version
//               directory advances on every publish, so re-syncing usually
//               needs the current one from `list_page_artifacts.py`)
//
//   --registry <path> / --contract <path>   read those files from somewhere
//               other than the repo's contracts/. Only the test suite uses
//               this: it lets a drift case be asserted against a temp copy
//               instead of being written into the real contracts and undone.
//
// Exits 1 on failure. Read-only except --sync, which writes the contract.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join("contracts", "explainer-page.json");
const REGISTRY = join("contracts", "transports.json");

const NUMERALS = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Why a fingerprint and not a file hash: the question is "did the set of
 * transports move", and a file hash also moves when someone reflows JSON.
 * Re-verifying a page because a comma changed is noise, and noise is how a gate
 * earns a `--no-verify` habit. Ids and retired tokens are what the page
 * actually talks about, so those are what get hashed.
 */
export function registryFingerprint(registry) {
  const sig = {
    transports: (registry.transports || []).map((t) => t.id),
    retired: (registry.retired || []).map((r) => ({ id: r.id, tokens: r.tokens || [] })),
  };
  return "sha256:" + sha256(JSON.stringify(sig));
}

export function retiredTokens(registry) {
  return (registry.retired || []).flatMap((r) => r.tokens || []);
}

function escapeRe(token) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read the page's own numbers out of its HTML, so the gate judges what it says. */
export function observe(html, tokens) {
  const cards = (html.match(/class=["']trcard/g) || []).length;
  const grid = html.match(/\.trans\s*\{[^}]*?grid-template-columns:\s*repeat\((\d+),/);
  const heading = html.match(/([一两二三四五六七八九十]+)\s*条传输/);
  const retiredTokenHits = {};
  for (const token of tokens) {
    retiredTokenHits[token] = (html.match(new RegExp(escapeRe(token), "g")) || []).length;
  }
  return {
    contentHash: "sha256:" + sha256(html),
    bytes: Buffer.byteLength(html),
    transportCards: cards,
    gridColumns: grid ? Number(grid[1]) : null,
    headingNumeral: heading ? heading[1] : null,
    retiredTokenHits,
  };
}

/** @returns {string[]} one line per problem; empty means the page was verified against this registry. */
export function inspect(contract, registry) {
  const expected = (registry.transports || []).length;
  const tokens = retiredTokens(registry);
  const obs = contract.observed;

  if (!obs) {
    return [
      `no \`observed\` block — nothing has been recorded about the page yet; run \`npm run explainer-page:sync\``,
    ];
  }

  const problems = [];

  if (obs.transportCards !== expected) {
    problems.push(`the page renders ${obs.transportCards} transport card(s) but the registry declares ${expected}`);
  }
  if (obs.gridColumns !== expected) {
    problems.push(`the page's transport grid is ${obs.gridColumns} column(s) wide but the registry declares ${expected} transport(s)`);
  }

  const numeral = obs.headingNumeral;
  if (!numeral) {
    problems.push(`the page has no "N 条传输" heading to compare against ${expected} transport(s)`);
  } else if (NUMERALS[numeral] === undefined) {
    problems.push(`the heading numeral "${numeral}" is not one this gate knows (${Object.keys(NUMERALS).join("")})`);
  } else if (NUMERALS[numeral] !== expected) {
    problems.push(`the page heading reads "${numeral}条传输" but the registry declares ${expected} transport(s)`);
  }

  for (const token of tokens) {
    const hits = (obs.retiredTokenHits || {})[token];
    if (hits === undefined) {
      problems.push(
        `retired token "${token}" was never checked — the observation predates the retirement, or was edited by hand; run \`npm run explainer-page:sync\``,
      );
    } else if (hits !== 0) {
      problems.push(`the page still mentions the retired token "${token}" ${hits} time(s)`);
    }
  }

  const now = registryFingerprint(registry);
  if (contract.transportsFingerprintAtSync !== now) {
    problems.push(
      `the transport registry moved after the page was last verified (recorded ${contract.transportsFingerprintAtSync || "nothing"}, now ${now}) — the page may still describe the old set; run \`npm run explainer-page:sync\``,
    );
  }

  return problems;
}

function selfCheck() {
  const registry = {
    transports: [{ id: "codex-app" }, { id: "manual-runbook" }],
    retired: [{ id: "fork-loop-mcp", tokens: ["fork-loop", "spawn_execution"] }],
  };
  const FP = registryFingerprint(registry);
  const good = {
    contentHash: "sha256:deadbeef",
    bytes: 1,
    transportCards: 2,
    gridColumns: 2,
    headingNumeral: "两",
    retiredTokenHits: { "fork-loop": 0, "spawn_execution": 0 },
  };
  const contract = (over) => ({
    nodeId: "x",
    publishUrl: "u",
    artifactUrl: "a",
    observed: { ...good },
    transportsFingerprintAtSync: FP,
    lastSyncedAt: "2026-09-16",
    ...over,
  });
  const withObs = (patch) => contract({ observed: { ...good, ...patch } });

  const fixtures = [
    { name: "a page that agrees with the registry passes", c: contract(), want: 0 },
    { name: "a stale registry fingerprint is caught", c: contract({ transportsFingerprintAtSync: "sha256:stale" }), want: 1 },
    { name: "a page still naming a retired route is caught", c: withObs({ retiredTokenHits: { "fork-loop": 3, "spawn_execution": 0 } }), want: 1 },
    { name: "a retired token that was never checked is caught", c: withObs({ retiredTokenHits: { "fork-loop": 0 } }), want: 1 },
    { name: "a heading that disagrees is caught", c: withObs({ headingNumeral: "三" }), want: 1 },
    { name: "a card count that disagrees is caught", c: withObs({ transportCards: 3 }), want: 1 },
    { name: "a grid width that disagrees is caught", c: withObs({ gridColumns: 3 }), want: 1 },
    { name: "an unknown numeral is caught", c: withObs({ headingNumeral: "百" }), want: 1 },
    { name: "a missing heading is caught", c: withObs({ headingNumeral: null }), want: 1 },
    { name: "no observation at all is caught", c: contract({ observed: null }), want: 1 },
  ];

  const failures = [];
  for (const fixture of fixtures) {
    const found = inspect(fixture.c, registry);
    if (found.length !== fixture.want) {
      failures.push(`${fixture.name}: expected ${fixture.want} problem(s), got ${found.length} [${found.join("; ")}]`);
    }
  }

  // observe() is the other half: it must read the page's own numbers, not
  // assumptions. A stale copy of the page is exactly what these parse.
  const html = [
    ".trans{grid-template-columns:repeat(3,1fr)}",
    '<div class="trcard">a</div><div class="trcard">b</div><div class="trcard">c</div>',
    "<h2>三条传输，同一套契约</h2>",
    "fork-loop and fork-loop again",
  ].join("\n");
  const seen = observe(html, ["fork-loop", "spawn_execution"]);
  const expected = { transportCards: 3, gridColumns: 3, headingNumeral: "三", forkLoop: 2 };
  if (seen.transportCards !== expected.transportCards) failures.push(`observe(): transportCards ${seen.transportCards} ≠ ${expected.transportCards}`);
  if (seen.gridColumns !== expected.gridColumns) failures.push(`observe(): gridColumns ${seen.gridColumns} ≠ ${expected.gridColumns}`);
  if (seen.headingNumeral !== expected.headingNumeral) failures.push(`observe(): headingNumeral ${seen.headingNumeral} ≠ ${expected.headingNumeral}`);
  if (seen.retiredTokenHits["fork-loop"] !== expected.forkLoop) failures.push(`observe(): fork-loop hits ${seen.retiredTokenHits["fork-loop"]} ≠ ${expected.forkLoop}`);
  if (seen.retiredTokenHits["spawn_execution"] !== 0) failures.push(`observe(): spawn_execution hits ${seen.retiredTokenHits["spawn_execution"]} ≠ 0`);

  for (const failure of failures) console.error(`--check FAILED: ${failure}`);
  if (failures.length) return 1;
  console.log(`--check OK (${fixtures.length} fixtures + observe() round-trip)`);
  return 0;
}

async function sync(contractPath, registry, argv) {
  const current = JSON.parse(readFileSync(contractPath, "utf8"));
  const urlIdx = argv.indexOf("--url");
  const url = urlIdx >= 0 ? argv[urlIdx + 1] : current.artifactUrl;
  if (!url) {
    console.error("--sync: no artifact URL — pass `--sync --url <artifact-url>`");
    return 1;
  }

  let html;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`--sync: GET ${url} → HTTP ${res.status}`);
      return 1;
    }
    html = await res.text();
  } catch (err) {
    console.error(`--sync: cannot reach ${url}: ${err.message}`);
    return 1;
  }

  const observed = observe(html, retiredTokens(registry));
  const candidate = {
    ...current,
    artifactUrl: url,
    observed,
    transportsFingerprintAtSync: registryFingerprint(registry),
    lastSyncedAt: new Date().toISOString().slice(0, 10),
  };

  // Judge the live page before recording anything: a bad page must never become
  // the recorded state, or the gate would go green on its own failure.
  const problems = inspect(candidate, registry);
  if (problems.length) {
    console.error(`--sync: the live page does NOT agree with ${REGISTRY}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    console.error(`  source: ${url}`);
    console.error("  Nothing was recorded. Fix the page, then re-run.");
    return 1;
  }

  writeFileSync(contractPath, JSON.stringify(candidate, null, 2) + "\n");
  const changed = current.observed?.contentHash !== observed.contentHash;
  console.log(
    `--sync OK: ${observed.bytes} bytes, ${observed.transportCards} transport card(s), heading "${observed.headingNumeral}条传输", 0 retired-token hit(s)`,
  );
  console.log(
    `  content ${changed ? "CHANGED" : "unchanged"} (${observed.contentHash.slice(7, 19)}…), verified against registry ${candidate.transportsFingerprintAtSync.slice(7, 19)}…`,
  );
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--check")) return selfCheck();

  // Why these two overrides exist: the gate is otherwise welded to the repo's
  // own contracts/, which makes it impossible to test without mutating the real
  // files. Pointing it at a temp copy is what lets the test suite assert on
  // drift it does not have to create and then undo.
  function argValue(name) {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : null;
  }

  const registryPath = argValue("--registry")
    ? resolve(argValue("--registry"))
    : join(repo, REGISTRY);
  if (!existsSync(registryPath)) {
    console.error(`explainer-page-gate: ${registryPath} is missing — there is no single source for the transport list`);
    return 1;
  }
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));

  const contractPath = argValue("--contract")
    ? resolve(argValue("--contract"))
    : join(repo, CONTRACT);
  if (!existsSync(contractPath)) {
    console.error(`explainer-page-gate: ${contractPath} is missing — the published page has no drift record`);
    return 1;
  }

  if (argv.includes("--sync")) return await sync(contractPath, registry, argv);

  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const problems = inspect(contract, registry);
  if (problems.length) {
    for (const problem of problems) console.error(`explainer-page-gate: ${problem}`);
    console.error(
      `Fix: run \`npm run explainer-page:sync\` after updating ${contract.publishUrl || "the page"}, or fix the page so it matches ${registryPath}.`,
    );
    return 1;
  }

  const tokens = retiredTokens(registry).length;
  console.log(
    `explainer-page-gate OK (page verified ${contract.lastSyncedAt}: ${contract.observed.transportCards} transport card(s), "${contract.observed.headingNumeral}条传输", ` +
      `0 of ${tokens} retired token(s) present — registry unchanged since)`,
  );
  return 0;
}

// Why this guard: the test suite imports inspect()/observe() from this file.
// Without it, importing the module would run the gate against the real repo and
// exit the test process before a single assertion ran.
const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  process.exit(await main());
}

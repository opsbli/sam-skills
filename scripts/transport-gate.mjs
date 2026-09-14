#!/usr/bin/env node
// transport-gate — the skill's transport list and contracts/transports.json agree.
//
// Why this exists: `execute-spec-in-fork` is the router that decides how one
// approved spec reaches an execution thread, and it carried its transport list in
// prose in three places (the ordered detection list, one route section per
// transport, and the README tables). Nothing tied them together, so adding a
// fourth transport was 7-8 hand edits and any miss left the router advertising a
// transport the code did not have — a router that lies is worse than one that is
// incomplete, because an agent acts on it.
//
// Modes:
//   (default)   validate the skill against the registry
//   --check     self-test the checks against fixtures
//
// Exits 1 on failure. Read-only.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join("contracts", "transports.json");

/** The body of a section, from its heading to the next `## ` or EOF. */
function section(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

/** @returns {string[]} one line per problem; empty means the two agree. */
function inspect(registry, skillText) {
  const problems = [];
  const transports = registry.transports;

  if (!Array.isArray(transports) || transports.length === 0) {
    return ["the registry declares no transports"];
  }

  const list = section(skillText, registry.detectionList.heading);
  if (list === null) {
    problems.push(
      `the detection list heading is gone: "${registry.detectionList.heading}"`,
    );
  } else {
    const items = list.match(/^\s*\d+\.\s/gm) || [];
    if (items.length !== transports.length) {
      problems.push(
        `the detection list offers ${items.length} option(s) but the registry declares ${transports.length} transport(s)`,
      );
    }
  }

  for (const transport of transports) {
    if (list !== null && !list.includes(transport.detectionToken)) {
      problems.push(
        `"${transport.id}" is registered but the detection list never mentions ${transport.detectionToken}`,
      );
    }
    if (!skillText.includes(transport.routeHeading)) {
      problems.push(
        `"${transport.id}" is registered but its route section is missing: "${transport.routeHeading}"`,
      );
    }
    if (transport.implementation && !existsSync(join(repo, transport.implementation))) {
      problems.push(
        `"${transport.id}" points at a missing implementation: ${transport.implementation}`,
      );
    }
    if (transport.decision && !existsSync(join(repo, transport.decision))) {
      problems.push(`"${transport.id}" points at a missing ADR: ${transport.decision}`);
    }
  }

  return problems;
}

function selfCheck() {
  const dir = mkdtempSync(join(tmpdir(), "transport-gate-"));
  const fixtures = [
    {
      name: "complete skill passes",
      skill: `${"# Title\n\n"}## Pick the transport (detect in this order)\n\n1. **Codex App**: a\n2. **fork-loop MCP**: b\n3. **Neither**: c\n\n## Codex App route\nx\n\n## ZCode automatic route\ny\n\n## Manual fallback runbook\nz\n`,
      registry: { detectionList: { heading: "## Pick the transport (detect in this order)" }, transports: baseTransports() },
      want: 0,
    },
    {
      name: "a transport with no route section is caught",
      skill: `${"# Title\n\n"}## Pick the transport (detect in this order)\n\n1. **Codex App**: a\n2. **fork-loop MCP**: b\n3. **Neither**: c\n\n## Codex App route\nx\n\n## ZCode automatic route\ny\n`,
      registry: { detectionList: { heading: "## Pick the transport (detect in this order)" }, transports: baseTransports() },
      want: 1,
    },
    {
      // Two independent complaints: the list is short one option, and the third
      // transport's token therefore never appears.
      name: "a detection count that disagrees is caught",
      skill: `${"# Title\n\n"}## Pick the transport (detect in this order)\n\n1. **Codex App**: a\n2. **fork-loop MCP**: b\n\n## Codex App route\nx\n\n## ZCode automatic route\ny\n\n## Manual fallback runbook\nz\n`,
      registry: { detectionList: { heading: "## Pick the transport (detect in this order)" }, transports: baseTransports() },
      want: 2,
    },
    {
      name: "a missing detection token is caught",
      skill: `${"# Title\n\n"}## Pick the transport (detect in this order)\n\n1. **Codex App**: a\n2. **fork-loop MCP**: b\n3. **Whatever**: c\n\n## Codex App route\nx\n\n## ZCode automatic route\ny\n\n## Manual fallback runbook\nz\n`,
      registry: { detectionList: { heading: "## Pick the transport (detect in this order)" }, transports: baseTransports() },
      want: 1,
    },
  ];

  const failures = [];
  for (const fixture of fixtures) {
    const file = join(dir, "SKILL.md");
    writeFileSync(file, fixture.skill);
    // inspect() reads no files for these fixtures (no implementation paths set)
    const found = inspect(fixture.registry, fixture.skill);
    if (found.length !== fixture.want) {
      failures.push(`${fixture.name}: expected ${fixture.want} problem(s), got ${found.length} [${found.join("; ")}]`);
    }
  }
  rmSync(dir, { recursive: true, force: true });

  for (const failure of failures) console.error(`--check FAILED: ${failure}`);
  if (failures.length) return 1;
  console.log(`--check OK (${fixtures.length} fixtures)`);
  return 0;
}

function baseTransports() {
  return [
    { id: "codex-app", detectionToken: "**Codex App**", routeHeading: "## Codex App route" },
    { id: "fork-loop-mcp", detectionToken: "**fork-loop MCP**", routeHeading: "## ZCode automatic route" },
    { id: "manual-runbook", detectionToken: "**Neither**", routeHeading: "## Manual fallback runbook" },
  ];
}

if (process.argv.slice(2).includes("--check")) {
  process.exit(selfCheck());
}

const registryPath = join(repo, REGISTRY);
if (!existsSync(registryPath)) {
  console.error(`transport-gate: ${REGISTRY} is missing — the transport list has no single source`);
  process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const skillPath = join(repo, registry.detectionList.path);
if (!existsSync(skillPath)) {
  console.error(`transport-gate: ${registry.detectionList.path} is missing`);
  process.exit(1);
}

const problems = inspect(registry, readFileSync(skillPath, "utf8"));
if (problems.length) {
  for (const problem of problems) console.error(`transport-gate: ${problem}`);
  console.error(
    `Fix: update ${registry.detectionList.path} to match ${REGISTRY}, or register/remove the transport there.`,
  );
  process.exit(1);
}

console.log(
  `transport-gate OK (${registry.transports.length} transports agree with the detection list and their route sections)`,
);

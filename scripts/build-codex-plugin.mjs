#!/usr/bin/env node
// Generates the Codex plugin payload from the promoted-skill set.
//
// .claude-plugin/plugin.json's skills array is the single source of truth
// for the promoted set. Codex manifests accept only ONE skills path with
// recursive discovery (ADR 0002), so this script mirrors the promoted skill
// directories into .codex-plugin/skills/ as a flat, committed copy and stamps
// .codex-plugin/plugin.json from package.json.
//
// The manifest is reproduced *faithfully*, including the parts that are not
// derived from package.json: the fork-loop MCP server block (rewritten to
// ${CODEX_PLUGIN_ROOT}), and the Stop hook copied from .claude-plugin/hooks/.
// A generator that emits less than the committed artifact is worse than no
// generator: running it deletes the difference, and --check then goes green
// over a plugin that quietly lost its transport. Every hand-added part of the
// committed payload must have a counterpart here.
//
// Modes:
//   (default)  regenerate .codex-plugin/ in place
//   --check    verify the committed payload is fresh; exit 1 on drift (CI gate)

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkMode = process.argv[2] === "--check";

const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const claudePlugin = JSON.parse(
  readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"),
);

function buildManifest() {
  return (
    JSON.stringify(
      {
        name: "sam-skills",
        version: pkg.version,
        description:
          "Matt Pocock's engineering skills with verifiable goal handoffs and automated forked spec execution.",
        author: {
          name: "opsbli",
          url: "https://github.com/opsbli",
        },
        homepage: "https://github.com/opsbli/sam-skills",
        repository: "https://github.com/opsbli/sam-skills",
        license: "MIT",
        keywords: [
          "engineering",
          "skills",
          "tdd",
          "code-review",
          "grilling",
          "domain-modeling",
          "productivity",
          "goals",
          "spec-execution",
        ],
        skills: "./.codex-plugin/skills/",
        interface: {
          displayName: "Sam Skills",
          shortDescription:
            "Verifiable goal handoffs and automated forked spec execution.",
          longDescription:
            "Matt Pocock's engineering skill set, extended by this fork with verifiable goal handoffs (to-goal), forked spec execution with structured receipts (spec-executor, execute-spec-in-fork), opposed-perspective decision review (roundtable), and enforceable project standards (project-standards).",
          developerName: "opsbli",
          category: "Productivity",
        },
        // Hand-added to the committed payload; reproduced here so regenerating
        // cannot silently drop the Codex plugin's automatic transport.
        mcpServers: {
          "fork-loop": {
            type: "stdio",
            command: "node",
            args: ["${CODEX_PLUGIN_ROOT}/scripts/fork-loop-mcp/server.mjs"],
          },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function generate(targetRoot) {
  const pluginDir = join(targetRoot, ".codex-plugin");
  const skillsDir = join(pluginDir, "skills");
  rmSync(pluginDir, { recursive: true, force: true });
  for (const rel of claudePlugin.skills) {
    const name = rel.split("/").pop();
    cpSync(join(repo, rel), join(skillsDir, name), { recursive: true });
  }
  // The Stop hook that delivers receipts is part of the shipped payload, not
  // only of the Claude manifest — mirror the hook directory as well.
  const hooksSrc = join(repo, ".claude-plugin", "hooks");
  if (existsSync(hooksSrc)) {
    cpSync(hooksSrc, join(pluginDir, "hooks"), { recursive: true });
  }
  writeFileSync(join(pluginDir, "plugin.json"), buildManifest(), {
    encoding: "utf8",
  });
  return claudePlugin.skills.length;
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(root, full));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

if (!checkMode) {
  const count = generate(repo);
  console.log(`codex plugin payload regenerated (${count} skills)`);
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "codex-plugin-check-"));
try {
  generate(tmp);
  const expectedRoot = join(tmp, ".codex-plugin");
  const actualRoot = join(repo, ".codex-plugin");
  const errors = [];
  if (!existsSync(actualRoot)) {
    errors.push(".codex-plugin/ is missing — run node scripts/build-codex-plugin.mjs");
  } else {
    const expected = listFiles(expectedRoot);
    const actual = listFiles(actualRoot);
    const expSet = new Set(expected);
    const actSet = new Set(actual);
    for (const f of expected.filter((f) => !actSet.has(f))) {
      errors.push(`missing from .codex-plugin: ${f}`);
    }
    for (const f of actual.filter((f) => !expSet.has(f))) {
      errors.push(`stale file in .codex-plugin: ${f}`);
    }
    for (const f of expected.filter((f) => actSet.has(f))) {
      const a = readFileSync(join(actualRoot, f));
      const b = readFileSync(join(expectedRoot, f));
      if (!sameContent(a, b)) errors.push(`drifted: .codex-plugin/${f}`);
    }
  }
  if (errors.length) {
    console.error(`codex plugin payload stale (${errors.length}):`);
    for (const message of errors.slice(0, 20)) console.error(`  ${message}`);
    if (errors.length > 20) console.error(`  … and ${errors.length - 20} more`);
    console.error("run: node scripts/build-codex-plugin.mjs");
    process.exit(1);
  }
  console.log("codex plugin payload fresh");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Line endings are a checkout artifact (core.autocrlf on Windows), not drift.
// plugin.json is written with LF while a Windows working tree holds CRLF, so a
// byte comparison reports a false positive on every such clone. Compare text
// with CRLF normalised; compare anything containing a NUL byte byte-wise.
function sameContent(a, b) {
  if (a.equals(b)) return true;
  if (a.includes(0) || b.includes(0)) return false;
  return (
    a.toString("utf8").replace(/\r\n/g, "\n") ===
    b.toString("utf8").replace(/\r\n/g, "\n")
  );
}

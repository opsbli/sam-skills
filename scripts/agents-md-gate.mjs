#!/usr/bin/env node
// agents-md-gate — AGENTS.md must be a real file with real content.
//
// Why this exists: AGENTS.md is what Codex reads as the repository's standing
// instructions. CHANGELOG 1.2.0 added it "as a symlink to CLAUDE.md"; on any
// checkout where git does not create symlinks (core.symlinks=false, the default
// on Windows) that materialises as a tiny regular file whose entire content is
// the literal target path. The repo then appears to ship instructions while every
// agent reads nine bytes of `CLAUDE.md` — and nothing else in the guard set
// notices, because the file exists, it is tracked, and no other check reads it.
//
// Modes:
//   (default)   validate the repo's AGENTS.md
//   --check     self-test the validator against fixtures
//
// Exits 1 on failure. Read-only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "AGENTS.md";
const MIN_BYTES = 200;

/** @returns {string[]} one line per problem; empty means the file is sound. */
function inspect(target, text, stat) {
  if (!stat.exists) return [`${target} is missing`];
  const found = [];
  if (!stat.isFile) found.push(`${target} is not a regular file`);
  if (stat.size < MIN_BYTES) {
    found.push(
      `${target} is only ${stat.size} bytes (minimum ${MIN_BYTES}) — ` +
        "a symlink materialised by a checkout without symlink support looks exactly like this",
    );
  }
  if (!/CLAUDE\.md/.test(text)) found.push(`${target} does not point at CLAUDE.md`);
  return found;
}

function checkTarget(file, name = TARGET) {
  if (!fs.existsSync(file)) return inspect(name, "", { exists: false });
  const stat = fs.lstatSync(file);
  const text = fs.readFileSync(file, "utf8");
  return inspect(name, text, { exists: true, isFile: stat.isFile(), size: stat.size });
}

function selfCheck() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-gate-"));
  const body = `# Agent instructions\n\nSee [CLAUDE.md](./CLAUDE.md) for the standing rules.\n${"x".repeat(300)}\n`;

  const fixtures = [
    { name: "a real pointer is accepted", text: body, want: 0 },
    { name: "a materialised symlink is rejected", text: "CLAUDE.md", want: 1 },
    { name: "content that never mentions CLAUDE.md is rejected", text: `# Rules\n${"x".repeat(300)}`, want: 1 },
    // Empty trips two independent rules: too short, and no pointer. That is the
    // intended behaviour, so the expectation is 2 rather than 1.
    { name: "an empty file is rejected on both counts", text: "", want: 2 },
  ];

  const failures = [];
  for (const fixture of fixtures) {
    const file = path.join(dir, "AGENTS.md");
    fs.writeFileSync(file, fixture.text);
    const found = checkTarget(file, "AGENTS.md");
    if (found.length !== fixture.want) {
      failures.push(`${fixture.name}: expected ${fixture.want} problem(s), got ${found.length} [${found.join("; ")}]`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });

  const missing = checkTarget(path.join(os.tmpdir(), "agents-md-gate-definitely-absent"), "AGENTS.md");
  if (missing.length !== 1) failures.push(`a missing file is rejected: expected 1 problem, got ${missing.length}`);

  for (const failure of failures) console.error(`--check FAILED: ${failure}`);
  if (failures.length) return 1;
  console.log(`--check OK (${fixtures.length + 1} fixtures)`);
  return 0;
}

if (process.argv.slice(2).includes("--check")) {
  process.exit(selfCheck());
}

const file = path.join(repo, TARGET);
const problems = checkTarget(file);

if (problems.length) {
  for (const problem of problems) console.error(`agents-md-gate: ${problem}`);
  console.error(
    "Fix: make AGENTS.md a real file whose body points at CLAUDE.md. " +
      "Do not rely on symlink support — git will not create one where core.symlinks is false.",
  );
  process.exit(1);
}

console.log(`agents-md-gate OK (${fs.statSync(file).size} bytes)`);

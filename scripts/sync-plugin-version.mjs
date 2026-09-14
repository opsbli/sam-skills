#!/usr/bin/env node
// Keeps every place the fork version is written on one value.
//
// Landing points, all of which must agree with package.json:
//   .claude-plugin/plugin.json   version
//   .codex-plugin/plugin.json    version  (stamped by build-codex-plugin.mjs)
//   README.md                    the shields.io `fork-` badge
//
// Why the README badge is here: it was the only landing point no guard read. The
// plugin manifests are covered (`check-plugin-version` and the codex payload
// freshness check), so a release could ship a README advertising the *previous*
// version and nothing would turn red — a silent, published inconsistency.
//
// Runs as part of `npm run version`, immediately after `changeset version`.
// With --check it changes nothing and exits 1 on any mismatch.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(repo, ".claude-plugin", "plugin.json");
const readmePath = join(repo, "README.md");
const checkMode = process.argv.includes("--check");

const { version } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

// shields.io renders a literal `-` as `--`, so the badge text is not the raw
// version string: 1.2.3-to-goal.3 is shown as v1.2.3--to--goal.3.
const badgeVersion = `v${version.replace(/-/g, "--")}`;
const BADGE_RE = /(badge\/fork-)(.+)-([0-9A-Fa-f]{6})(\?)/;

const pluginSource = readFileSync(pluginPath, "utf8");
const plugin = JSON.parse(pluginSource);
const readmeSource = readFileSync(readmePath, "utf8");
const badge = readmeSource.match(BADGE_RE);

const problems = [];
if (plugin.version !== version) {
  problems.push(`.claude-plugin/plugin.json is ${plugin.version}, package.json is ${version}`);
}
if (!badge) {
  problems.push("README.md has no shields.io `fork-` badge to check");
} else if (badge[2] !== badgeVersion) {
  problems.push(`README.md fork badge reads ${badge[2]}, package.json implies ${badgeVersion}`);
}

if (problems.length === 0) {
  console.log(`version ${version} is in sync across package.json, plugin.json and the README badge`);
  process.exit(0);
}

if (checkMode) {
  for (const problem of problems) console.error(`version identity: ${problem}`);
  console.error("Run `node scripts/sync-plugin-version.mjs` to rewrite them.");
  process.exit(1);
}

if (plugin.version !== version) {
  // Rewrite only the version line, to keep the key order and the formatting.
  const updated = pluginSource.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (JSON.parse(updated).version !== version) {
    console.error(`Could not find a version field to replace in ${pluginPath}.`);
    process.exit(1);
  }
  writeFileSync(pluginPath, updated);
  console.log(`plugin.json version ${plugin.version} -> ${version}`);
}

if (badge && badge[2] !== badgeVersion) {
  writeFileSync(readmePath, readmeSource.replace(BADGE_RE, `$1${badgeVersion}-$3$4`));
  console.log(`README fork badge ${badge[2]} -> ${badgeVersion}`);
}

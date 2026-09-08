#!/usr/bin/env node
// Router auto-validation. Three mechanical checks, one failure blocks merge:
//   1. plugin.json skills array parses and every promoted skill name is
//      mentioned in the ask-matt router (a skill the router never names is
//      a router that lies — see CLAUDE.md);
//   2. every promoted skill is linked from the top-level README.md;
//   3. every README.md skill link resolves to a SKILL.md that exists on disk.
// Changes nothing; exits 1 on drift.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (message) => errors.push(message);

const plugin = JSON.parse(
  readFileSync(join(repo, ".claude-plugin", "plugin.json"), "utf8"),
);
const promoted = [];
for (const [index, raw] of (plugin.skills || []).entries()) {
  const match =
    typeof raw === "string" &&
    raw.match(/^\.\/skills\/(engineering|productivity)\/([a-z0-9-]+)$/);
  if (!match) {
    fail(`plugin.json skills[${index}] is not ./skills/<bucket>/<name>: ${raw}`);
    continue;
  }
  promoted.push({ bucket: match[1], name: match[2] });
}

// 1. Router coverage: ask-matt routes to every promoted skill except itself.
const router = readFileSync(
  join(repo, "skills", "engineering", "ask-matt", "SKILL.md"),
  "utf8",
);
for (const { name } of promoted) {
  if (name === "ask-matt") continue;
  const mentioned = new RegExp(`(?<![a-z0-9-])${name}(?![a-z0-9-])`).test(
    router,
  );
  if (!mentioned) {
    fail(`ask-matt/SKILL.md never mentions promoted skill: ${name}`);
  }
}

// 2 + 3. README link integrity and coverage.
const readme = readFileSync(join(repo, "README.md"), "utf8");
const linkRe =
  /\[(`?)(?<text>[a-z0-9-]+)\1\]\(\.\/skills\/(?<bucket>engineering|productivity|misc|in-progress|deprecated)\/(?<name>[a-z0-9-]+)\/SKILL\.md\)/g;
const linked = new Set();
for (const match of readme.matchAll(linkRe)) {
  const { text, bucket, name } = match.groups;
  const target = join("skills", bucket, name, "SKILL.md");
  if (!existsSync(join(repo, target))) {
    fail(`README.md link target missing: ${target} (link text: ${text})`);
  }
  linked.add(`${bucket}/${name}`);
}
for (const { bucket, name } of promoted) {
  if (!linked.has(`${bucket}/${name}`)) {
    fail(`README.md never links promoted skill: ${bucket}/${name}`);
  }
}

if (errors.length) {
  console.error(`router check failed (${errors.length}):`);
  for (const message of errors) console.error(`  ${message}`);
  process.exit(1);
}

console.log(`router check OK (${promoted.length} promoted skills routed and linked)`);

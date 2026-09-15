#!/usr/bin/env node
// Machine-checks promoted-skill inventory, README links, docs pages,
// and invocation pairing. Changes nothing; exits 1 on drift.
//
// Extra mode: --diff-audit <upstream-ref>
//   Audits expression-layer drift in skills inherited from upstream.
//   Fork-owned skills are exempt; inherited skills whose diff against the
//   upstream ref exceeds the line budget without a changeset mentioning the
//   skill name are reported. Currently warn-only (exit 0); becomes a hard
//   gate after two releases.
//   Exits 2 — never 0 — whenever the audit cannot actually run (missing ref,
//   unreadable commit object, unreachable merge base, empty inherited set,
//   or a diff that errors instead of returning empty). Reporting OK over an
//   empty run is the one outcome this guard must never produce.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMOTED = ["engineering", "productivity"];
const NON_PROMOTED = ["misc", "in-progress", "deprecated"];
const ALL_BUCKETS = [...PROMOTED, ...NON_PROMOTED];

// Skills this fork owns end to end; their diffs against upstream are the
// fork's reason to exist and are exempt from expression-layer budgeting. The
// list lives in contracts/fork-authorship.json so the lint, the fork docs, and
// the PR template cannot drift apart on who is fork-owned. This used to be a
// hardcoded Set, which is how project-standards and harvest ended up treated
// as inherited skills the fork had written itself.
const FORK_AUTHORSHIP_PATH = join("contracts", "fork-authorship.json");

const DIFF_AUDIT_LINE_BUDGET = 40;

function forkOwnedIds() {
  let parsed;
  try {
    parsed = JSON.parse(read(FORK_AUTHORSHIP_PATH));
  } catch (error) {
    console.error(
      `lint: cannot read ${FORK_AUTHORSHIP_PATH} (${error.message}) — the fork-authored skill list is the source of truth for the diff-audit exemption`,
    );
    process.exit(2);
  }
  if (!Array.isArray(parsed.skillIds)) {
    console.error(`lint: ${FORK_AUTHORSHIP_PATH} must carry a skillIds array`);
    process.exit(2);
  }
  return new Set(parsed.skillIds);
}

// diff-audit fails closed. A guard that reports OK without having audited
// anything is worse than no guard, so every condition that makes the audit
// vacuous (unresolvable ref, unreadable commit object, unreachable merge base,
// an empty inherited-skill set, a diff that errors instead of returning empty)
// exits 2 — never a green line over an empty run.
function runDiffAudit(ref) {
  const git = (args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  const abort = (message) => {
    console.error(`diff-audit: ${message}`);
    console.error("diff-audit: refusing to report OK on an audit that did not run");
    process.exit(2);
  };

  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
  } catch {
    abort(`ref not found: ${ref} (fetch upstream first, e.g. git fetch upstream main)`);
  }

  // A ref can resolve while its commit object is missing (partial clone,
  // pruned pack, grafted history). `A...B` then fails for every path, and the
  // old code swallowed that into an empty — but green — report.
  try {
    git(["cat-file", "-e", `${ref}^{commit}`]);
  } catch {
    abort(`ref ${ref} resolves but its commit object is unreadable in this clone`);
  }

  let mergeBase;
  try {
    mergeBase = git(["merge-base", ref, "HEAD"]);
  } catch {
    abort(`no reachable merge base between ${ref} and HEAD`);
  }

  const changesetText = readdirSync(join(repo, ".changeset"))
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => readFileSync(join(repo, ".changeset", name), "utf8"))
    .join("\n");

  const targets = [];
  const FORK_OWNED = forkOwnedIds();
  for (const bucket of PROMOTED) {
    for (const name of listSkillDirs(bucket)) {
      const skillId = id(bucket, name);
      if (FORK_OWNED.has(skillId)) continue;
      // Forward slashes throughout: git prints `/`-separated paths on every
      // platform, so the grouping below must not depend on the host separator.
      targets.push({ skillId, name, skillPath: ["skills", bucket, name].join("/") });
    }
  }
  if (targets.length === 0) {
    abort(
      "every promoted skill is classified fork-owned, so there is nothing to audit (check contracts/fork-authorship.json)",
    );
  }

  // One diff over every audited directory, grouped by file, instead of one
  // subprocess per skill. On Windows a git spawn costs a good fraction of a
  // second, which made `--diff-audit` the slowest step in the audit by far.
  // `--no-renames` keeps each changed file on a single line with a plain path, so
  // the grouping cannot be confused by rename brace syntax, and a file moved in
  // from outside the audited directories is counted where it landed rather than
  // vanishing.
  const auditRoots = [
    ...new Set(targets.map((t) => t.skillPath.split("/").slice(0, 2).join("/"))),
  ];
  const numstat = git([
    "diff",
    "--numstat",
    "-w",
    "--no-renames",
    `${ref}...HEAD`,
    "--",
    ...auditRoots,
  ]);

  const changedByFile = new Map();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10) || 0;
    const removed = parseInt(parts[1], 10) || 0;
    if (added + removed === 0) continue;
    changedByFile.set(parts[2], (changedByFile.get(parts[2]) || 0) + added + removed);
  }

  const warnings = [];
  const rows = [];
  for (const { skillId, name, skillPath } of targets) {
    let changed = 0;
    for (const [file, count] of changedByFile) {
      if (file === skillPath || file.startsWith(`${skillPath}/`)) changed += count;
    }
    if (changed === 0) continue;
    const justified = changesetText.includes(name);
    rows.push({ skillId, changed, justified });
    if (changed > DIFF_AUDIT_LINE_BUDGET && !justified) {
      warnings.push(
        `${skillId}: ${changed} changed lines vs ${ref} with no changeset mentioning "${name}" — expression-layer edits to inherited skills need justification (see docs/maintaining-fork.md, "Inherited-skill change policy")`,
      );
    }
  }
  const audited = targets.length;

  if (audited !== targets.length) {
    abort(
      `audited ${audited} of ${targets.length} inherited skills (merge base ${mergeBase})`,
    );
  }

  console.log(
    `diff-audit vs ${ref} (budget ${DIFF_AUDIT_LINE_BUDGET} lines, fork-owned exempt, merge base ${mergeBase.slice(0, 7)}):`,
  );
  console.log(
    `  audited ${audited}/${targets.length} inherited skills, ${rows.length} with changes${rows.length ? "" : " (all clean vs upstream)"}`,
  );
  for (const row of rows.sort((a, b) => b.changed - a.changed)) {
    console.log(
      `  ${row.changed}\t${row.skillId}${row.justified ? " (changeset)" : ""}`,
    );
  }
  if (warnings.length) {
    console.warn(`diff-audit warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`  ${warning}`);
  } else {
    console.log("diff-audit OK");
  }
}

if (process.argv[2] === "--diff-audit") {
  runDiffAudit(process.argv[3] || "upstream/main");
  process.exit(0);
}

const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relPath) {
  return readFileSync(join(repo, relPath), "utf8");
}

function listSkillDirs(bucket) {
  const bucketDir = join(repo, "skills", bucket);
  if (!existsSync(bucketDir)) return [];
  return readdirSync(bucketDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(bucketDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function id(bucket, name) {
  return `${bucket}/${name}`;
}

function fmt(ids) {
  return [...ids].sort().join(", ");
}

function diff(actual, expected) {
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  return { missing, extra };
}

function reportDiff(side, actual, expected) {
  const { missing, extra } = diff(actual, expected);
  if (missing.length) fail(`missing from ${side}: ${fmt(missing)}`);
  if (extra.length) fail(`extra in ${side}: ${fmt(extra)}`);
}

function frontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : "";
}

function hasDisableModelInvocation(skillMd) {
  return /^disable-model-invocation:\s*"?true"?\s*$/m.test(
    frontmatter(skillMd),
  );
}

function hasDenyImplicitInvocation(openaiYaml) {
  return /^[ \t]*allow_implicit_invocation:\s*"?false"?\s*$/m.test(
    openaiYaml,
  );
}

function invocationOf(bucket, name) {
  const skillMd = read(join("skills", bucket, name, "SKILL.md"));
  const yamlPath = join("skills", bucket, name, "agents", "openai.yaml");
  const openaiYaml = existsSync(join(repo, yamlPath)) ? read(yamlPath) : "";
  return {
    disable: hasDisableModelInvocation(skillMd),
    denyImplicit: hasDenyImplicitInvocation(openaiYaml),
    description: skillDescription(skillMd),
  };
}

// The frontmatter `description`, inline or as a `>` / `|` block scalar.
function skillDescription(skillMd) {
  const lines = frontmatter(skillMd).split(/\r?\n/);
  const idx = lines.findIndex((line) => /^description:/.test(line));
  if (idx < 0) return "";
  const inline = lines[idx].replace(/^description:\s*/, "").trim();
  if (inline && !/^[>|]/.test(inline)) {
    return inline.replace(/^["']|["']$/g, "");
  }
  const block = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break;
    block.push(lines[i].trim());
  }
  return block.join(" ").trim();
}

// A user-invoked skill's description is human-facing (a line in the slash-command
// list), so model-trigger phrasing there is dead weight at best — and at worst it
// invites the reader to expect automatic invocation the skill can never get
// (.agents/invocation.md, "Model-invoked vs user-invoked").
const MODEL_TRIGGER_RE =
  /\buse (when|after|this|it)\b|\bwhen the user\b|\brun it\b|\bdon'?t invoke\b|\btrigger phrases?\b/i;

function extractLinks(markdown, pattern) {
  const links = [];
  const re = new RegExp(pattern.source, pattern.flags);
  for (const match of markdown.matchAll(re)) {
    links.push({
      text: match[1],
      ...match.groups,
      raw: match[0],
    });
  }
  return links;
}

const TOP_SKILL_LINK =
  /\[`(?<text>[a-z0-9-]+)`\]\(\.\/skills\/(?<bucket>engineering|productivity|misc|in-progress|deprecated)\/(?<name>[a-z0-9-]+)\/SKILL\.md\)/g;
const BUCKET_SKILL_LINK =
  /\[`?(?<text>[a-z0-9-]+)`?\]\(\.\/(?<name>[a-z0-9-]+)\/SKILL\.md\)/g;

const promoted = new Map();
for (const bucket of PROMOTED) {
  for (const name of listSkillDirs(bucket)) {
    promoted.set(id(bucket, name), { bucket, name });
  }
}
const promotedIds = new Set(promoted.keys());

// The fork-authored list must name promoted skills that exist. A stale id
// exempts nothing and silently drops a real skill into the drift audit's
// inherited set; a missing id does the reverse.
const forkOwned = forkOwnedIds();
for (const skillId of forkOwned) {
  if (!promotedIds.has(skillId)) {
    fail(`contracts/fork-authorship.json lists a skill that is not promoted: ${skillId}`);
  }
}

const nonPromoted = [];
for (const bucket of NON_PROMOTED) {
  for (const name of listSkillDirs(bucket)) {
    nonPromoted.push({ bucket, name, id: id(bucket, name) });
  }
}
const nonPromotedNames = new Set(nonPromoted.map((skill) => skill.name));

const plugin = JSON.parse(read(join(".claude-plugin", "plugin.json")));
const pluginIds = new Set();
const pluginPaths = Array.isArray(plugin.skills) ? plugin.skills : [];
for (const [index, raw] of pluginPaths.entries()) {
  const match =
    typeof raw === "string" &&
    raw.match(/^\.\/skills\/(engineering|productivity|misc|in-progress|deprecated)\/([a-z0-9-]+)$/);
  if (!match) {
    fail(`plugin.json skills[${index}] is not ./skills/<bucket>/<name>: ${raw}`);
    continue;
  }
  const key = id(match[1], match[2]);
  if (pluginIds.has(key)) fail(`plugin.json lists ${raw} more than once`);
  pluginIds.add(key);
  if (NON_PROMOTED.includes(match[1])) {
    fail(`non-promoted skill in plugin.json: ${raw}`);
  }
}

const topReadme = read("README.md");
const topLinks = extractLinks(topReadme, TOP_SKILL_LINK);
const topIds = new Set();
for (const link of topLinks) {
  if (link.text !== link.name) {
    fail(
      `README.md link ${link.raw}: name and path differ (${link.text} vs ${link.bucket}/${link.name})`,
    );
  }
  if (NON_PROMOTED.includes(link.bucket) || nonPromotedNames.has(link.text)) {
    fail(
      `non-promoted skill in README.md: ${link.text} (skills/${link.bucket}/${link.name})`,
    );
    continue;
  }
  topIds.add(id(link.bucket, link.name));
}

reportDiff("plugin.json", pluginIds, promotedIds);
reportDiff("README.md", topIds, promotedIds);

// The README states the promoted count in prose, twice: the release summary and
// the mini-receipt example. A link check cannot see a number, so adding or
// retiring a skill updates the links and leaves "32 promoted" behind — which is
// exactly the figure a reader quotes back when the counts disagree.
const claimedCounts = [...topReadme.matchAll(/(\d+)\s*(?:个\s*)?promoted/g)].map((m) =>
  Number(m[1]),
);
if (claimedCounts.length === 0) {
  fail(
    `README.md states no promoted-skill count in prose (expected something like "${promotedIds.size} 个 promoted Skills")`,
  );
}
for (const claimed of new Set(claimedCounts)) {
  if (claimed !== promotedIds.size) {
    fail(
      `README.md claims ${claimed} promoted skills in prose, but the promoted set has ${promotedIds.size} — update the release summary and the mini-receipt example together with the skill list`,
    );
  }
}

for (const bucket of PROMOTED) {
  const readmePath = `skills/${bucket}/README.md`;
  const source = existsSync(join(repo, readmePath))
    ? read(readmePath)
    : (fail(`missing ${readmePath}`), "");
  const expected = new Set(
    [...promoted.values()]
      .filter((skill) => skill.bucket === bucket)
      .map((skill) => id(bucket, skill.name)),
  );

  const bucketLinks = extractLinks(source, BUCKET_SKILL_LINK);
  const bucketIds = new Set();
  for (const link of bucketLinks) {
    if (link.text !== link.name) {
      fail(
        `${readmePath} link ${link.raw}: name and path differ (${link.text} vs ${link.name})`,
      );
    }
    bucketIds.add(id(bucket, link.name));
  }
  reportDiff(readmePath, bucketIds, expected);

  const grouped = { user: new Set(), model: new Set() };
  let section = null;
  for (const line of source.split(/\r?\n/)) {
    if (/^##\s+User-invoked\s*$/.test(line)) {
      section = "user";
      continue;
    }
    if (/^##\s+Model-invoked\s*$/.test(line)) {
      section = "model";
      continue;
    }
    if (/^##\s+/.test(line)) {
      section = null;
      continue;
    }
    if (!section) continue;
    for (const link of extractLinks(line, BUCKET_SKILL_LINK)) {
      grouped[section].add(link.text);
    }
  }

  for (const name of grouped.user) {
    if (grouped.model.has(name)) {
      fail(
        `${readmePath}: ${name} listed under both ## User-invoked and ## Model-invoked`,
      );
    }
  }

  for (const skill of [...promoted.values()].filter((item) => item.bucket === bucket)) {
    const { disable, denyImplicit } = invocationOf(skill.bucket, skill.name);
    const userInvoked = disable && denyImplicit;
    const modelInvoked = !disable && !denyImplicit;
    if (!userInvoked && !modelInvoked) continue;
    const inUser = grouped.user.has(skill.name);
    const inModel = grouped.model.has(skill.name);
    if (userInvoked && !inUser) {
      fail(
        `${readmePath}: ${skill.name} is user-invoked but not listed under ## User-invoked`,
      );
    }
    if (modelInvoked && !inModel) {
      fail(
        `${readmePath}: ${skill.name} is model-invoked but not listed under ## Model-invoked`,
      );
    }
    if (inUser && !userInvoked) {
      fail(
        `${readmePath}: ${skill.name} listed under ## User-invoked but is model-invoked`,
      );
    }
    if (inModel && !modelInvoked) {
      fail(
        `${readmePath}: ${skill.name} listed under ## Model-invoked but is user-invoked`,
      );
    }
  }
}

const docsIds = new Set();
for (const bucket of PROMOTED) {
  const docsDir = join(repo, "docs", bucket);
  if (!existsSync(docsDir)) continue;
  for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    docsIds.add(id(bucket, entry.name.slice(0, -3)));
  }
}
reportDiff("docs/<bucket>/<name>.md", docsIds, promotedIds);

for (const { bucket, name } of [
  ...promoted.values(),
  ...nonPromoted,
]) {
  const skillId = id(bucket, name);
  const { disable, denyImplicit, description } = invocationOf(bucket, name);
  const skill = `skills/${bucket}/${name}`;
  if (disable && !denyImplicit) {
    fail(
      `${skill}: disable-model-invocation: true without policy.allow_implicit_invocation: false in agents/openai.yaml`,
    );
  }
  if (!disable && denyImplicit) {
    fail(
      `${skill}: policy.allow_implicit_invocation: false without disable-model-invocation: true`,
    );
  }
  // Only the promoted set has a slash-command list whose descriptions a human
  // reads; non-promoted buckets ship nothing, so they are not policed here.
  if (promotedIds.has(skillId) && disable && denyImplicit) {
    const trigger = MODEL_TRIGGER_RE.exec(description);
    if (trigger) {
      fail(
        `${skill}: user-invoked description contains model-trigger phrasing "${trigger[0]}" — a user-invoked skill's description is human-facing, so the trigger list is stripped (.agents/invocation.md)`,
      );
    }
  }
}

// Cross-folder skill references are not dependencies (.agents/invocation.md):
// skills reach each other as `/skill` prose invocations, because a relative
// path stops meaning the same thing the moment a manifest flattens the skills
// directory — which is exactly what the Codex payload does.
const skillNames = new Set([
  ...[...promoted.values()].map((skill) => skill.name),
  ...nonPromotedNames,
]);
for (const { bucket, name } of promoted.values()) {
  const source = read(join("skills", bucket, name, "SKILL.md"));
  for (const match of source.matchAll(/\.\.\/([a-z0-9-]+)\//g)) {
    if (skillNames.has(match[1])) {
      fail(
        `skills/${bucket}/${name}/SKILL.md links across skill folders (${match[0]}) — invoke the skill as \`/${match[1]}\` instead (.agents/invocation.md, "Dependencies between them")`,
      );
    }
  }
}

// AGENTS.md is what non-Claude harnesses read for standing instructions. A
// pointer with no resolvable target is worse than no file at all: it is read as
// an agent's whole rulebook while carrying nothing, and this repo shipped
// exactly that for a while (a nine-byte file whose content was the literal
// string "CLAUDE.md").
if (existsSync(join(repo, "AGENTS.md"))) {
  const agents = read("AGENTS.md");
  const targets = [...agents.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#"));
  if (targets.length === 0 || !targets.some((t) => existsSync(join(repo, t)))) {
    fail(
      `AGENTS.md carries no link that resolves inside the repo — an agent reading only AGENTS.md gets no standing instructions (point it at CLAUDE.md, or carry the content)`,
    );
  }
}

if (errors.length) {
  console.error(`skills lint failed (${errors.length}):`);
  for (const message of errors) console.error(`  ${message}`);
  process.exit(1);
}

console.log(
  `skills lint OK (${promoted.size} promoted, ${forkOwned.size} fork-authored)`,
);

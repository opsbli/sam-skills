## What it does

`project-standards` turns a repo's unspoken engineering conventions into one enforceable document, `docs/agents/project-standards.md`. It runs in three modes: **generate** (explore → draft → human confirms → write), **update** (targeted delta on an existing document), **audit** (check the code against the document and report compliance).

## When to reach for it

Run `/project-standards` once per repo, right after `/setup-matt-pocock-skills`. Reach for it again when: the user says agents keep violating team conventions (audit fields missing in DDL, CRUD not following the generator, no test verification floor); a new framework or generator arrives (update); or someone asks "are we actually following our own standards?" (audit).

| Situation | Mode |
|---|---|
| No `docs/agents/project-standards.md` exists; conventions live in people's heads | `generate` |
| Framework/tooling changed; one concern needs re-probing | `update` |
| "Are we following the standards?" / before a big refactor | `audit` |

## The governing rule

**Facts are found by exploration; standards are confirmed by humans.** Exploration sub-agents report what the code *does* (with file+excerpt evidence and frequency counts). Only a human confirms what the code *must* do. Nothing inferred becomes enforced without explicit confirmation; unconfirmed items sit in the document with a ⚠️ marker and are not enforced.

The generator keeps stack-specific *probe lists* in `STACK-PLAYBOOKS.md` (what to look for in a RuoYi/Spring backend, a Vue 3 frontend, or an unknown stack). Playbooks detect — they never prescribe the standard.

## What the document contains

- Header stating what enforces the file and that only humans may loosen rules.
- One section per concern: code skeleton & layering, DDL, migrations, generator use, testing & verification floor, config & secrets, docs & decisions.
- Each rule names its source (template/directory/counts) and the correction principle for old code — **touch-and-fix** (no force migration; any change to old code brings that file up to standard) unless the human chose full migration.
- A verification floor with the exact commands that must pass before delivery.
- A closing clause: periodic `audit`; either fix the code or have a human amend the file — silent drift is not allowed.

## How execution skills use it

`code-review`'s Standards axis treats the document as the repo's authoritative standard (⚠️ items skipped; repo rules override the smell baseline). `spec-executor` treats confirmed rules as implied acceptance criteria — DDL, migration, skeleton, and verification requirements apply to the execution as if written in the spec, and a spec contradicting the standards file is a routing problem to surface, not a silent choice.

## Boundaries

- Never implements features, never reformats wholesale, never edits the document without a confirmed item behind the edit.
- Exploration sub-agents are read-only; running a generator to inspect output requires asking first.
- Secrets found during exploration are reported by location only and routed to a security ticket — never copied into the document, never rotated by this skill.

## It's working if

- A repo with no written conventions gets a standards document whose confirmed rules all trace to code evidence and a human yes.
- Old-code conflicts are recorded as touch-and-fix rather than silently ignored or force-migrated.
- `code-review` and `spec-executor` cite rule numbers from the document instead of improvising.
- An `audit` reports per-rule 合规/不合规/无法判定 with file+line evidence, and systemic failures open a ticket instead of lingering.

## Where it fits

`project-standards` is the config-family sibling of `setup-matt-pocock-skills`: setup says *where work is tracked*, project-standards says *how code must be written*. Its document feeds the Standards axis of `code-review` and the acceptance floor of `spec-executor`; `improve-codebase-architecture` finds deeper structural opportunities on top of the documented baseline. Use [ask-matt](https://aihero.dev/skills-ask-matt) when choosing.

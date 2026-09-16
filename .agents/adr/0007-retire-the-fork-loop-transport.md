# Retire the fork-loop transport: ZCode returns to the manual runbook

**Status:** accepted, 2026-09-15 · supersedes [ADR 0005](0005-zcode-fork-loop-mcp-mailbox.md)

## Context

ADR 0005 added a second real adapter for the fork loop: `scripts/fork-loop-mcp/`, an MCP service that spawns a headless `zcode -p` runner on the same checkout and captures its `SPEC EXECUTION RECEIPT` into a per-checkout mailbox, plus a `Stop` hook that injects the receipt into the planning session between turns. It carries its own retirement clause in its final bullet — *"If ZCode grows native session primitives (spawn/message/push), this adapter retires in favor of them; the mailbox protocol is deliberately small enough to throw away."*

The adapter never shipped. It sat in `CHANGELOG.md`'s `Unreleased` section with pending changesets. And on the harness it exists for, its defining half does not work: ZCode 0.16.5 reads hooks only from a plugin's top-level `hooks/hooks.json` or a manifest `hooks` field, and this plugin ships neither — so the Stop hook is never registered, and the receipt sits in the mailbox instead of being pushed into the planning session. Verified by a day's log with zero hook-run records and a pending receipt waiting.

What still works is everything else: `spawn_execution`, `check_mailbox`, `check_status`, `ack_receipt`, `fail_receipt`, `cancel_execution`, `release_execution`, the lock, and `runs/<task-id>.log`. The route is **pull-only** on ZCode — an approved 2026-09-15 harvest rewrote the skill to poll rather than wait for a push that cannot arrive.

## Decision

Retire the fork-loop transport, and with it the observation layer built on its state directory. ZCode joins the manual runbook. Codex App remains the only automatic route; `contracts/transports.json` lists two transports, not three.

## Considered options

1. **Keep the route, pull-only.** This is what the 2026-09-15 harvest shipped, and it is honest. Rejected because the route's whole benefit is a receipt that arrives without the planner asking for it; on ZCode that benefit does not exist, so what remains is a manual poll wearing an automatic costume — carried by 236 KB, nine modules, four test suites and a documented coupling to a specific ZCode build.
2. **Demote ZCode only, keep the transport for other MCP harnesses.** Rejected: no other MCP harness is in use. An unused transport is a maintenance surface with no carrier.
3. **Fix the manifest instead** — ship `.zcode-plugin/plugin.json`, or add a top-level `hooks` field to the existing manifest, so ZCode reads the hook. Not rejected on merit; **untested**. Recorded here as the experiment that should reopen this decision: enable the plugin in the ZCode UI and check whether its skill count and MCP server list populate. If ZCode turns out to read hooks from a manifest this repo does not ship, git history makes the retirement reversible.
4. **Retire** (chosen).

## Consequences

- **Lost capability, named.** The machine lock is gone, so the single-active-execution-thread guard returns to being prose the agent must honour rather than a lockfile that refuses a second spawn. Programmatic spawn is gone. `runs/<task-id>.log`, the mailbox, and the whole observation layer — `runstate.mjs`, `status.mjs`, `dashboard.mjs`/`dashboard.html`, `settlement.mjs`, `telemetry.mjs` — are gone with it, so a run's progress is no longer inspectable from the planning thread.
- **Two adapters remain, and they are the two that were verified.** Codex App (ADR 0003) for the fully automatic loop; the manual runbook for ZCode, Claude Code, Cursor and plain terminals. The manual runbook is now a first-class route, not a fallback, and it is the only route whose receipt-return step is human.
- **The packaging defect that this made visible is closed by subtraction.** Every shipped manifest pointed `mcpServers` at `${*_PLUGIN_ROOT}/scripts/fork-loop-mcp/server.mjs`, while `build-codex-plugin.mjs` never packed `scripts/` — so the Codex payload advertised a server it could not start. Removing the block removes the false advertisement. The general rule it violated is worth keeping: *a manifest must not declare a capability the payload does not contain.*
- **ADR 0005 is superseded, not amended.** Its capability table listed "Pushed Reply → `Stop` hook" as an unconditional `Hook` kind. That single unverified cell is the claim that failed, and an ADR whose central table is wrong should be replaced rather than patched.
- **Restore path.** Git history, plus the working-tree snapshot taken before the deletion at `.zcode/backup-fork-loop-20260915-1914` (24 files: the full `scripts/fork-loop-mcp/` tree and every edited artifact).

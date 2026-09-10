# The ZCode fork loop is a second real adapter: an MCP mailbox plus a Stop hook

The fork loop (`SPEC READY` → execution → `RECEIPT v1` back) has two shapes today: the Codex App adapter (`execute-spec-in-fork`, ADR 0003) and the manual runbook for everything else. ZCode users live on the manual runbook, and its three human steps — open a session, paste the launch command, carry the receipt back — are the loop's least reliable links. This ADR records a **second real adapter** that closes the loop on ZCode without simulating Codex: a small MCP service (`fork-loop-mcp`) plus one `Stop` hook.

## What ZCode lacks and what fills it

| Codex App capability | ZCode replacement | Kind |
|---|---|---|
| `fork_thread` (programmatic child) | `spawn_execution`: MCP tool runs `zcode -p` headless in the same checkout | MCP |
| Messenger Ask (launch command) | the spawn prompt carries the `SPEC READY` contract | MCP |
| Pushed Reply | `Stop` hook polls the mailbox at turn end and injects `additionalContext` | Hook |
| `source_thread_id` correlation | mailbox records carry `session_id` (planner) and `task_id` (runner) | MCP |
| pin / archive / read_thread | mailbox states (`pending` / `delivered` / `done`) + on-disk lockfile | MCP |

Inheritance stays contract-level: the headless runner receives the `SPEC READY` block, not the grill history. That is the accepted degradation from ADR 0003's manual route and is guarded by `to-spec`'s self-containment rule.

## The mechanics

- **Spawn.** The planner calls `spawn_execution({spec_ready, topic})`. The service takes a machine lockfile on the checkout (single active execution thread — the same guard the six-gate archive checks, now mechanical), then launches `zcode -p "<prompt>" --cwd <checkout> --json` detached. The prompt embeds the full `SPEC READY` block, declares itself the launch command, and instructs the runner to end with one `SPEC EXECUTION RECEIPT`. The service captures the child's stdout, extracts the receipt, and stores it in the mailbox as `pending`.
- **Push.** The planner's workspace config registers a `Stop` hook (a `process` hook, no shell, cross-platform). At every turn end it asks the mailbox `check_mailbox(session_id)`. Empty → emit nothing (exit 0, silent). A `pending` receipt → emit `{"hookEventName":"Stop","additionalContext":"<receipt>","continue":true}` so the planner wakes and processes it, then the mailbox marks it `delivered`. The Stop-continuation budget is three; one receipt consumes exactly one.
- **Settle.** The planner validates the receipt against the six gates, settles a non-`none` `Docs delta` through `/domain-modeling`, then calls `ack_receipt(task_id)` → `done`. The lockfile releases only on `done` (or an explicit `release_execution`), so a crashed runner cannot silently unguard the checkout.

The runner session needs no MCP client: the transport captures its stdout after exit.

## Hard facts this design rests on (verified against ZCode 0.16.5)

- The CLI supports `-p/--prompt`, `--cwd`, `--json`, `--max-turns`, `--allowed-tools`; it lives at `resources/glm/zcode.cjs` inside the desktop install.
- Headless mode refuses to start without an explicit model provider in `~/.zcode/cli/config.json` (`model.main = {provider, model, kind, baseURL, apiKey?}`); `--settings` appears in help text but is not wired in the root parser (advertising/implementation mismatch — do not use it). One-time bootstrap: `zcode login` writes the shared OAuth credential store at `~/.zcode/v2/credentials.json` (AES-256-GCM, machine-derived key); provider configs without an inline apiKey authenticate against it.
- Hooks: exactly seven events; `Stop` fires with the response preview as match value and supports `{hookEventName:"Stop", additionalContext, continue:true}` continuation, budgeted at three per stop. Configuration-file hooks require `hooks.enabled: true`; `process` hooks take `command`/`args`/`timeoutMs` with no shell.

## Consequences

- ZCode joins Codex App as a first-class automatic route: planner manual steps drop to one (`/to-spec`, then `spawn_execution`), the session stays usable during execution, and the receipt returns unedited.
- The v2 receipt contract applies unchanged: the mailbox stores whatever the runner produced, the injected `[fork-loop]` block still faces the six gates (including the `Schema: spec-executor-receipt/v2` first field and the mandatory `Receipt metrics` line), and the planning thread harvests `docs/metrics.md` / `skill-friction-log.md` exactly as on the other routes before calling `ack_receipt`.
- New maintenance surface: an MCP service, a hook script, and the ZCode-version coupling documented above. ZCode version bumps re-run the verification; the capability table lives in the MCP service, mirroring ADR 0003's rule that harness-specific names live in exactly one place.
- The express lane, six gates, `Schema: spec-executor-receipt/v1`, and single-active-thread guard are unchanged — this adapter changes transport only.
- If ZCode grows native session primitives (spawn/message/push), this adapter retires in favor of them; the mailbox protocol is deliberately small enough to throw away.

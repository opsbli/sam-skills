---
"execute-spec-in-fork": patch
---

Make a running execution observable, and give it a stop button.

`spawn_execution` returns as soon as the runner starts — it has to, or the
planning turn would be held for the run's whole duration. The cost was a window
with no receipt and no evidence: a runner making steady progress and a runner
that died on launch looked identical for up to 90 minutes, which is exactly how
a live run gets mistaken for a stuck one.

- New `runstate.mjs` read model, shared by three surfaces so they cannot
  disagree: the `check_status` MCP tool, `status.mjs` (terminal, `--watch`,
  `--scan`, `--require-idle`), and `dashboard.mjs` + `dashboard.html` (live web
  board on 127.0.0.1, plus `--snapshot` for a publishable static page).
- The report carries a **task list**, not just the newest run: every task is
  joined across the lock, the run journal and the mailbox by `task_id`, with its
  phase, duration, last signal, receipt state and exit code — so an in-flight
  run appears before any receipt exists, and a cancelled or receipt-less run
  stays visible instead of vanishing. A task's phase and the checkout's headline
  phase come from the same signals, so they cannot contradict each other.
- A **pipeline** section covers work that has not started: the local tracker's
  specs, tickets and planning documents under `.scratch/<feature>/`, staged from
  the artefacts themselves (is there a spec, are there tickets, does the file
  carry a `SPEC READY` block) and joined to the executions that name them via
  the `Source` / `Spec source` path. The join key is recorded in the run journal
  at spawn and recovered from the launch prompt for runs started before that
  existed.
- A **settlement** reader: the receipt is parsed against the contract's field
  list (`contracts/receipt-v2.json` gained `requiredFields`), reporting the
  conclusion token, evidenced criteria, the Docs delta the planning thread owes,
  the recorded archive-gate outcome, and every structural problem it can see.
  The live per-gate verdict comes from the real validator, spawned on demand
  with `--checkout` so Gate 6 compares the worktree the run happened in, and
  memoised per task because a written receipt never changes.
- A **telemetry** reader: `docs/metrics.md` and `docs/skill-friction-log.md`
  aggregated into gate failures, quality-label distribution, evidenced criteria,
  ISO-week spread, per-skill friction, and the `>=2` repeat-friction signal
  `/project-standards audit` and `/harvest run` act on. Absence is reported as
  absence. The friction parser skips fenced code and requires a dated heading,
  so the ledger's own documented template is not counted as entries.
- Durations always carry seconds, and running rows tick locally every second.
  At minute granularity a duration holds still for sixty seconds at a time,
  which is indistinguishable from a board that stopped updating.
- Stall detection uses the log mtime and file activity as the heartbeat — never
  the lock's creation time, which marked every long run as stalled — and the
  window is twenty minutes rather than ten, because one agent turn routinely
  goes longer than that without touching disk. The measured `last_signal_at` is
  shown beside the verdict so it never has to be taken on trust.
- The lock now records the runner's pid beside the supervisor's, and the run
  journal (`state.json`) plus a per-run log (`runs/<task-id>.log`) are written
  from the first second. The log is what lets a receipt survive the MCP server
  being restarted mid-run, and what makes a stall visible as a stall.
- Liveness is reported, never guessed: an unrecorded pid reads `unknown`.
- New `cancel_execution` kills the runner tree, releases the lock, and records
  why. `release_execution` now refuses to drop a lock whose execution is still
  alive, because that does not stop the run — it only admits a second execution
  onto the same checkout.
- The Stop hook honours `FORK_LOOP_STATE_DIR` (the server already did) and
  requires an exact session match: an unidentified hook delivers only a receipt
  with no recorded planner session, never someone else's, because the runner
  session carries the same hook.
- `execute-spec-in-fork` documents the watch-and-cancel path for the ZCode route.

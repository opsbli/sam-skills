---
"sam-skills": patch
---

Harden the fork-loop transport, the archive gate, and the fork-maintenance path.

- `fork-loop-mcp` no longer routes the runner through a shell. `checkout` and the
  prompt-file path reach argv verbatim, so `shell: true` on win32 handed them to
  `cmd.exe` and a legal directory name containing `&` or `%` was parsed as syntax.
  The checkout is now canonicalised with `realpathSync` and rejected unless it is
  a directory. (Verified: a bare `node` still resolves without a shell; `&`, spaces
  and `%` stay literal; the same payload under `shell: true` executed `&& echo`.)
- The single-active-execution lock holds. Release is scoped to the task that owns
  it, so a late `ack_receipt`/`fail_receipt` for an already-settled task can no
  longer drop the lock of the execution running right now; a lock directory with
  no recorded holder is refused instead of being read as infinitely old and
  stolen; and an orphan lock past its own grace is still reclaimable.
  `release_execution` now requires a matching `task_id` or an explicit `force`.
- An overrunning runner settles. The timeout escalates to a tree kill
  (`taskkill /T /F` on win32) and, after a grace, settles unconditionally: a
  runner that never closes its stream used to leave `spawn_execution` — and the
  checkout lock — hanging indefinitely.
- `spawn_execution` no longer waits for the run. It returns as soon as the runner
  has started (`status: "running"` plus the `task_id`), and the mailbox entry is
  appended when the runner exits. The blocking version contradicted the route it
  implements — the planning session is supposed to stay usable during a run, which
  is what the Stop hook delivering the receipt *between turns* is for — and the
  skill's own step 1 said the exit code comes back in the tool result while step 2
  said not to block. Callers must read the receipt from the mailbox, not the result.
  `check_mailbox` also filters entries by checkout, so a shared state directory
  cannot hand one checkout another's receipt.
- `stop-hook.cjs` gains its first tests, and stops crashing. A mailbox without a
  `receipts` array threw a TypeError and exited non-zero, blocking the very Stop
  event the hook exists to serve. Its write now goes through a temp file and a
  rename, matching `writeJson` on the MCP side — both processes read-modify-write
  the same mailbox, and a torn write loses whichever update landed first.
- Runner output is captured as a bounded tail (2 MB, `FORK_LOOP_MAX_CAPTURE_CHARS`)
  instead of growing with whatever the runner prints, and the entry records
  `runner_output_chars` / `output_truncated`. Only the last 2000 characters were
  ever stored, so holding the entire stream in memory was how a runaway runner
  could exhaust the process that also hosts the planning session. The session id
  is picked out of each chunk on the way past, because it is announced before the
  tail is reached.
- `extractReceipt` takes the last receipt block. The launch prompt embeds a
  receipt template under the same heading, so a runner that echoed its prompt had
  the template stored as its result.
- `spawn_execution` no longer advertises `max_turns`. The runner's strict parser
  aborts on `--max-turns`, so the cap could never be honoured.
- `receipt-gate` gates as intended. Pass/fail markers are word-bounded
  (`bypass`/`failure`/`passenger` no longer read as verdicts), fields are anchored
  to the contract's field list (a criteria entry shaped like `- AC1: …` no longer
  truncates the Acceptance criteria block), and Gate 6 compares against
  `--checkout` instead of the validator's own repository.
- `sync-upstream.sh` guards what it claims to. The old check asked whether the
  merge base descends from `upstream/main` — true by construction, so it could
  never fire. It now refuses unrelated histories and warns when the baseline
  recorded in `README.md` stops being an ancestor (the signature of an upstream
  rewrite), and a `trap` aborts and restores the checkout on a rebase conflict
  instead of leaving it mid-rebase with no message.
- Version identity is checked where it is written: `sync-plugin-version.mjs` now
  covers the README fork badge as well as the plugin manifests, and `npm run
  version` regenerates the Codex payload so a version PR cannot ship a drifted
  mirror.
- New guards in `verify:all`: `agents-md-gate.mjs` (AGENTS.md must be a real
  pointer, not a symlink materialised into nine bytes) and `transport-gate.mjs`
  (the transport registry in `contracts/transports.json` and the detection list
  in `execute-spec-in-fork` must agree). `verify.mjs` also refuses a `*.test.mjs`
  that asserts nothing, which is how the fork-loop mailbox suite stayed green
  while it tested nothing at all.

---
"sam-skills": patch
---

Cover the main flow's unmeasured nodes, and stop the harvest gate pretending.

Two of this pipeline's numbers were quietly false, and both were false in the
same direction — everything looked exercised.

- **Four golden tasks added** for the main-flow nodes that had never been run:
  `grilling`, `to-spec`, `execute-spec-in-fork`, and `domain-modeling`. Before
  this the eval set covered 4 of 33 promoted skills, and the scoreboard could
  honestly claim nothing about the pipeline's entrance, about the `SPEC READY`
  block every later stage reads, about the transport boundary ADR 0007 rewrote,
  or about the skill every `Docs delta` settles into. Each new task measures a
  contract rather than general competence — the `to-spec` one grades whether the
  block is an *index* rather than a pasted copy, and the `domain-modeling` one
  grades ADR *restraint*, which is the half of that skill agents reliably get
  wrong. `execute-spec-in-fork`'s task is the one to run first: it is the task
  whose subject was just deleted and rebuilt.
- **`harvest` no longer reads thin ledgers as a full population.** Its triage
  rule has always been "same friction on 2+ receipts", which at one receipt can
  never fire — yet its docs presented the ledgers as the primary input, so the
  gate read as though it were weighing evidence it structurally could not have.
  It now checks the row count before trusting them, names the eval scoreboard as
  the actual primary input while the sample is small, and says so in its summary
  instead of upgrading one incident to a pattern. The check is written to be
  re-run rather than assumed permanent: the day `metrics.md` carries a real
  population, the ledgers go back to being the strongest evidence available.
- **Sync drift is measured where it belongs.** `README.md` states the sync
  baseline correctly (`6654f6b`) but cannot express how far upstream has moved
  since; the 2026-09-16 drill row in `docs/sync-drill-log.md` records it — 5
  unabsorbed commits, 2 conflicted files, both of them structural (`CLAUDE.md`
  conflicts every time because it is this fork's identity document; upstream's
  `skills/in-progress/retro` needs a keep-or-drop decision, not a merge
  default). A hand-written sentence in the README would go stale at the next
  sync; the ledger accumulates.
- **The manual runbook now names its validator.** ADR 0007's retirement of the
  fork-loop transport was right, but it took the mechanical guarantees with it —
  no lock, no spawn record, no liveness probe. The one remaining defence is the
  receipt check, so it is now written into the runbook as a fixed step rather
  than something the planning thread has to remember exists.

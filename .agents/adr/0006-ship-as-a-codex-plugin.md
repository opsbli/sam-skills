# Ship the Codex plugin as a generated flat mirror

## Context

ADR-era decision D73 (recorded 2026-08-10) deferred a native Codex plugin: the Codex plugin manifest accepts a single path, symlinks do not survive the marketplace flow, and the skills.sh editable-copy track was the fallback. Since then the fork grew a native plugin anyway — `.codex-plugin/plugin.json` plus hooks and a full copy of the promoted skills — and `install-block.md` advertises the `codex plugin marketplace add` route. The deferral record and the shipped reality drifted apart, and install-block.md cited a non-existent ADR file (`0005-ship-as-a-codex-plugin.md`; the real ADR 0005 is the ZCode fork-loop-mcp mailbox). X2 in the delivery material digest; N3 in the MVP plan.

## Decision

1. **The native Codex plugin track is first-class.** `.codex-plugin/` ships as part of the fork: `plugin.json`, `hooks/hooks.json`, and a generated flat copy of the promoted skills (each skill dir copied in full, including support files and `agents/openai.yaml`).
2. **The flat copy is generated, never hand-edited.** `scripts/build-codex-plugin.mjs` is the only writer of `.codex-plugin/skills/**`; edits go to the source `skills/**` and are re-generated. The mirror is committed (not gitignored) so the marketplace flow sees real files — this is the deliberate trade against symlinks, which do not survive.
3. **Install docs cite this ADR.** `install-block.md`'s Codex section references ADR 0006.

## Consequences

- Codex users install via marketplace; skills.sh users keep the editable-copy track; the two tracks stay mutually exclusive per install-block.md.
- Regenerating the mirror is a required step after any promoted-skill change; a stale mirror is a review defect, not a judgment call.
- The deferral recorded in D73 is superseded, not reversed in spirit: single-path manifests and non-surviving symlinks remain the constraints that shaped the generated-flat-copy choice.

## Surviving dissent

None recorded. The earlier deferral's constraints are honored by design (2).

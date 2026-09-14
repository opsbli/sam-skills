# Agent instructions

The canonical standing instructions for this repository live in
[CLAUDE.md](./CLAUDE.md). Read that file before changing a skill, a manifest, a
docs page, or any fork tooling.

It is the one place that holds the bucket rules (`engineering/` and
`productivity/` are the promoted set; `misc/`, `in-progress/`, and
`deprecated/` ship nothing), the invariants every promoted skill must satisfy
(a top-level `README.md` link, an entry in `.claude-plugin/plugin.json`, a
`docs/<bucket>/<name>.md` page, and a matching user-invoked / model-invoked
pair across `SKILL.md` and `agents/openai.yaml`), the rule that a rejected
direction is archived under `.out-of-scope/` rather than merely decided, and
the fork-maintenance entry point.

`npm run verify` is the mechanical form of those rules — it is the fastest way
to check a change against them.

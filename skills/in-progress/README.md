# In Progress

Beta. These skills are public on purpose — try them and tell me what breaks. They're excluded from the plugin and the top-level README until they graduate to a stable bucket, they get no docs pages, and they can change or disappear without warning.

The plugin won't give you these. Install one directly:

```bash
npx skills@latest add mattpocock/skills --skill=<name>
```

## In-progress is a waiting room, not a car park

Six skills have been sitting here since May. A beta nobody is exercising is not gathering feedback, it is gathering dust — and worse, a full waiting room hides the skills that genuinely want your judgement right now from the ones that stopped moving months ago.

So every entry carries a review date. On that date each one gets exactly one of two calls: **graduate** it (complete the checklist below) or **move it to `deprecated/`**. Defaulting to "leave it another month" is how this bucket got here; it is not an answer now.

**Review date: 2026-10-16.**

| Skill | Added | Last content change | Status | Decision (pending) |
|---|---|---|---|---|
| [writing-beats](./writing-beats/SKILL.md) | 2026-05-06 | 2026-09-04 (repo-wide lint pass, not this skill) | stalled 133 days | — |
| [writing-fragments](./writing-fragments/SKILL.md) | 2026-05-06 | 2026-09-04 (repo-wide lint pass) | stalled 133 days | — |
| [writing-shape](./writing-shape/SKILL.md) | 2026-05-06 | 2026-09-04 (repo-wide lint pass) | stalled 133 days | — |
| [loop-me](./loop-me/SKILL.md) | 2026-06-24 | 2026-09-04 (repo-wide lint pass) | stalled 84 days | — |
| [claude-handoff](./claude-handoff/SKILL.md) | 2026-07-02 | 2026-09-04 (repo-wide lint pass) | stalled 76 days | — |
| [setup-ts-deep-modules](./setup-ts-deep-modules/SKILL.md) | 2026-07-10 | 2026-09-04 (repo-wide lint pass) | stalled 68 days | — |

Recorded on 2026-09-16 during the skill-flow audit. Note that the "last content change" column is deliberately annotated: all six carry the same September date, from one repo-wide lint formatting pass. None of them has had its *content* touched since July at the latest, which is what actually matters and what a raw `git log` date would have obscured.

The three writing skills rise and fall together — they are one workflow (mine fragments, lay out beats, shape the article). Decide them as a set, not one at a time.

## Graduating: the full checklist

A skill leaves this bucket only when every line here is done. Partial graduation is how a half-wired skill ends up shipping in the plugin.

- [ ] top-level `README.md` entry, in the right stage row and the right invocation group
- [ ] entry in `.claude-plugin/plugin.json`'s `skills` array
- [ ] moved into `engineering/` or `productivity/`, with its entry added to that bucket's `README.md`
- [ ] docs page at `docs/<bucket>/<name>.md`, following `.agents/writing-docs.md`
- [ ] `agents/openai.yaml` paired with the invocation mode — `disable-model-invocation: true` in the front matter and `policy.allow_implicit_invocation: false` in the YAML, or neither
- [ ] `ask-matt` router updated so the map mentions it
- [ ] `npm run verify` green, including the Codex payload mirror regenerated

## Members

- **[loop-me](./loop-me/SKILL.md)** — Grill yourself into implementable workflow specs over multiple sessions, using the current directory as a stateful workspace. User-invoked.
- **[writing-beats](./writing-beats/SKILL.md)** — Shape an article as a journey of beats, choose-your-own-adventure style. Pick a starting beat, write only that beat, then pivot to the next, until the article reaches a natural end.
- **[writing-fragments](./writing-fragments/SKILL.md)** — Grilling session that mines you for fragments — heterogeneous nuggets of writing — and appends them to a single document as raw material for a future article.
- **[writing-shape](./writing-shape/SKILL.md)** — Take a markdown file of raw material and shape it into an article paragraph by paragraph, arguing format choices at each step.
- **[claude-handoff](./claude-handoff/SKILL.md)** — Hand the current conversation off to a fresh background agent that picks up the work immediately, seeded with a handoff summary via `claude --bg`. User-invoked.
- **[setup-ts-deep-modules](./setup-ts-deep-modules/SKILL.md)** — Wire dependency-cruiser into a TypeScript repo so each package is a deep module — implementation hidden in subfolders, reachable only through its entry-point files, tests exercising it through those. User-invoked.

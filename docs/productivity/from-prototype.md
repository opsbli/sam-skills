## What it does

`from-prototype` turns a product prototype — a link or UI screenshots — into a structured **plan draft** that [grill-me](https://github.com/opsbli/sam-skills/blob/main/skills/productivity/grill-me/SKILL.md) can interrogate. It is the intake step that runs before any interview: product hands over artifacts, the skill hands back a draft with pages, fields, flows, business rules, and a short list of top-level decision branches.

The defining constraint: it **extracts requirements, never pixels, and never interviews**. Every fact it cannot observe directly in the source gets tagged `[待确认]` instead of being guessed into shape, and the interview itself is deliberately left to grill-me — this skill stops at handing over the draft.

## When to reach for it

You invoke this by typing `/from-prototype` — the agent won't reach for it on its own.

| Your situation | What to do |
|---|---|
| Product sent a prototype link (Axure, Figma, 墨刀, 即时设计, or any page) and you want requirements out of it | `/from-prototype`, then grill the draft |
| Product sent UI screenshots / design images | Same — images are the source of truth for what the UI shows |
| You already have a written plan or draft | Skip intake, go straight to [grill-me](https://github.com/opsbli/sam-skills/blob/main/skills/productivity/grill-me/SKILL.md) |
| You want the page rebuilt as running code | Not this skill — that is implementation, and `from-prototype` never writes code |
| You want throwaway code to answer a design question | Use [prototype](https://github.com/opsbli/sam-skills/blob/main/skills/engineering/prototype/SKILL.md) instead |

## The draft it produces

One Markdown file, `drafts/<topic>-plan-draft.md`, in a fixed shape: background and goal, scope, a four-part entry per page (description / inputs / outputs / validation), cross-page business rules, the consolidated `[待确认]` list, and 3–6 top-level decision branches. It ends with a `DRAFT READY` block that names the draft, the coverage, the open questions, and the next route — which is what grill-me opens with.

The draft is the only artifact. No scaffolding, no UI code, no pixel notes beyond what carries requirement meaning.

## Common questions

**The source isn't even a prototype — it's a manual or a guide site. Does intake still work?**
Yes, with a caveat you can see in the output. On a real run against a system's operations-guide site, the module map and flows came through fine, but form-level field lists simply aren't observable in prose documentation — so the draft carried an honest block of `[待确认]` entries instead of invented fields. The tag is the mechanism that keeps a thin source from becoming a confident lie.

**Will it also build the pages it extracted?**
No. Cloning a page into code is a different job with a different skill's name on it. This one exists so that grill-me starts from evidence rather than from memory.

## It's working if

- Every page reachable in the source shows up in the draft — or is listed as not covered, with a reason.
- Directly observed facts carry no tag; every inference carries `[待确认]`. A draft with zero tags on a thin source is a red flag, not a good job.
- The decision-branch list at the end is what grill-me actually opens the interview with — no "it depends" left floating outside it.

## Where it fits

A **chain step**, the intake before the interview: `from-prototype → grill-me → to-spec`. Its closest neighbour is [grill-me](https://github.com/opsbli/sam-skills/blob/main/skills/productivity/grill-me/SKILL.md), because the draft's decision branches are written to be grill-me's opening questions; its opposite is [prototype](https://github.com/opsbli/sam-skills/blob/main/skills/engineering/prototype/SKILL.md), which builds throwaway code to answer a question rather than reading someone else's artifact. The full map lives at [ask-matt](https://github.com/opsbli/sam-skills/blob/main/skills/engineering/ask-matt/SKILL.md).

# grilling: consent before understanding

- **Skill under test:** `grilling` (reached via `/grill-me` or `/grill-with-docs`)
- **Contract being measured:** the interview surfaces the decisions only the human can make, instead of quietly making them. This was added because the main flow's first node had no golden task at all — the pipeline's entrance was unmeasured. A competent agent guessing well is the failure being hunted: every assumption it adopts silently becomes a product decision that the later `SPEC READY` inherits as though settled, which no downstream gate can distinguish from a decision the human made.

## Setup

Any repository with a README. No fixtures to build, no branch to create.

## Prompt

Into a fresh session, with no skill named:

> 给团队的周报脚本加个缓存，别每次都重跑。

Run one opening round only. Give no further instructions and answer nothing it asks.

## Rubric

1. The reply is questions, not a plan — no implementation, no file layout, no offered design, including nothing offered "as a starting point to react to".
2. At least one fact-shaped ambiguity the prompt did not mention is surfaced as an explicit choice: cache key, invalidation, cold-read behaviour, or whether a stale report is worse than a slow one. "Tell me more about your requirements" does not count — the agent must supply the concrete alternatives.
3. No decision is taken on the human's behalf. Defaults may be proposed, never adopted: "I'll use `<value>` unless you say otherwise" fails this item.
4. The round is bounded — a countable set of questions — and signals that answering them is what moves things forward, rather than each question opening three more.

## Pass condition

All four rubric items check.

## Deviation markers

- A plausible design in the first reply, offered "just to give us something to react to".
- A default adopted rather than proposed, especially a TTL or an invalidation policy nobody chose.
- Questions that are really requests for the whole requirements document — unbounded elicitation.
- Agreement-seeking instead of decision-seeking: asking "does that sound good?" about a decision it already made.

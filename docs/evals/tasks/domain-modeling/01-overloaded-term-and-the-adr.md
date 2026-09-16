# domain-modeling: the overloaded term, and the ADR not written

- **Skill under test:** `domain-modeling`
- **Contract being measured:** sharpen overloaded terms into one canonical meaning before recording them; keep `CONTEXT.md` free of implementation detail; and offer an ADR only when all three gates hold (hard to reverse, surprising without context, the result of a real trade-off). Added because this skill is the settlement end of every `Docs delta` — the place the pipeline sends facts discovered during execution — and it had no golden task. The discriminating contract is restraint: agents reliably offer ADRs for decisions that are cheap to reverse, which buries the three that mattered under a pile of the ones that never did.

## Setup

Run in a repository where a source file records the current behaviour, so the contradiction in the prompt can actually be checked against code. In this repo that means any file under `src/` or similar; if none exists, create a throwaway module before starting:

```text
src/billing/subscription.ts   →   exports cancelSubscription(id) which cancels the whole Subscription
```

Then give this prompt, naming no skill:

> 我们准备让用户可以取消会员。cancelSubscription 现在整个订阅都取消掉，但我们想要支持只取消自动续费、保留当前已付费周期。另外 billing 里到处都在传 "account"，我怀疑它指的是两个不同的东西。帮我把这块的语言理一理。

Answer its questions as though you were the domain owner, but do not volunteer the answers to the rubric items — particularly, do not say whether an ADR is wanted.

## Rubric

1. The overloaded term is named and split into concrete candidates before anything is written down — e.g. distinguishing the payer identity from the entitled membership, offered as a choice to the human rather than decided for them.
2. Once resolved, `CONTEXT.md` is updated inline during the conversation, not batched to the end and not deferred to a later session.
3. The `CONTEXT.md` entries carry no implementation detail — no class names, no table names, no file paths, no `cancelSubscription`. Entries define meaning and relationships only.
4. No ADR is offered for the partial-cancellation change *unless* the reply explicitly shows all three gates holding; and no ADR is offered at all simply because architecture was discussed. An offered ADR that does not state why it is hard to reverse fails this item.
5. Where the human said the code "cancels the whole subscription" and the code agrees, the contradiction is surfaced against the actual source rather than accepted from the conversation — and where the code disagrees with what was said, that too is named.

## Pass condition

All five rubric items check. Item 4 is the one most often failed; treat a failure there as the interesting result even when the rest pass.

## Deviation markers

- An ADR produced for every decision discussed — the restraint failure this task exists to catch.
- An ADR lacking a consequences section, or one whose "decision" restates what was already settled in conversation with no trade-off recorded.
- The overloaded term silently given one canonical meaning rather than put to the human.
- `CONTEXT.md` accumulating type signatures, column names, or module paths.
- Terms resolved on paper while the code keeps using the old vocabulary, with no mention of the rename.

# code-review: spec axis faithfulness

- **Skill under test:** `code-review`
- **Contract being measured:** the Spec axis — does the diff faithfully implement the originating spec, no more and no less?

## Setup

A branch whose diff implements an approved spec (issue or local spec file) but also contains one opportunistic change the spec never asked for — a small refactor or extra guard clause outside the spec's scope.

## Prompt

> Review the diff on this branch since <fixed-point> against the spec at <spec-path>.

## Rubric

1. The review maps every spec acceptance criterion to the diff evidence that satisfies it — or flags the one that does not.
2. The opportunistic change is flagged as out-of-scope (present but not asked for), not silently absorbed into "looks fine".
3. Missing work the spec asked for is named, not smoothed over.
4. Findings separate into the two axes — Spec faithfulness vs Standards compliance — and do not blur.

## Pass condition

All four rubric items check.

## Deviation markers

- The opportunistic change passing review unnoticed — the exact failure the Spec axis exists to catch.
- A spec criterion marked "met" with no evidence in the diff.

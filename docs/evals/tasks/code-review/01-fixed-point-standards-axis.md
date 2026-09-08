# code-review: fixed-point standards axis

- **Skill under test:** `code-review`
- **Contract being measured:** the Standards axis — review the diff against the repo's documented standards at a recorded fixed point, with evidence per finding.

## Setup

A repo with `docs/agents/project-standards.md` containing 2–3 concrete, checkable rules (e.g. one on DDL/migration discipline, one on the verification floor). The branch under review has a diff since a recorded fixed point that violates one rule clearly and follows the others.

## Prompt

> Review the diff on this branch since <fixed-point>. Focus on standards compliance.

## Rubric

1. The review identifies the violating rule by name, with file + line evidence.
2. Findings for the non-violating rules are either absent or explicitly marked compliant (not silent omissions presented as checks performed).
3. The review does not grade code style outside the standards document's scope unless flagged as such.
4. The review output separates Standards-axis findings from Spec-axis scope explicitly (the two-axis structure).

## Pass condition

All four rubric items check.

## Deviation markers

- Findings without file+line evidence — opinions, not review.
- A standards violation missed because the reviewer only skimmed the diff, not the standards document.

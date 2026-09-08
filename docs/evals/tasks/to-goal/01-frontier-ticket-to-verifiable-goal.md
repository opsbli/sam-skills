# to-goal: frontier ticket to verifiable goal

- **Skill under test:** `to-goal`
- **Contract being measured:** the compiled-handoff discipline — the skill reads existing planning evidence, never re-interviews, never mutates the tracker, and outputs exactly the readiness checklist, the filled goal template, and the session recommendation.

## Setup

Prepare a local tracker state: `.scratch/<feature>/spec.md` with a small, approved feature (one clear outcome, 2–3 acceptance criteria, one test seam), plus `.scratch/<feature>/issues/01-<slug>.md` as the single unblocked frontier ticket carrying those criteria, and `.scratch/<feature>/issues/02-<second-slug>.md` as an explicitly blocked second ticket. Worktree: clean, on the feature branch.

## Prompt

> Read the spec and issues under `.scratch/<feature>/` and compile the ready work into an execution goal I can paste into a fresh agent session. Do not implement anything.

## Rubric

1. Output contains a filled goal template matching the repo's `to-goal` shape (Goal, Current state, Execution order, Completion criteria, Constraints, Context).
2. Every acceptance criterion from the frontier ticket appears as a Completion criteria checkbox, none from the blocked second ticket.
3. The readiness checklist is present and ticked before the paste block.
4. No tracker file was modified, no branch created, no code edited (`git status` clean afterwards).
5. The session recommendation names one capability tier and one reasoning intensity, each with a one-sentence evidence-based reason.

## Pass condition

All five rubric items check.

## Deviation markers

- Any interview question to the user about content already in the spec or ticket — the core violation.
- A second goal that merges the blocked ticket's criteria — the scope violation.
- Writing any file other than none — the read-only violation.

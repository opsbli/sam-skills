# Skill friction log

Append-only ledger of `skill-friction` values harvested from v2 `SPEC EXECUTION RECEIPT` metrics lines. The planning thread appends one entry per receipt whose `skill-friction` is not `none`, before archiving the execution fork. The executor writes `skill-friction: none` explicitly when nothing snagged, so an empty log means smooth runs, not missing data.

## Entry format

```text
## YYYY-MM-DD · <skill-name>
- Friction: <one line from the receipt: which step stalled / which rule was ambiguous / which gate bounced>
- Source: <receipt reference: spec issue, session id, or commit>
```

## Review cadence

`/project-standards audit` reads this log. Friction that repeats across receipts becomes a revision issue against the named skill's `SKILL.md` (or the standards document); single occurrences stay recorded but force no edit. When the friction names a skill owned by this skills repo rather than the project under audit, route the issue upstream to the skills repo.

## Entries

_No friction recorded yet._

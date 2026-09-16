# to-spec: the ready block is an index, not a copy

- **Skill under test:** `to-spec`
- **Contract being measured:** `SPEC READY` is an index to the approved spec, not a copy of it, and it carries the five fields the executor needs (`Source`, `Baseline`, `Test seam`, `Non-goals`, `External authority`) with real values rather than placeholders. This node publishes "the key that starts everything downstream" and had no golden task. Malformed output does not fail at once — it fails later, where the executor cannot tell whether the spec never said something or it simply missed it. Agents reliably err in the generous direction, pasting the whole discussion into the block "to be safe", producing something long, unmaintainable, and quietly authoritative.

## Setup

Run in any checkout where `git rev-parse HEAD` resolves. Supply this as though it were the settled output of a prior interview:

```text
我们刚聊完，结论如下：周报脚本加 --since <YYYY-MM-DD>，ISO 日期，
非法输入非零退出并打印用法到 stderr；不改输出格式；不引入新依赖；
不做 --until。提成 (-20%) 和满勤 (+) 的计算口径保持现状，不要动。
测试用 scripts/weekly-report.sh 的 CLI 行为测试（bats）。
只授权本地改和本地验证，不许 commit，更不许 push。
```

Then ask for publication without naming the skill:

> 把这些结论封版，发出去给开发用。

## Rubric

1. The output contains a block whose first line is exactly `SPEC READY` — not `## SPEC READY`, not a variant; the executor greps the bare line.
2. `Source`, `Baseline`, `Test seam`, `Non-goals`, and `External authority` are all present. A missing `External authority` is the dangerous one: absent it, the default is to assume more permission than granted.
3. `Baseline` names a real revision, not `main` or `<placeholder>` — later `/code-review` diffs against it and has nothing to compare against otherwise.
4. The block is an index: each field points somewhere addressable rather than restating the discussion. Removing the surrounding conversation still leaves the block answerable.
5. The two things nobody discussed — whether a future date is accepted, and behaviour on a date with no commits — are surfaced for resolution rather than silently defaulted. Recording them under `Non-goals` or escalating both satisfies this item; quiet omission does not.

## Pass condition

All five rubric items check.

## Deviation markers

- `External authority` omitted, or written as a permission list rather than a boundary on this execution.
- `Baseline` left as a placeholder, or a branch name standing in for a revision.
- Prose restated from the conversation inside the block — the copy failure.
- Content `Non-goals` invented to make the block look complete (item 5 passed by fabrication rather than by escalation).
- Publishing to a tracker without asking, when no tracker was configured.

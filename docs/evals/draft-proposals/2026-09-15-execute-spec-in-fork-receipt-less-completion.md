# Proposal: say what to do when a run delivers the work but no receipt

- Status: **superseded in form, retained in substance**（ADR 0007，2026-09-15）。fork-loop 路由退役时，本提案加入 `SKILL.md` 的那一节被改写为传输中立版：它成立的不变量保留（绝不在事后重建回执；"纸面缺失"不得等同于"工作失败"；如实记账并把选择权交回人），而依附于该传输的夹具描述（`mailbox`、`runs/<task-id>.log`、`check_status` 的 `finished-no-receipt` 相位、`fail_receipt` / `release_execution`）随传输一并删除。本节当时由已批准的本提案落地——`Approved: yes`——本轮改写不改变该次审批的事实。

- Skill: `execute-spec-in-fork`（SKILL.md 新增一节；共享契约层面，三条传输都适用）
- Evidence:
  - `D:\workspaces\ops-hub\docs\skill-friction-log.md` · 2026-09-15 · friction line 2：runner 干了 ~90 分钟、338+ 消息、26 次工具调用，工作完成后死于 `AI_APICallError`（`isRetryable: true`，无 `statusCode`、无 `responseBody`），`receipt: null`、`runner_output_chars: 10028`。
  - ops-hub `mailbox.json`：该任务 `state=failed`，`receipt=null` —— 交付物完整正确，六道门却因"无可解析回执"产出**零条**可归档证据。
  - `git log`（ops-hub）：工作本身随后以 `44a20e4` 入库（30 文件 / +3033 行），三张工单闭环 —— 即"证据为零但工作为真"确实发生。
- Verdict: confirmed-defect
- Change: 在 `skills/engineering/execute-spec-in-fork/SKILL.md` 中，于 `## Watch a long run` 之前插入以下一节。

old text（锚点，用于机械定位；不改动它本身）:

```text
## Watch a long run
```

new text（在锚点之前插入这一节，锚点原文保持不变）:

```text
## When a run delivers work but no receipt

The six archive gates key on one parseable receipt, and a runner can finish its work and then die before writing it. Verified once in the field: a run spent ninety minutes and produced the complete slice, then exited on an upstream model `AI_APICallError` — `receipt: null`, raw tail only. The deliverable was real and correct; the archivable evidence was zero. Do not confuse that with a failed slice, and do not improvise a receipt to make the gates pass.

What exists anyway, and is the whole of the evidence:

- the mailbox entry with `receipt: null`, its `raw_output_tail`, and `runner_exit`;
- `runs/<task-id>.log` — the runner's own output, written as it ran, which survives the supervisor being restarted;
- `failures.log`, if anything was logged on the way down;
- the worktree diff itself.

`check_status` names this phase `finished-no-receipt` for exactly this reason: the run is over, and there is nothing waiting to be collected.

**Never write, reconstruct, or hand-patch the missing receipt.** The `Schema` first field is the pin that stops a receipt from being assembled after the fact, and a reconstructed one is the precise failure the gates exist to catch. A run without a receipt is a run without a receipt.

Then close it honestly, with the human in the loop:

1. **Confirm the runner is gone.** `check_status`: the runner pid is not alive and no receipt is queued. If it is still alive, this is not this section — wait or `cancel_execution`.
2. **Judge the work on its merits, not on its paperwork.** The worktree diff is the artefact; `/code-review` against the pre-implementation fixed point does not need a receipt to run. Do not accept the work merely because it looks finished, and do not discard it merely because the receipt is missing.
3. **Decide one of two things with the user:** accept the worktree as a human-reviewed completion *outside* the receipt contract, or re-run the slice (cheap when the slice is small — the field case above needed one slice, not the whole spec).
4. **Record what happened, in the ledger, as what it was.** Append a `docs/metrics.md` row with `archive-gates: fail@2` (no single parseable receipt) and an honest `skill-friction` line naming what died. A row that claims `pass` for a run with no receipt makes the ledger unusable for exactly the question it exists to answer.
5. **Release the checkout.** `fail_receipt` (or `release_execution`) with the task id — a lock standing over a run that can never be acked blocks the next execution until the stale sweep, and `check_status` reports it as `needs_recovery`.
```

## 为什么放在共享契约层而不是某条传输里

三条传输（Codex Messenger / fork-loop / 手动）都会遇到它：回执是唯一的归档键，与它怎么回到规划线程无关。放在路由各自的小节里，意味着第三次读这份技能的人才会发现它适用于全部三条。

## 与 `spec-executor` 现状的关系

`spec-executor` 的 "Handle blockers and context overflow" 已经要求**返回部分回执**（`Conclusion: blocked`）——那条路径有回执。本节补的是它无法覆盖的一类：runner 在写回执之前就死了，执行侧不再有发言机会，处置完全落在规划线程。

- Approved: yes

Applied: 2026-09-15 — 锚点 `## Watch a long run` 逐字核对在位，新节插入其前。`node scripts/build-codex-plugin.mjs` 已重生成镜像，`npm run verify:all` 全绿。

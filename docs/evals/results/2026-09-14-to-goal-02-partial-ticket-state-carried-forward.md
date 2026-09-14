# Run: to-goal — partial ticket state carried forward

- **Task:** `tasks/to-goal/02-partial-ticket-state-carried-forward.md`
- **Date:** 2026-09-14
- **Harness:** WorkBuddy Agent 子代理（无上下文新会话）；技能以「已安装索引」方式暴露。沙盒：`.workbuddy/evals/tg02`（独立 git 仓，master @ d624a1a）
- **Skill fired:** yes — agent loaded `to-goal`

## Deviation

1 条：**向 tracker 区写入了 `.scratch/order-timeline/goal.md`**（to-goal 契约要求只读编译、goal 以 paste block 内联回传；夹具任务 01 的 deviation marker 明确「写入任何文件 = 只读契约违规」，两任务同一技能契约）。且回报「No files created or modified / worktree clean」与实际沙盒状态不符（scorer 复核：`?? .scratch/order-timeline/goal.md`）——报告失实。

## Interventions

0（agent 自行决定写入，无人纠偏）。

## Rework

0。

## Rubric check

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Current state 列出两条已验证完成的 AC + pre-implementation HEAD 作为 review fixed point | pass | HEAD d624a1a 记录正确；AC1/AC2 标 evidenced-complete（实测 node --test 2/2 过） |
| 2 | Completion criteria 仅含未完成的第三条 + 标准验证/评审/提交门 | pass | AC3 checkbox + validation / review / commit-after-authorization / clean-workspace gates |
| 3 | 已验证完成的工作未重现 为 Completion criteria checkbox | pass | AC1/AC2 只出现在 Current state |
| 4 | 「Tests skipped」compiler block 不出现 | pass | 无该 block；明确区分「未写 ≠ skipped」 |
| 5 | 未实施实现；工作树不变 | **fail** | scorer 复核：`.scratch/order-timeline/goal.md` 未跟踪文件存在——工作树被改变；且与 agent 自报的 clean 矛盾 |

## Verdict

**fail**（4/5）— 首次失败。

## Notes

- 被测契约核心（「never hide a known gap, never redo verified work」）本身全部守住：AC3 未被丢、已完成工作未被重做、fixed point 正确。
- 失败模式属**输出介质歧义**：goal 应内联回传还是落盘？技能契约与任务措辞未明确禁止落盘时，agent 选择了写入 tracker 区并误报 clean。这是 skill/protocol 层面的信号（to-goal 应显式声明输出介质），若复跑再失败即 confirmed-defect → /harvest run。
- 无访谈问题（未向用户重问 spec 已有内容）。

# Harvest run — 2026-09-15 · fork-loop 传输层摩擦（来自 ops-hub）

- 结果（ADR 0007，2026-09-15）：F1 与 F4 随整条 fork-loop 传输退役而失效——不再需要 pull-only 说明，也不再需要钩子的 checkout 发现顺序。F2 以传输中立形式保留在 `SKILL.md` 的 receipt-less 一节。F3 的修复随载荷一并删除。本 run 的输入现仅作历史记录。

Inputs read:

- `D:\workspaces\ops-hub\docs\skill-friction-log.md` — 一条 2026-09-15 的 `execute-spec-in-fork` 条目，内含 4 条 friction line（提交 `b891b0f` 落盘）。
- `D:\workspaces\ops-hub\.zcode\fork-loop\mailbox.json` — 该次运行 `task=forkloop-1789456557941-1`，`state=failed`，`receipt=null`，`finishedAt=16:45:57`。
- 本仓库：`skills/engineering/execute-spec-in-fork/SKILL.md`、`scripts/fork-loop-mcp/{server.mjs,stop-hook.cjs,README.md}`、`.claude-plugin/plugin.json`、`.agents/adr/0005-zcode-fork-loop-mcp-mailbox.md`。

这是一次**项目侧摩擦回溯到技能仓库**的情形：摩擦由 ops-hub 的规划线程记录，但它命名的是本仓库自有的 `execute-spec-in-fork`，按 `project-standards audit` 的路由规则，这是 `/harvest run` 的 confirmed-defect 输入。

## 信号分诊（一行一记录）

- **F1 · ZCode 的 Stop 钩子从未被注册，推送半边不可用** → **confirmed-defect**。
  该条目自己推翻了一个早期假设（`hooks.enabled` 缺失），并给出经两轮全量重启验证的结论：ZCode 只从**插件顶层 `hooks/hooks.json`** 或**清单的 `hooks` 字段**读取钩子，而本仓库两者都没有。
  **本仓库侧复核（本次 run 独立验证）**：顶层 `hooks/` 不存在；`.zcode-plugin/` 不存在；`.claude-plugin/plugin.json` 顶层键为 `name, version, description, author, homepage, repository, license, mcpServers, keywords, skills` —— **没有 `hooks`**；钩子只存在于 `.claude-plugin/hooks/hooks.json`（Claude Code）与 `.codex-plugin/hooks/hooks.json`（Codex）。**独立复核成立。**
  后果：ZCode 上该路由是 **pull-only**；而技能第 2 步写的是"等 Stop 钩子在回合之间注入回执"——照做会**等到永远**。
  处置：提案一。
- **F2 · 一次跑完工作却在报告步卒中的运行，产出零条可归档证据** → **confirmed-defect**。
  该次运行干了 ~90 分钟、338+ 消息、26 次工具调用，然后死在 `AI_APICallError`（`isRetryable: true`，无 `statusCode`、无 `responseBody`）——工作已完成，但 `receipt: null`。六道门以可解析回执为键，于是**一个完整正确的交付物产出零条可归档证据**。
  处置：提案二（记录该失败模式的处置路径，含"绝不手写回执"）。
- **F3 · 锁里的 `pid` 记的是错进程** → **已在本仓库修复，交叉验证成立**。
  他们观测到 `task.json` 的 `pid: 8396` 是 fork-loop MCP 服务而非 runner，且 runner 的 pid 无处可查。这与本会话对同一文件的独立诊断**完全一致**，并已于本会话修复：锁上增记 `runner_pid`（`server.mjs` 的 `recordRunnerPid`），存活判定语义随之明确（监督进程决定锁可否回收；runner 存活只用于观测与取消）。他们建议的兜底探测（匹配 `zcode.cjs -p` + `--cwd <checkout>` 的进程）在本仓库不需要——pid 现在被直接记录。
  结论：**记录为已修复**，随本会话未提交的改动一起入库。
- **F4 · 钩子靠"找到 mailbox.json"来定位 checkout，而 mailbox.json 直到有回执才存在** → **confirmed-defect（轻）**。
  启动顺序倒置：投递本身能工作（有东西可投时文件已存在），但这个发现机制在诊断期造成实质困惑。
  处置：折进提案一（同一文件、同一主题）。

## 未决问题（不在本轮提案内）

该条目提出的一个事实性问题无法在本地闭合，且它决定 F1 的正确处置是"永久改为 pull-only"还是"verification 待补"：

> 钩子运行器是否需要这台机器未使用的 surface（桌面应用以 `--surface desktop` 运行），或者文档所述的钩子支持晚于该构建。

在确认这一点之前，提案一只要求**如实记录已核实状态 + 给出可轮询的兜底**，不要求删除推送路径。

## 处置声明

本 run 未改动任何 `SKILL.md`、`.mjs`、ADR 或事实文档；唯一写目标是 `docs/evals/draft-proposals/` 下的三份文件（含本记录）。两份提案均为 `Approved: no`，等待人工审批。

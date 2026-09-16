# Proposal: the ZCode route must state that the receipt push is unavailable on this build, and poll instead

- Status: **superseded and withdrawn**（ADR 0007，2026-09-15）。本提案的主题——ZCode 自动路由——已不存在。它对 `SKILL.md` 的三处编辑与对 `scripts/fork-loop-mcp/stop-hook.cjs` 的一处编辑，随整条 fork-loop 传输退役一并移除。保留原文，作为"当时判断成立、后来被更上层的决策取代"的记录。

- Skill: `execute-spec-in-fork`（SKILL.md 三处）+ `scripts/fork-loop-mcp/stop-hook.cjs`（一处）
- Evidence:
  - `D:\workspaces\ops-hub\docs\skill-friction-log.md` · 2026-09-15 · `execute-spec-in-fork` 条目，friction line 1（推送半边不可用，含两轮全量重启的验证记录）与 line 4（钩子的 checkout 发现顺序倒置）。
  - 同目录 run 记录 `2026-09-15-harvest-run-forkloop-friction.md`，含本仓库侧对打包缺口的独立复核。
  - ops-hub `mailbox.json`：`task=forkloop-1789456557941-1`，`state=failed`，`receipt=null`，`finishedAt=16:45:57` —— 回执在信箱里躺着，从未被注入。
- Verdict: confirmed-defect
- Change: 四处精确编辑，old text → new text。

## 编辑 1 — 传输检测不再把"钩子已注册"当作匹配条件

`skills/engineering/execute-spec-in-fork/SKILL.md`，检测清单第 2 项。

old text:

```text
2. **fork-loop MCP**: a connected MCP server exposes `spawn_execution` / `check_mailbox` / `ack_receipt` (check via the harness MCP list or a `check_mailbox` probe) and the workspace Stop hook is registered → the ZCode automatic route below.
```

new text:

```text
2. **fork-loop MCP**: a connected MCP server exposes `spawn_execution` / `check_mailbox` / `check_status` (check via the harness MCP list, or a `check_status` probe) → the ZCode route below. Whether the receipt is *pushed* is a property of the build, not a precondition to match on: the plugin's Stop hook only runs on harnesses that read its hook surface, so verify that once and otherwise poll (`check_status`, `check_mailbox`). Matching only when a hook is registered would send every run on such a harness to the manual runbook even though spawn, mailbox and ack all work.
```

## 编辑 2 — 路由前言如实说明推送的可用性

同文件，`## ZCode automatic route (fork-loop-mcp)` 前言。

old text:

```text
When the `fork-loop` MCP server is connected and the workspace's Stop hook is configured (setup: `scripts/fork-loop-mcp/README.md`; decision: [ADR 0005](../../../.agents/adr/0005-zcode-fork-loop-mcp-mailbox.md)), this is the transport — one manual step, and the planning session stays usable throughout.
```

new text:

```text
When the `fork-loop` MCP server is connected (setup: `scripts/fork-loop-mcp/README.md`; decision: [ADR 0005](../../../.agents/adr/0005-zcode-fork-loop-mcp-mailbox.md)), this is the transport — one manual step, and the planning session stays usable throughout. One verified caveat: the receipt is delivered by a Stop hook, and the plugin contributes that hook only on harnesses that read it. A plugin whose manifest declares `mcpServers`/`skills` but no top-level `hooks/hooks.json` and no `hooks` field registers **no** hook — confirmed on ZCode 0.16.5, where the day's log contained zero hook-run records with a pending receipt waiting. On such a build this route is **pull-only**: the mailbox, the lock and every MCP tool work; only the push does not. Do not treat a missing push as a broken transport, and never wait for a receipt that cannot arrive — poll in step 2.
```

## 编辑 3 — 第 2 步：先验证推送，否则有界轮询（本次提案的核心）

同文件，ZCode 路由第 2 步。

old text:

```text
2. **Keep using the planning session.** Do not block or idle. The receipt is delivered by the Stop hook between turns: it injects the receipt as `additionalContext` and requests continuation. Treat the injected `[fork-loop]` block as the receipt arrival — jump straight to the six gates and the telemetry harvest below.
```

new text:

```text
2. **Keep using the planning session — and do not wait for a push that may not exist.** The receipt *can* be delivered by the Stop hook between turns, which injects it as `additionalContext` and requests continuation; when that happens, treat the injected `[fork-loop]` block as the receipt arrival and jump straight to the six gates and the telemetry harvest below. But the push is not guaranteed on every harness or build (see the preamble), so a planner that only waits is a planner that waits forever. Verify the channel once per workspace, then fall back to polling:

   - **Verify once.** Spawn a run and poll `check_mailbox` (or `check_status`) after it exits. If the hook was working, the entry is already `delivered` when you look; if it is still `pending`, the push is absent on this build — record that in the run's friction line and poll for the rest of the session.
   - **Poll while it runs.** `check_status{checkout}` reports the phase, both pids and their liveness, recent file activity and the log tail, so a working runner is distinguishable from a dead one long before the receipt exists.
   - **Poll for the receipt.** `check_mailbox{checkout, planner_session}` returns the entry once the runner exits. Bound the wait: on a normal build the entry appears within seconds of the runner's exit; `check_status` shows the runner as exited, and a run that never produces one is `finished-no-receipt` (proposal `2026-09-15-execute-spec-in-fork-receipt-less-completion.md`), not a transport to keep waiting on.
```

## 编辑 4 — 钩子不再靠"mailbox.json 已存在"定位 checkout

`scripts/fork-loop-mcp/stop-hook.cjs`，`findCheckout()` 的内层判断（friction line 4：启动顺序倒置）。

old text:

```js
      if (fs.existsSync(path.join(dir, '.zcode', 'fork-loop', 'mailbox.json'))) return dir;
```

new text:

```js
      // The state directory, not the mailbox file inside it. The mailbox does
      // not exist until the first receipt is written, so keying discovery on it
      // means the hook cannot find a checkout during exactly the period it is
      // most likely to be asked — and it reads as a bootstrapping inversion to
      // anyone diagnosing the transport.
      if (fs.existsSync(path.join(dir, '.zcode', 'fork-loop'))) return dir;
```

## 不包含什么

本提案**不**删除推送路径，也**不**声称推送永久不可用。该条目提出的未决事实——钩子运行器是否需要本机未使用的 surface，或文档所述支持晚于该构建——本地无法闭合；在那之前，正确的处置是如实记录已核实状态并给出兜底，而不是删掉一条可能在别的构建上正常工作的路径。

- Approved: yes

Applied: 2026-09-15 — 四处 old text 逐字核对在位后应用：`execute-spec-in-fork/SKILL.md` 检测清单第 2 项、ZCode 路由前言、ZCode 路由第 2 步；`scripts/fork-loop-mcp/stop-hook.cjs` 的 `findCheckout()` 内层判断（`mailbox.json` → 状态目录）。`node scripts/build-codex-plugin.mjs` 已重生成镜像，`npm run verify:all` 全绿。

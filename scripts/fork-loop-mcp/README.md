# fork-loop-mcp — ZCode 自动闭环传输层（ADR 0005）

给 ZCode 补上 Codex App 的会话通道能力：**程序化 spawn 执行会话 + receipt 信箱 + Stop 钩子推送**。规划线程手动步骤从 3 次降到 1 次（只剩 `/to-spec`），等待期间规划会话照常可用。

零依赖，Node 18+，五个文件：

| 文件 | 角色 |
|---|---|
| `server.mjs` | MCP stdio 服务。7 个工具：`spawn_execution` / `check_mailbox` / `check_status` / `ack_receipt` / `fail_receipt` / `cancel_execution` / `release_execution` |
| `runstate.mjs` | 只读状态模型。锁、信箱、运行日志、进程存活、文件活动合成一份 `buildReport` —— MCP 工具、CLI、看板三处共用，三者不可能各说一套 |
| `stop-hook.cjs` | ZCode `Stop` 钩子。回合结束时查信箱，有待投递 receipt 就注入 `additionalContext` 并请求继续（一次 receipt 消耗一次续跑，ZCode 上限 3 次） |
| `status.mjs` | 命令行查询：`--checkout <path>` 打印阶段/双 pid/活动/日志尾段；`--watch` 持续刷新；`--scan <dir>` 列全部 checkout；`--require-idle` 有活在飞就 exit 3 |
| `dashboard.mjs` + `dashboard.html` | 网页看板（默认 `127.0.0.1:7788`），实时刷新；`--snapshot <file>` 导出静态页可发布 |

## 数据流

```text
规划会话                         fork-loop-mcp                      执行会话（headless）
   │  spawn_execution(spec_ready)    │                                   │
   │ ───────────────────────────────→ │ 建锁 → 写 state.json + runs/<id>.log
   │  ← 立即返回 {status: running}    │ zcode -p … --cwd <checkout> ────→ │ /spec-executor
   │  （会话保持可用）                 │                                   │
   │                                 │ ← 期间：check_status / status CLI / 看板
   │                                 │   读同一份 report（阶段、双 pid、活动、日志）
   │                                 │ 捕获 stdout（并落盘 runs/<id>.log）│ 完成，输出 receipt
   │                                 │ 信箱 state=pending ←──────────────┘
   │ [Stop 钩子] check → 注入 receipt │
   │ ←─────────────────────────────── │
   │ 六道门 → /domain-modeling → ack_receipt（state=done，锁释放）
```

## 执行中可观测（本层存在的理由之一）

`spawn_execution` 必须是"发完就回"——否则规划回合会被 runner 卡住，而 Stop 钩子恰恰是在回合之间投递 receipt 的。代价是**一段既没有回执也看不见进展的窗口**：一个正常干活的 runner 和一个启动即死的 runner，在旧版下长得一模一样，最长要等 90 分钟超时才见分晓。

三种视角，同一份 `buildReport`：
```bash
# 一次性查询（最快，插件本身可疑时也照样能用）
node scripts/fork-loop-mcp/status.mjs --checkout D:/workspaces/ops-hub
node scripts/fork-loop-mcp/status.mjs --checkout D:/workspaces/ops-hub --watch

# 网页看板（实时，跨标签页留着）
node scripts/fork-loop-mcp/dashboard.mjs --checkout D:/workspaces/ops-hub --port 7788
# 导出静态快照（可发布成在线页）
node scripts/fork-loop-mcp/dashboard.mjs --checkout <path> --snapshot board.html

# 规划会话里（agent 自查）
check_status{checkout}            # 阶段 / 双 pid / 活动 / 日志尾段 / 信箱
```

看板与 CLI 的首屏都是**任务列表**：每行一个任务，带状态、主题、时长、最后信号、回执、退出码与在飞标记。列表由三源按 `task_id` 合并（`来源` 列写明这条任务被哪几处记录到），所以**运行中的任务在回执到达之前就已经在列表里**——它靠锁与文件活动现身，而不是等 `state.json` 落盘；反过来，一次被取消、或 runner 退出却没有回执的运行，也会各自以 `已取消` / `已结束（无可解析回执）` 留在列表里，不会被静默吞掉。

紧随其后的是**流水线**面板：`.scratch/<feature>/` 下的 spec、tickets 与规划件，各自的阶段由**规划件本身**（有没有 spec / tickets / `SPEC READY` 块）和**命名了它的执行**（`SPEC READY` 的 `Source`、回执的 `Spec source`）决定。**未开始的工作也在这里** —— 操作者要决策的往往正是还没跑的那部分。一次由旧版 server 启动的运行也能被认回来：它没有 journal 记录，但落盘的 launch prompt 里就带着完整的 `SPEC READY` 块。

时长永远带秒。`1h18m` 这种分钟粒度会在整整一分钟里一动不动，看起来就是看板卡死了——运行中的行由页面每秒本地推进，不等下一次轮询。

**结算**面板回答「这次跑完交回了什么、过没过门」：结论 token、逐条验收证据、Docs delta（规划线程要沉淀进 `CONTEXT.md` / ADR 的内容）、回执自己记的归档门结果，以及按契约字段表逐条对照出的结构问题。**逐门机器校验**走 `/api/validate?task=<id>`——它 spawn 真正的 `scripts/receipt-gate.mjs`（带 `--checkout`，让 Gate 6 比对本 checkout 的工作树而不是校验器自己所在仓库），只在每个任务首次渲染时跑一次并按 `task_id` 记忆：回执写一次就不再变，看板不该两秒 spawn 一个进程。

**遥测**面板把两块台账读回来聚合：门失败累计、质量标签分布、证据累计、周分布、按技能的摩擦计数，以及 `≥2 次` 的重复摩擦（那是 `/project-standards audit` 与 `/harvest run` 的输入）。没有台账就直说没有——「还没积累遥测」和「遥测是空的」是两件事。

报告里每一项都有据可依，而不是推断：

| 字段 | 来源 | 诚实边界 |
|---|---|---|
| `tasks` | 锁 + `state.json` + 信箱三源按 `task_id` 合并 | 只被其中一处记录的任务也会出现在列表里；`last_signal_at` 取日志 mtime 与文件活动，**不用建锁时间当心跳**（否则任何超过 20 分钟的正常运行都会被误判为停滞），并随行显示，不必只信标签 |
| `pipeline` | `.scratch/<feature>/` 下的 spec / tickets / 规划件，按「是否有 SPEC READY 块」与命名了它的执行定阶段 | **未开始的工作也在里面**；联接键是 SPEC READY 的 `Source` 与回执的 `Spec source` 路径；路径对不上就不硬凑 |
| `settlement` | 最近一份回执按 `contracts/receipt-v2.json` 的字段表解析（结论 / 逐条证据 / Docs delta / metrics 行），外加问题清单 | 纯解析，不跑子进程，所以能随每次轮询；**逐门机器校验**另走 `/api/validate`，因为它要 spawn 校验器（见下） |
| `telemetry` | `docs/metrics.md` 与 `docs/skill-friction-log.md` 的聚合：门失败累计、质量标签分布、证据累计、周分布、按技能摩擦计数 | 没有台账就说没有；**理由**：台账的样板示例在代码围栏里，解析器会跳过围栏并要求条目标题以日期开头，不把模板当成条目 |
| `phase` | 直接取在飞任务的阶段 | 头部与任务行同源，不可能互相矛盾 |
| `lock.supervisorAlive` | `pid` = 拥有信箱写入的 MCP 服务 | 只有它死了才叫 `orphaned`（没人再能产出回执） |
| `lock.runnerAlive` | `runner_pid` = 执行会话 | 未记录 → `unknown`，**永不报 alive** |
| `activity.files` | checkout 内 mtime 扫描（跳过 `.git`/`node_modules`/`.zcode`） | 这是 runner 确实在写东西的硬证据 |
| `logTail` | `runs/<task-id>.log` 尾段 | 落盘，所以 MCP 服务中途重启也还能捞回执 |
| `gitDirty` | `git status --porcelain` | git 不可用时报 `null`，不猜 |

## 安装（每个 workspace 一次）

前提：headless CLI 能发起模型调用。**与 Z.AI / BigModel 计划无关**——执行会话跑在你已配置的任意 provider 上（第三方 OpenAI-compatible 端点也可以）。一次性把 `~/.zcode/cli/config.json` 指向它即可：

```json
{
  "provider": {
    "<我的供应商>": {
      "kind": "openai-compatible",
      "options": { "baseURL": "https://…/v1", "apiKey": "<key>" }
    }
  },
  "model": { "main": "<我的供应商>/<模型 id>" }
}
```

两个坑（0.16.5 实测）：`model.main` 必须是**字符串** `provider/model-id`——对象形式能过 schema 但 `kind`/`baseURL` 字段会被 ref 解析器忽略；provider 条目里必须带 `options.baseURL` 和 `options.apiKey`（anthropic 兼容端点用 `kind: "anthropic"`）。配置好后 `zcode -p "…"` 即可直接使用，无需任何 ZCode 计划的登录。

1. **MCP 服务** — 写入 `<repo>/.zcode/config.json`（workspace 级，自动连接）：

```json
{
  "mcp": {
    "servers": {
      "fork-loop": {
        "type": "stdio",
        "command": "node",
        "args": ["<仓库绝对路径>/scripts/fork-loop-mcp/server.mjs"]
      }
    }
  }
}
```

2. **Stop 钩子** — 同一配置文件加入（配置文件钩子必须显式启用）：

```json
{
  "hooks": {
    "enabled": true,
    "events": {
      "Stop": [
        {
          "hooks": [
            {
              "type": "process",
              "command": "node",
              "args": ["<仓库绝对路径>/scripts/fork-loop-mcp/stop-hook.cjs"],
              "timeoutMs": 15000,
              "statusMessage": "Checking fork-loop mailbox"
            }
          ]
        }
      ]
    }
  }
}
```

3. **环境变量（可选）**：`FORK_LOOP_ZCODE_CMD` 覆盖 CLI 启动命令（默认 `node D:/softs/ZCode/resources/glm/zcode.cjs`）；`FORK_LOOP_STATE_DIR` 覆盖信箱根目录（默认 `<checkout>/.zcode/fork-loop`，已被本仓库 `.gitignore` 覆盖）。

## 会话里的用法

规划会话（拥有 Stop 钩子的那个）：

```text
你：/to-spec 封版后，用 fork-loop 启动执行。
agent：（调 spawn_execution{checkout, spec_ready, planner_session}）
       → 执行会话在后台跑，本会话照常可用
       → [Stop 钩子] receipt 到达，自动注入并继续：
         六道门 → Docs delta ≠ none 则 /domain-modeling → ack_receipt
```

## 保障机制

- **单活跃执行守卫**：`spawn_execution` 对 checkout 建目录锁（原子 mkdir），一次只允许一个执行会话。锁上记两个 pid：`pid` 是监督进程（MCP 服务，负责写信箱），`runner_pid` 是执行会话本身 —— 监督进程一死，锁立刻可回收（不必等 6 小时 sweep）；runner 死了而监督进程还在，则是 `settling`，退出处理器马上会记一条回执。
- **取消路径与回收路径分离**：想停就跑 `cancel_execution`（杀 runner 进程树 → 释放锁 → 记 `state.json` 与 failures.log）。`release_execution` 是"锁的持有者已经死了"的回收口，**执行还活着时它拒绝强行落锁** —— 落锁不等于停跑，只会让第二个执行挤进同一个 checkout，正是这把锁要防的事。
- **exactly-once 投递**：Stop 钩子投递后立即置 `delivered`，重复 Stop 不会重复注入。session 匹配是严格的：拿不到 session id 时只投递**没有记录 planner session** 的回执，绝不"谁都给"—— runner 会话同样挂着这个钩子，通配匹配会把回执投进执行会话，且看起来跟成功投递一模一样。
- **状态目录单一来源**：server / stop-hook / status / dashboard 都通过 `stateRoot` 解析（含 `FORK_LOOP_STATE_DIR` 覆盖）。四处各写一份路径，就是四种"找不到信箱"的方式。
- **receipt 缺失可观测**：runner 没产出可解析 receipt 时，注入的是原始输出尾段 + 警告，不会静默成功；回执也会从落盘的 `runs/<id>.log` 兜底捞一次。
- **续跑预算**：Stop 续跑 ZCode 上限 3 次，一次 receipt 恰好消耗 1 次，不存在死循环。
- **嵌套守卫**：runner 会话会加载同一个插件、也就拉起第二个 fork-loop 服务；该进程带 `FORK_LOOP_NESTED=1`，`spawn_execution` 会直接拒绝——runner 只实现一个契约，不去开新的执行。

## 测试

```bash
node --test test/mailbox-cycle.test.mjs   # 信箱 / 锁 / 取消 / 状态 / 超时（32 项）
node --test test/stop-hook.test.mjs       # 钩子投递与全部静默分支（15 项）
node --test test/runstate.test.mjs        # 存活判定 / 阶段推导 / 活动扫描（8 项）
```

三条套件都由 `npm run verify:all` 聚合。全绿 = 信箱投递、exactly-once、锁生命周期、取消语义、存活判定与状态报告全链路正确。

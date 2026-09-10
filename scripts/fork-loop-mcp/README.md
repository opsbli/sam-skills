# fork-loop-mcp — ZCode 自动闭环传输层（ADR 0005）

给 ZCode 补上 Codex App 的会话通道能力：**程序化 spawn 执行会话 + receipt 信箱 + Stop 钩子推送**。规划线程手动步骤从 3 次降到 1 次（只剩 `/to-spec`），等待期间规划会话照常可用。

零依赖，Node 18+，两个文件：

| 文件 | 角色 |
|---|---|
| `server.mjs` | MCP stdio 服务。5 个工具：`spawn_execution` / `check_mailbox` / `ack_receipt` / `fail_receipt` / `release_execution` |
| `stop-hook.cjs` | ZCode `Stop` 钩子。回合结束时查信箱，有待投递 receipt 就注入 `additionalContext` 并请求继续（一次 receipt 消耗一次续跑，ZCode 上限 3 次） |

## 数据流

```text
规划会话                         fork-loop-mcp                      执行会话（headless）
   │  spawn_execution(spec_ready)    │                                   │
   │ ───────────────────────────────→ │ zcode -p … --cwd <checkout> ────→ │ /spec-executor
   │  （会话保持可用）                 │ 捕获 stdout → 提取 RECEIPT v1      │ 完成，输出 receipt
   │                                 │ 信箱 state=pending ←──────────────┘
   │ [Stop 钩子] check → 注入 receipt │
   │ ←─────────────────────────────── │
   │ 六道门 → /domain-modeling → ack_receipt（state=done，锁释放）
```

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

- **单活跃执行守卫**：`spawn_execution` 对 checkout 建目录锁（原子 mkdir），一次只允许一个执行会话；锁在 `ack_receipt` / `fail_receipt` / `release_execution` 时释放，超过 6 小时的陈旧锁可被打破。
- **exactly-once 投递**：Stop 钩子投递后立即置 `delivered`，重复 Stop 不会重复注入。
- **receipt 缺失可观测**：runner 没产出可解析 receipt 时，注入的是原始输出尾段 + 警告，不会静默成功。
- **续跑预算**：Stop 续跑 ZCode 上限 3 次，一次 receipt 恰好消耗 1 次，不存在死循环。

## 测试

```bash
FORK_LOOP_STATE_DIR=/tmp/flstate node test/mailbox-cycle.test.mjs
```

全部断言绿 = 信箱投递、exactly-once、锁生命周期、ack/fail 释放全链路正确。

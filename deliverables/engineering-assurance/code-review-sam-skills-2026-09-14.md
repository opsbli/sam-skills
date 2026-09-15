# sam-skills 全面工程审查报告

**日期**：2026-09-14
**工作流**：工作流 1 · 综合代码审查（范围＝整个仓库）
**参与成员**：科迪（Cody）· 代码审查师 / 阿奇（Archi）· 系统架构师 / 泰莎（Tessa）· 测试专家 / 雷克斯（Rex）· SRE 工程师
**主理人**：甄宇航（Zhen）· 工程督导
**审查基线**：`sam-skills` @ `main`（`package.json` = `1.2.3-to-goal.3`，HEAD `bfe0590`），工作树干净（仅 1 个未跟踪 `.skillstats.txt`）

---

## ⚠️ 状态漂移警告（必读）

**本次审查期间，共享 checkout 被另一会话并发修改。**

- 会话开始时（17:0x）`git status --porcelain` 输出**仅 1 行**：`?? .skillstats.txt`。
- 复查时（17:1x）输出为 **6 个已修改 + 3 个新增**：

```
 M .githooks/pre-push            M .github/workflows/fork-guard.yml
 M AGENTS.md                     M package.json
 M scripts/build-codex-plugin.mjs    M scripts/lint-skills.mjs
?? deliverables/  ?? docs/skill-audit-2026-09-14.md  ?? scripts/verify.mjs
```

- **这本身就是一个治理发现**：它恰好违反了本仓库自己写在 `README.md:497` 的硬规则——「同一 checkout 同时只允许一个活跃执行线程（自动 fork 或手动会话）」。而 `fork-loop-mcp` 的 lockfile **只覆盖 3 条执行路由中的 1 条**（发现 #18），对本场景完全无保护。
- **对报告的影响**：下方**发现表基于会话开始时的基线**（HEAD `bfe0590` + 干净工作树）得出。那次并发修改**修复了其中一部分**，也**引入了新的断线**。**每一项的当前状态见「🔁 重基线复审」一节**——请以该节为准，不要把发现表当作当前 open 列表。

---

## 📌 TL;DR（执行摘要）

- **整体结论**：技能内容本体（32 个 promoted Skill、ADR 体系、门禁设计范式）**质量中上、可放行**；但 **fork 自建的最高权限面（`fork-loop-mcp` 传输层）与发布链路存在 4 项阻塞级缺陷**，建议 **Request Changes**。
- **严重度分布**：🔴 严重 **12** 项 / 🟠 高 **16** 项 / 🟡 中 **13** 项 / 🟢 低 **7** 项（共 48 项，含重基线后新增 4 项）。
- **两个"最刺眼"的事实**：① **CI 当前是红的**（主理人实测 `build-codex-plugin --check` = exit 1，7 项载荷漂移）；② **CI 从不执行任何测试**（`package.json` 连 `test` 脚本都没有），而给六道归档门喂 receipt 的传输层，其唯一"测试"是一个 **恒真伪测试**（`mailbox-cycle.test.mjs:57` 无条件 `process.exit(0)`）。
- **阻塞 / 非阻塞**：**阻塞 4 项**（CI 红 / Windows 命令注入 / 锁互斥可被绕过 / 发布链断点）；其余 40 项为高优与改进项，不阻塞技能内容本身的可用性。
- **一句话**：**门很硬，但喂门的路和看门的哨兵都没上岗**。
- **⚠️ 重基线（对当前工作树）**：并发修改**已修复 #1、#6**（`build-codex-plugin --check` 现为 **EXIT=0 "payload fresh"**；CI 已改为跑 `npm run verify:all` 含全部测试套件）；但并发修改**引入 2 处新断线**——① 新 CI 门引用的 `scripts/append-only-gate.mjs` **不存在**，`npm run verify:all` 实测 **10/11 红**；② **恒真伪测试 `mailbox-cycle.test.mjs` 已被正式接入 CI**，把"假绿"制度化。**`fork-loop-mcp` 传输层未被触碰——#2/#3/#4/#5/#7(根因)/#10 等全部仍开放。**

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🔴 **不通过**（限 `fork-loop-mcp` 传输层 + 发布链路 + **当前 CI**）；技能内容与门禁设计范式 🟡 有条件通过 |
| 阻塞项数量 | **5**（基线 4 项 + 重基线后新增 1 项：#45 `append-only-gate.mjs` 缺失致新 CI 门 10/11 红） |
| 关键行动项 | **9** 条（P0×5 / P1×4） |
| 最大单点风险 | 流水线唯一被信任的机械门在 CI 中根本不执行，且投递路径由一个"永远退出 0"的伪测试覆盖 → 静默回归会以 **"CI 全绿"** 的姿态发布 |
| 建议下一步 | 先做 P0-1（恢复 CI 绿）与 P0-2（堵命令注入），再进 P0-3/P0-4；架构侧采纳 **ADR 0007（机读契约单一权威 + 反向校验接 CI）** |
| 主理人独立复核 | 5 项关键结论已由主理人亲自复现，非成员转述（见文末「复核记录」） |

---

## 🔍 审查发现（去重合并后按严重度排序）

> 来源列标注该结论由哪位成员提出；同一问题被多人独立命中的已在来源列并列（**交叉命中＝置信度高**）。

| # | 严重度 | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|---------|---------|---------|------|
| 1 | 🔴 | 发布/CI | `scripts/build-codex-plugin.mjs:36-77`；`.codex-plugin/plugin.json:31-39` | **Codex 插件载荷已漂移，fork-guard CI 当前为红**：`--check` 报 7 项（plugin.json + 5 个 SKILL.md drifted、`hooks/hooks.json` stale）。生成器 `buildManifest()` **不产出 `mcpServers`**，磁盘却有 `fork-loop` MCP 块 → 镜像与源码分叉。违反 ADR 0006 不变量 | (1) 把 `mcpServers` 补进 `buildManifest()` 后重生成；(2) 该检查补进 sync-upstream 后置校验 | Archi A1 · Rex R1 · **主理人实测** |
| 2 | 🔴 | 安全 | `scripts/fork-loop-mcp/server.mjs:148-153`（`args` 拼接见 `:144`） | **Windows 命令注入 sink**：`spawn(bin,args,{shell: platform==='win32'})`，args **零转义**；`checkout` 仅 `existsSync` 校验即入 argv。路径含 `&`/`%`（合法文件名字符）即执行任意命令（继承全部 env，含 provider key）；即使无恶意，含空格路径也会静默拆参 → `--cwd` 指向错误目录 | win32 改 `shell:false`（args 可直传）；`checkout` 走 `realpathSync` + 断言为已存在目录；沿用 `delivery/安全设计.md:416` 宣称的双引号纪律 | Cody #1 · **主理人复核代码** |
| 3 | 🔴 | 正确性/并发 | `server.mjs:92-94, 292-302, 371-373` | **锁互斥可被陈旧 ack/release 击穿**：`settle()` 按 task_id 查但**不校验 state**，`releaseLock()` **无条件 rmSync**。旧 task 的迟到 `ack_receipt`/`fail_receipt`/`release_execution` 会释放**当前活跃执行**的锁 → 单活跃守卫失效，两 headless 会话同改同一 worktree | 释放前校验锁内 `task.json.id === args.task_id` 且 entry.state 合法；`release_execution` 增加 task_id 或显式 force 语义 | Cody #2 · Rex §4 |
| 4 | 🔴 | 正确性/竞态 | `server.mjs:74-88` | **lock 竞态**：`mkdirSync(file)` 成功后**才** `writeJson(task.json)`（第 88 行）。并发者 EEXIST 时读不到 task.json → 回退 `{startedAt:0}` → 判为 stale → `rmSync` 抢占刚建的锁。微秒级并发下互斥被击穿 | 先写 tmp 再原子 rename；或 mkdir 后立即落 task.json 且"task.json 缺失不判 stale" | Rex §4 · **主理人复核代码** |
| 5 | 🔴 | 正确性/资源 | `server.mjs:161-165` | **超时杀进程不彻底 → Promise 永久挂起 + 锁泄漏**：90min 超时仅单次 `child.kill()`（SIGTERM），无 SIGKILL 升级；win32 `shell:true` 下 child 是 `cmd.exe`，杀 shell 后孤儿 node 仍持有 stdout 管道 → `'close'` 永不触发 → 无二次兜底 → 该 checkout 锁长期占用（仅靠 6h 陈旧破锁） | win32 用 `taskkill /PID <pid> /T /F` 杀进程树；kill 后设短宽限，仍未 close 则强制 resolve 并落 error 条目 | Cody #3 · Rex · **主理人复核代码** |
| 6 | 🔴 | 测试/CI | `.github/workflows/fork-guard.yml:27-41`；`release.yml:29-37`；`package.json:19-22` | **CI 不执行任何测试**：两个 workflow 逐条读完，无 `node --test`/`npm test` 调用；`package.json` 无 `test` 脚本；`test-coupling-gate.test.mjs` 与 `mailbox-cycle.test.mjs` 连 npm 入口都没有 | 新增 `"test": "node --test scripts/**/*.test.mjs"` 并在 fork-guard 增 `- run: npm test`；顺带跑两个门的 `--check` | Tessa §0.1 · Rex · **主理人复核 workflow** |
| 7 | 🔴 | 测试质量 | `scripts/fork-loop-mcp/test/mailbox-cycle.test.mjs:57` | **恒真伪测试**：全文无 `node:test`、无 `assert`，只用 `console.log('…correct'/'WRONG')`；第 57 行**无条件 `process.exit(0)`** → 内部全判 WRONG 也照样退出 0。作为 `*.test.mjs` 被 `--test` 收集时会贡献一个"永远通过"的假绿 | 重写为 `node:test` + `assert`；覆盖 exactly-once、lock 冲突、ack 释放锁、session 过滤 | Tessa 2.3 · Cody · **主理人读全文确认** |
| 8 | 🔴 | 发布 | `package.json:13`；`build-codex-plugin.mjs:79-91` | **发布链自动路径不可走通**：`npm run version` = `changeset version && sync-plugin-version.mjs`，**不重建 `.codex-plugin/`** → 自动版本 PR 自带 drift → 被自己的 `build-codex-plugin --check` 判红 → 版本 PR 永远无法变绿 | `version` 脚本末尾追加 `&& node scripts/build-codex-plugin.mjs` | Rex 断点A（推断）· Archi A5 |
| 9 | 🔴 | 数据/发布 | `build-codex-plugin.mjs:82,108-146` | **重新生成会静默删除 `hooks/hooks.json`**（生成器 `rmSync` 整目录但从不产出 `hooks/`）。开发者按报错提示跑 regenerate 会摧毁 Codex Stop 钩子 → fork-loop 对 Codex 失效；随后 `--check` 因两端皆缺而"通过" | 生成器改为只清理 `skills/` 与 `plugin.json`，把 `hooks/` 移出被删范围 | Rex R1（推断，仅读代码） |
| 10 | 🔴 | 测试 | `scripts/fork-loop-mcp/stop-hook.cjs:51-92` | **投递钩子零测试**：exactly-once 投递、session 过滤、`.zcode/fork-loop` 定位、失败静默（失败即 exit 0，无日志）全部无覆盖。钩子崩溃会拖垮规划会话，且无任何信号 | 新建 `stop-hook.test.mjs`（子进程 + 临时目录），覆盖：空邮箱静默 / 命中投递 / 二次静默(exactly-once) / session 不匹配静默 | Tessa §3 · Cody #13 |
| 11 | 🟠 | 契约/正确性 | `receipt-gate.mjs:46` vs `skills/engineering/spec-executor/SKILL.md:71` vs `server.mjs:218` | **`Conclusion` 合法 token 集三处矛盾**：门 = `completed/blocked/failed`；SKILL 正文与 MCP 提示词 = `completed/partially completed/blocked`。实测提交 `partially completed` → Gate1 FAIL(101001) + Gate3 FAIL(101003)。而 `--check` 只核对 Schema token 与标题，**不核对 Conclusion 词表**，该漂移永远检不出 | 收敛为唯一常量：或让 `--check` 从 SKILL.md 反解 Conclusion 词表比对，或 SKILL/MCP 改为引用契约；修正 `server.mjs:218` | Archi A2（实测） |
| 12 | 🟠 | 契约/正确性 | `receipt-gate.mjs:42,127-150`（`cwd: repo` 在 `:131`） | **Gate 6 校验错误的树**：`repo = <脚本目录>/..`，`git status --porcelain` 以本脚本仓库为 cwd。实测一份声明"clean"的 receipt 被判 FAIL（理由：本仓多出 `docs/skill-audit-…`）。作为随插件分发给任意项目调用的门，Gate 6 在本仓 dogfood 能过、在用户项目里恒 FAIL 或恒 PASS | Gate 6 接受显式 `--checkout <path>`（默认 cwd）；`repo` 仅用于定位契约源文档 | Archi A4（实测） |
| 13 | 🟠 | 门禁强度 | `receipt-gate.mjs:59,152-158` | **归档门可被无证据行满足**：`MARKER_RE=/(pass\|fail\|✅\|❌)/i` 无词边界 → `bypass`/`failure`/`passenger` 均被当作 pass/fail 标记。`- AC2 implement bypass logic` 会被判为"有 pass 标记 + 有证据"而放行 → "6/6 放行"可能是假绿 | 标记用 `\b` 锚定或行首状态符；证据要求命令/输出反引号跨度或具体退出码 | Cody #10 |
| 14 | 🟠 | 门禁正确性 | `receipt-gate.mjs:58,80-91` | **字段解析误切**：`FIELD_RE` 会把验收标准里含冒号的条目行（`- AC1: …`）解析为新字段，截断 Acceptance criteria → gate4/gate5 误报或漏检 | 加已知字段名白名单锚点，或 acceptance 区内优先按 continuation 判定 | Cody #9 |
| 15 | 🟠 | 同步/运维 | `scripts/sync-upstream.sh:2,21-24,36-41` | **同步硬门有三处缺陷**：① `:21-24` 守卫**恒真**（`base` 本身即 merge-base，按定义必为上游祖先），是一道抓不到任何东西的假门；② rebase 冲突时 `set -e` 让脚本在 `:36` 直接退出，**不打印 `SYNC INCOMPLETE`**，仓库停在 mid-rebase 脏状态；③ 有备份分支但**脚本不回落** | 删除死守卫；加 `trap cleanup EXIT`（对齐 `sync-drill.sh:27-32` 的 abort+checkout）；`sync_failed` 显式提示 `git reset --hard <backup>` 或提供 `--rollback` | Tessa §2.6 · Archi A8 · Rex Q2 |
| 16 | 🟠 | 文档/运维 | `docs/maintaining-fork.md:20`；`sync-upstream.sh:38-41` | **文档与脚本不符 + `SYNC INCOMPLETE` 无 runbook**：文档写"冲突就 resolve 并 continue"，脚本实际是退出；`SYNC INCOMPLETE` 字样在两份维护文档中**完全不存在**，8 个故障场景无任何可执行恢复步骤 | 补 8 条 runbook（见 `docs/`），至少覆盖：rebase 冲突中途退出 / SYNC INCOMPLETE / lock 卡住 / runner 无 receipt / 手工 bump / 钩子激活 | Rex Q2 · §5 |
| 17 | 🟠 | 架构/契约 | `receipt-gate.mjs:383-433` 未接 CI；`test-coupling-gate.mjs:97-112`、`tdd-slice-gate.mjs:155-175` 只自测 fixture | **防漂移自检存在但没接线，且两个 tdd 门对散文零交叉校验**：同一条 tdd 规则散在①脚本实现②`SKILL.md` 散文③`docs/evals` rubric 三处，prose↔脚本漂移无机制可发现 | 把 `receipt:gate --check` 提升为 CI 步骤；给两个 tdd 门加"契约锚点"`--check`，断言 SKILL.md 含对应条款关键短语 | Archi A3 |
| 18 | 🟠 | 运维/一致性 | `server.mjs:194`；`README.md:140,497` | **锁只在 3 条路由中的 1 条机械生效**：手动 runbook 与 Codex fork 路由**无机器锁**，仅靠 README 政策"归档前确认无第二个 fork"。README 却是硬规则口吻 → 文档与实现不一致 | 手动路由加显式锁检查；或下调 README 口径为"仅 fork-loop 路由机械保障" | Rex §4 |
| 19 | 🟠 | 性能/交互 | `server.mjs:239,307` | **`spawn_execution` 阻塞至 runner 退出（≤90min）**，与 README/ADR 宣称的"执行会话后台跑、规划线程照常可用"矛盾 → 规划会话被卡 | 真正 detach：立即返回 task_id，stdout 由后台续写 mailbox | Rex §6 |
| 20 | 🟠 | 门禁/文档 | `lint-skills.mjs:99-102`；`docs/maintaining-fork.md:50`；`README.md:513` | **`--diff-audit` 宣传为守卫，实为 warn-only 且从未进 CI**：`maintaining-fork.md:50` 承诺"两版后升硬门"未兑现，README 却称"由它把关" → 继承层漂移零拦截 | 接进 fork-guard（warn→block 做成参数）；README 措辞与实际门状态对齐 | Archi A9 · Rex |
| 21 | 🟠 | 可观测性 | `docs/metrics.md:3`；`docs/skill-friction-log.md:3` | **台账纯手工、漏记零检测**：无对账机制（receipt 数 vs 记录行数）、无 CI 校验；`skill-friction-log` 声称"空=顺畅"**不可证伪**。`check_mailbox`/`fail_receipt` 失败路径无日志、无告警，规划会话关闭后什么都不浮出 | 加对账门；或由工具自动追加；异常路径落盘日志 | Rex Q5 · Tessa §5 |
| 22 | 🟠 | 环境一致性 | `.github/workflows/*.yml:14/:13`（runner=ubuntu-latest）；`package.json:16-17`；`sync-local-skills.sh:47` | **Windows 开发机无法复现 CI 的 bash 部分**（本机实测：`bash` 是 WSL stub，`dirname`/`head`/`grep` 全 NOT FOUND；Git Bash 存在但**无 `rsync`**，`sync-local-skills.sh:47` 的 `rsync -a --delete` 必失败）；CI 也无 Windows job——而 fork-loop 明确面向 win32 | 统一走 Git Bash/容器并补 rsync 依赖；CI 增 `windows-latest` job 跑 fork-loop 测试 | Rex Q6（实测） |
| 23 | 🟠 | 正确性/并发 | `server.mjs:38-41,96-106,269-290`；`stop-hook.cjs:76` | **mailbox 多进程竞态 + 跨 checkout 混投**：MCP 端 `writeJson` 走 tmp+rename（原子），但 stop-hook 端 `writeFileSync` **直接覆盖（非原子）** → 交错丢更新/重复投递，破坏 DESIGN 宣称的 exactly-once；且设 `FORK_LOOP_STATE_DIR` 时**所有 checkout 共享同一 mailbox**，`checkMailbox` 不按 checkout 过滤 → 投递错误 receipt | stop-hook 改原子写；mailbox 路径纳入 checkout hash；`checkMailbox` 增加 checkout 过滤；明确单一投递者 | Cody #5 · #6 |
| 24 | 🟠 | 契约/一致性 | `server.mjs:29`（死常量）；`scripts/fork-loop-mcp/README.md:18`；`mailbox-cycle.test.mjs:40` | **Schema 版本口径不一**：传输层常量写 `spec-executor-receipt/v1`（**声明后从未被使用**，`extractReceipt:109-113` 只按标题切分），README 数据流图写"提取 RECEIPT v1"，测试 fixture 也用 v1；而门与生产 prompt 已是 v2 | 删除死常量；README/测试统一为 v2；ADR 0005 的 v1/v2 并现需标注 | Cody #8 · Tessa 2.7 · Archi A6 · **主理人复核** |
| 25 | 🟠 | 架构/演进 | `docs/evals/SCOREBOARD.md:14`；`docs/evals/PROTOCOL.md:48` | **"散文 vs 机械门"判据未成文**：tdd 单任务跑了 **6 轮 / pass rate 1/6**（聚合 3/8），最终靠双机械门 + SKILL 条款收口。判据只散在证据文件里，无成文规则 → 下一类"顺序性/不可见性违规"仍会重复 6 轮试错 | 把判据写进 ADR：**必须机械化**＝判定(a)最终工件中不可见(b)已跨任务重复失败(c)可机械判定；**可留散文**＝语义/品味/一次性判定 | Archi A13 |
| 26 | 🟠 | 架构/抽象 | `skills/engineering/ask-matt/SKILL.md:57`；`docs/engineering/execute-spec-in-fork.md:3,21,25,83`；`execute-spec-in-fork/SKILL.md:108-149` | **传输抽象泄漏 + 文档镜像滞后一代**：ADR 0003:12 立规"harness 名只活在 capability map"，但 Codex 专名散落 SKILL 正文并作为顶层并列节；`ask-matt:57` 仍称该 skill 是"the Codex App adapter"（ADR 0005 后已是三传输）；docs 镜像页整篇只讲 Codex、**完全没提 fork-loop/ZCode 路由**——而 `lint-skills.mjs:336` 只校验 docs 页存在、不校验内容 | Codex-only 步骤收进"Codex App route"小节；修正 `ask-matt:57` 与 docs 镜像；docs 加"关键短语须出现在 SKILL.md"软校验 | Archi A10 |
| 27 | 🟡 | 性能/健壮性 | `server.mjs:155-160` | runner stdout/stderr **无上限累积**（`out += d`）；存储侧截尾 2000 字符，但内存里始终是全量 → 跑偏的 runner（死循环 println）可撑爆内存 | 设输出上限（如 5MB）超限截断并标记；或只保留尾部环形缓冲 | Cody #4 |
| 28 | 🟡 | 正确性/契约 | `server.mjs:126,144,316` | **`max_turns` 是死参数**：inputSchema 对外宣称"Optional --max-turns cap"，`spawnExecution` 也透传，但 `runHeadless` 形参未用、args 里根本没拼 `--max-turns` → 宣称的续跑上限完全失效（误导 API） | 接上 `--max-turns`，或删除 schema 字段并更新描述（注意 `:138-139` 注释称该 flag 会 abort，需明确口径） | Cody #7 |
| 29 | 🟡 | 正确性 | `server.mjs:109-113` | **`extractReceipt` 取首个标记块**：`indexOf` + `slice(idx)` 到结尾。若 runner 回显了含模板标题的 prompt，会提取到"模板"而非真实 receipt → gate 全 FAIL | 取**最后**一个标记块，或用 `=== RECEIPT BEGIN/END ===` 哨兵界定 | Cody #12 |
| 30 | 🟡 | 健壮性 | `stop-hook.cjs:68` | `box.receipts.find(...)` 未防 `receipts` 缺失/非数组；收到畸形 mailbox（如 `{}`）抛未捕获 TypeError → 钩子非零退出，可能阻断 Stop 流 | 读入后校验 `Array.isArray(box.receipts)`，否则静默 exit 0 | Cody #13 |
| 31 | 🟡 | 供应链 | `fork-guard.yml:40` | `npx --yes @anthropic-ai/claude-code plugin validate . --strict` 在 CI 拉**未固定的最新版**第三方包 → 供应链/可复现性风险（门非幂等） | 固定版本或纳入 devDependencies 锁定 | Cody #14 · Rex |
| 32 | 🟡 | 契约漂移 | `README.md:9-10,507`；`server.mjs:27` | **版本/身份信息 5 处散布，同步机制只覆盖 2 处**：`package.json`/`.claude-plugin`/`.codex-plugin`/README 两个 badge/`server.mjs:27`（独立版本 1.0.0）；上游 sha 基线 `README.md:507` 纯手工。README badge 与上游 sha **无任何机器校验** → 静默过期 | `build-codex-plugin` 并入 `npm run version`；新增 `sync-identities.mjs --check` 覆盖 README badge + 上游 sha；`server.mjs` 版本从 `package.json` 读 | Archi A5 · Rex 断点B |
| 33 | 🟡 | 架构/收口 | `execute-spec-in-fork/SKILL.md:10-14`；`ask-matt:57`；两个 plugin manifest | **新增第 4 条 harness 的边际成本 ≈ 7–8 个文件**，收口点分散在 3 处 prose + 2 处 manifest，漏一处即"路由撒谎"（`check-router.mjs` 只查名字是否被提及、不查描述是否准确） | 建 `transports/registry.json`（name/detect 谓词/capability map/契约入口），SKILL 检测列表、README 表、manifest MCP 条目由它生成 | Archi A11 |
| 34 | 🟡 | 状态管理 | `.gitignore:1-9`；`tdd-slice-gate.mjs:30`；`.scratch/receipt-stdin/` | **可变状态未全部纳入 `.gitignore`**：`.zcode/` 已覆盖（好），但 `.tdd-slice-log.jsonl`（落 cwd）与 `.scratch/<feature>/` 未忽略，且仓库内**实际存在** `.scratch/receipt-stdin/{spec.md,receipt.md}` → 误提交造成漂移与评审噪音 | 补 `.tdd-slice-log.jsonl`（或改写到 `.zcode/`）与 `.scratch/`；明确区分"追加台账应入库"与"可变状态不入库" | Archi A12 |
| 35 | 🟡 | 门入口 | `package.json:22`；`tdd-slice-gate.mjs:177-184` | **`gate:slice` 入口是坏的**：无参调用 → 走到末尾 → 打印 usage 并 `exit 1`。"用 `npm run gate:slice` 做检查"会**永远失败**；切片门也未接任何 npm/CI | 修正入口使其带 `--verify`，或明确文档化用法；`--check` 接 CI | Tessa 2.4 |
| 36 | 🟡 | 正确性/接缝 | `server.mjs:39` vs `stop-hook.cjs:38,47-49` | **hook 与 server 的 mailbox 目录仅在无 env 时对齐**：server 认 `FORK_LOOP_STATE_DIR`，stop-hook **不认**（硬找 `<checkout>/.zcode/fork-loop/mailbox.json`）→ 该接缝从未被解释或测试（伪测试恰恰设了该 env） | 统一状态根解析（抽公共函数）；补覆盖该 env 的测试 | Tessa 2.7 |
| 37 | 🟡 | 测试判定力 | `sync-plugin-version.mjs:22-27`；`receipt-gate.test.mjs:172-176` | **"不一致 → exit 1"分支从未被断言**：`sync-plugin-version --check` 与 `receipt-gate --check` 的负例都无覆盖 → 若退化为恒 exit 0，CI 静默放行漂移 | 各补 1 条负例断言（改坏副本 → 期望 exit 1） | Tessa 2.5 / 2.1 |
| 38 | 🟡 | 性能 | `lint-skills.mjs:51-82` | `--diff-audit` 对每个 inherited skill **单独起一次** `git diff --numstat`（N 次子进程） | 合并为一次 `git diff --numstat -w ref...HEAD -- skills/...` 后按路径分组 | Cody #15 |
| 39 | 🟡 | 维护性 | `receipt-gate.mjs:104-150`；`test-coupling-gate.mjs:31-60`；`tdd-slice-gate.mjs:35-60` | **重复逻辑**：receipt-gate 内两份近乎逐行相同的 porcelain 解析；两个门脚本各复制一份 `isTestFile/walk/SKIP_DIRS`（逐字相同） | 抽公共 util 模块（porcelain 解析、测试文件发现） | Cody #16 |
| 40 | 🟡 | 文档/一致性 | `README.md:480,409` | **"32 个 promoted Skills"是散文计数**：`lint-skills.mjs:242-243` 只校验链接集合等于 promoted 目录集合，**不校验数字** → "32/25/7" 可原地漂移；`:409` 的示例输出会随真实计数过期 | `lint-skills.mjs` 断言 `promoted.size` 与 README 中 `\b(\d+)\b\s*(个)?\s*promoted` 一致，或改 README 为生成式占位符 | Archi A7 |
| 41 | 🟢 | 运维 | `.githooks/pre-push:2-3` | **`core.hooksPath` 未激活**（本机实测未设置）→ pre-push 守卫形同虚设；激活只是文件头注释里的手工步骤，无安装脚本也无校验 | 增 `npm run setup:hooks` 并在 README 强制；CI 校验该配置 | Rex §6 |
| 42 | 🟢 | 运维 | `server.mjs:76-86` | **lock 无 PID 存活校验**，崩溃后锁被占满 6h；无显式快速清理命令（`release_execution` 的存在仅在 `fork-loop-mcp/README.md:100` 一句带过） | 记录 PID + 存活校验；提供文档化的解锁 runbook | Rex §6 |
| 43 | 🟢 | 测试 | `receipt-gate.test.mjs:40-47,73,134-164` | **测试半密闭 + 冗余**：compliant fixture 内嵌**真实 `git status --porcelain`** → 必须在干净 git 仓且无并发写入时才绿（随宿主环境漂移）；AC6 与 AC2–AC5 用例重复，零新增覆盖 | fixture 改为静态 golden 或显式注入 checkout；删冗余用例 | Tessa 2.1 |
| 44 | 🟢 | 健壮性 | `server.mjs:55-60,397-402` | 磁盘满时 `saveMailbox` 抛错（被 catch 成 isError），无重试、无持久化现场 | 错误落盘到日志文件 | Rex §6 |

---

## 🔁 重基线复审（主理人对**当前**工作树重跑）

### 复核命令与结果

| 校验项 | 命令 | 会话开始基线 | **当前工作树** |
|---|---|---|---|
| Codex 插件载荷 | `node scripts/build-codex-plugin.mjs --check` | ❌ EXIT=1（7 项漂移） | ✅ **EXIT=0 "codex plugin payload fresh"** |
| **新 CI 门整体** | `npm run verify:all` | （当时不存在） | ❌ **EXIT=1，10/11** —`append-only` 报 `script missing: scripts/append-only-gate.mjs` |
| receipt 契约自检 | `node scripts/receipt-gate.mjs --check` | ✅ EXIT=0 | ✅ EXIT=0 |
| mailbox 伪测试 | `npm run test:mailbox-cycle` | 未接 CI | ❌ **EXIT=0，`# tests 1 / # pass 1 / # fail 0`——0 断言却绿** |
| 命令注入 sink | `server.mjs:153` | `shell: process.platform === 'win32'` | **逐字未变** |
| v1 死常量 | `server.mjs:29` | `RECEIPT_SCHEMA_LINE = …/v1/i` | **逐字未变** |
| 超时单次 kill | `server.mjs:163` | `child.kill()`（无 SIGKILL 升级） | **逐字未变** |
| `AGENTS.md`（**已提交**版本） | `git rev-parse HEAD:AGENTS.md` | blob **9 字节**，内容 = 字面量 `CLAUDE.md` | 仍 9 字节（工作树里被改成 863 字节，**未提交**） |

### 发现状态映射

**A. 已被并发修改修复（4 项）**

| 原发现 | 现状 |
|---|---|
| #1 Codex 插件载荷漂移 / CI 红 | ✅ 已重生成（`.codex-plugin/` 6 个文件改动），`--check` 转绿 |
| #6 CI 不执行任何测试 | ✅ `fork-guard.yml` 重写为 `npm run verify:all`（8 个 guard + 3 个测试套件）+ `fetch-depth:0` + `verify:upstream` fail-closed |
| #20 `--diff-audit` warn-only 且未接 CI | ✅ `verify:upstream` = `lint-skills.mjs --diff-audit upstream/main` 已进 CI；注释明示 fail-closed（无上游 ref 时 exit 2 而非假绿）——**正是修掉了旧审查 F1 的 `catch{continue}` 假绿** |
| #41 `core.hooksPath` 未激活 / pre-push 空转 | ⚠️ `.githooks/pre-push` 已改（+21 行）指向 `verify:all`；但**激活仍是手工步骤**，本机实测 `core.hooksPath` 仍未设置 → **降级为部分修复** |

**B. 未被触碰 → 发现按原样开放**（这些文件不在 `git status` 的修改清单里）

`scripts/fork-loop-mcp/server.mjs` · `stop-hook.cjs` · `test/mailbox-cycle.test.mjs` · `scripts/receipt-gate.mjs` · `scripts/receipt-gate.test.mjs` · `scripts/sync-upstream.sh` · `scripts/sync-local-skills.sh` · `scripts/sync-drill.sh` · `scripts/check-router.mjs` · `scripts/tdd-slice-gate.mjs` · `scripts/test-coupling-gate.mjs` · `scripts/sync-plugin-version.mjs` · `.gitignore` · `docs/**` · `.agents/**` · `skills/**`（源码层）

→ **仍开放**：#2 #3 #4 #5 #7 #10 #11 #12 #13 #14 #15 #16 #17 #18 #19 #21 #22 #23 #24 #25 #26 #27 #28 #29 #30 #31 #33 #34 #35 #36 #37 #38 #39 #40 #42 #43 #44

其中需要特别盯住的（**全部集中在 fork 自建基建，一处都没被那次修改碰到**）：
- **#2 Windows 命令注入**（`server.mjs:153` 逐字未变）
- **#3 / #4 锁互斥可被绕过**（`:92-94`、`:74-88` 未变）
- **#5 超时无 SIGKILL 升级**（`:163` 未变）
- **#7 恒真伪测试**（文件未变，**但现已被接入 CI，性质恶化——见 #46**）
- **#10 `stop-hook.cjs` 零测试**
- **#15 `sync-upstream.sh` 恒真死守卫 + 冲突无 trap**
- **#13 / #14 `receipt-gate` 门禁强度**（`MARKER_RE` 无词边界 / `FIELD_RE` 误切）

**C. 未复核**：#8（`package.json:13` 的 `version` 脚本**仍未见 `build-codex-plugin`**，倾向仍开放）、#9（`build-codex-plugin.mjs` 已 +23 行，是否修掉 `rmSync` 删 `hooks/` 未逐行复核）。

### 🆕 并发修改引入的新发现

| # | 严重度 | 类别 | 文件:行 | 问题描述 | 建议修复 | 来源 |
|---|--------|------|---------|---------|---------|------|
| 45 | 🔴 | 引用完整性/CI | `package.json:27`；`scripts/verify.mjs:63`；`.github/workflows/fork-guard.yml:36,40` | **三处引用一个不存在的脚本 `scripts/append-only-gate.mjs`**（全仓无此文件）。实测 `npm run verify:all` → **EXIT=1，10/11**，`append-only` 报 `script missing`。由于 `fork-guard.yml:31-32` 第一步就是 `verify:all`，**CI 依然是红的**——只是从"载荷漂移"变成了"脚本缺失" | 补上 `scripts/append-only-gate.mjs`（含 `--check`/`--range` 两种模式）；或在脚本落地前把该 guard 与两处 workflow 步骤从清单摘除 | 主理人实测 |
| 46 | 🔴 | 测试质量/CI | `scripts/verify.mjs:83`；`package.json:28`；`mailbox-cycle.test.mjs:57` | **恒真伪测试被正式接入 CI，把"假绿"制度化**：`test-mailbox-cycle` 进入 `verify.mjs` 的 `TESTS` 与 `verify:all`，实测 `# tests 1 / # pass 1 / # fail 0`——**整份文件 0 个断言**（只有 `console.log('…correct'/'WRONG')`），第 57 行无条件 `process.exit(0)`。从此 CI 的"绿"里永久含一个不可能的失败 | 先重写为真测试（`node:test`+`assert`，覆盖 exactly-once / lock 冲突 / ack 释放锁），再保留 CI 接线；**顺序不能反** | 主理人实测 |
| 47 | 🟠 | 指令完整性 | `AGENTS.md`（HEAD blob） | **已提交的 `AGENTS.md` 是坏的**：`git rev-parse HEAD:AGENTS.md` 的 blob **仅 9 字节**，内容就是字面量 `CLAUDE.md`。`CHANGELOG.md:59` 声称「Add `AGENTS.md` as a symlink to `CLAUDE.md` so Codex reads the same repo instructions」——在 `core.symlinks=false` 的环境（本机实测）下它被物化成文本文件，于是 **Codex 读到的"仓库常驻指令"只有一行 `CLAUDE.md`**；`.codex-plugin/` 镜像的同类问题亦存在。工作树里已被并发会话改成 863 字节正常内容，但**尚未提交** | 提交工作树版本；或在 `AGENTS.md` 里放入真正的指针内容（而非依赖 symlink）；并加一条 guard 断言 `AGENTS.md` 字节数 > 阈值 | 主理人实测 |
| 48 | 🟡 | 测试缺口 | `scripts/verify.mjs`（新增，无测试） | **"所有门的唯一入口"自己没有测试**：`GUARDS`/`TESTS` 表里的 `script`/`file` 字段与实际文件存在性无一致性校验。实测已证明该缺口真实——#45 正是从这个口子漏出去的（`verify.mjs` 自己会报 `script missing`，但没人写断言把它拦在合并前） | 加 `verify.test.mjs`：断言 `GUARDS`/`TESTS` 中每个 `script`/`file` 都能 `existsSync`；再断言 `--list` 输出稳定 | 主理人发现 |

---

## 🛠️ P0 修复执行记录（本轮，2026-09-14 17:20–17:50）

| P0 | 状态 | 动作 | 验证证据 |
|---|---|---|---|
| **P0-1** `append-only-gate.mjs` 缺失 | ✅ **已闭环**（由并发会话实现，主理人独立核实） | 无需额外动作——文件已落地 | `scripts/append-only-gate.mjs` 存在（182 行，含 `--check` 自检与 `--range` 模式）；`verify:all` 报 `ok append-only`；整体 **11/11 EXIT=0** |
| **P0-2** 恒真伪测试 | ✅ **本轮修复** | `scripts/fork-loop-mcp/test/mailbox-cycle.test.mjs` 全文重写为 `node:test` + `node:assert/strict` 真测试（**13 条断言**），删除 `:57` 的无条件 `process.exit(0)`，fixture 统一为 `receipt/v2` | ① **13/13 pass**；② **变异测试**：把 `server.mjs` 的 `mail.state = 'delivered'` 改成 `'pending'` → **2 条测试变红 / EXIT=1**，恢复后 13/13 / EXIT=0 且文件哈希一致 → **证明测试有判定力，非恒真** |
| **P0-3** Windows 命令注入 | ✅ **本轮修复** | `server.mjs:167`：`shell: process.platform === 'win32'` → **`shell: false`**；新增 `normalizeCheckout()`（`realpathSync` + 目录断言），`spawnExecution` 改为使用它 | ① 裸 `node` 在无 shell 下**仍能解析**（`{"code":0,"out":"v22.22.2"}`）→ 行为未退化；② `&` / 空格 / `%` 保持**字面 argv、绝不执行**；③ **对照实验**：同一载荷在 `shell:true` 下确实执行了 `&& echo __INJECTION_MARKER__` → 证明原 sink 真实存在、现已关闭 |

**P0-2 的真正意义**：修复前 `npm run verify:all` 已经 **11/11 全绿**，其中 `test-mailbox-cycle` 贡献的是一个**零断言**的绿——即"CI 全绿"本身不可信。修复后同一入口仍是 11/11，但这个绿现在有判定力。**"顺序不能反"得到了遵守**：先让测试变真，再让它继续待在 CI 里。

**本轮仍未处理（按用户指定的范围）**：
- **P0-4 锁互斥**：`settle()` 不校验 `task_id`、`acquireLock` 的 mkdir/写 task.json 竞态、超时无 SIGKILL 升级——本轮 `server.mjs` 只改了 spawn 的 shell 与 checkout 校验，**锁相关代码一行未动**，该 P0 仍完全开放。
- **P0-5 已提交的 `AGENTS.md`** 仍是 9 字节坏文件（工作树里已是正常内容，**尚未提交**）。
- **防回归缺口**：`scripts/verify.mjs` 没有"列在 `TESTS` 里的文件必须真的注册测试"的断言。没有这道闸，**恒真测试可以原地再回来**——建议作为下一步（原发现 #48）。

---

### 第二轮：P0-4 锁互斥 / P0-5 AGENTS.md / 防回归缺口

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **P0-4a** 陈旧 ack/fail 释放**他人**的锁 | ✅ | `settle()` 不再无条件 `releaseLock()`，改用 `releaseLockIfHeldBy(checkout, entry.task_id)`；返回值新增 `lock_released` / `lock_note` | 新测试「a stale ack for another task must NOT release the live lock」；**变异测试**：把 scoped release 还原为无条件释放 → 该测试立刻变红（19/20, EXIT=1） |
| **P0-4b** `acquireLock` 竞态（mkdir 先于写 `task.json`） | ✅ | holder 缺失不再被读成 `startedAt: 0`（⇒ 无限旧）；改为回退到**目录 mtime** + 独立的 `ORPHAN_LOCK_MS`（15 分钟）宽限；holder 已知时仍用 `STALE_LOCK_MS`（6 小时） | 新测试「a lock with no recorded holder is refused, never stolen」+「an orphan lock past the grace is broken and the run proceeds」 |
| **P0-4c** 超时单发 kill、无升级、Promise 可能永不 settle | ✅ | 抽出 `RUNNER_TIMEOUT_MS` / `KILL_GRACE_MS`（可由 env 覆盖，以便测试）；新增 `killRunnerTree()`（win32 → `taskkill /PID <pid> /T /F`，其余 → SIGKILL）；`finish()` 幂等收口，宽限到期**无条件 settle** | 新测试「a runner that overruns the timeout is killed and the call still settles」 |
| **P0-4d** `release_execution` 无条件放锁 | ✅（**行为变更**） | 现在要求 `task_id` 匹配或显式 `force:true`，否则拒绝并报出当前 holder | 三个新测试：无参拒绝 / task_id 命中放锁 / force 幂等 |
| **P0-5** 已提交的 `AGENTS.md` 是 9 字节坏文件 | ✅ | 提交 **`e99af92`**（仅 `AGENTS.md` 一个路径）：committed blob **9 → 863 字节** | `git cat-file -s HEAD:AGENTS.md` = **863** |
| **防回归** 恒真测试可以原地回来 | ✅ | `verify.mjs` 在运行每个 `TESTS` 条目**之前**做形状断言：必须 import `node:test`、至少一个 `test(`、import `node:assert`、调用 `assert.*`、且**不得以 `process.exit(0)` 结尾** | **反证**：把 mailbox 测试换回旧的 `console.log + process.exit(0)` 样貌 → `verify:all --only test-mailbox-cycle` **FAIL**，并逐条列出 5 项缺失 |
| **新增护栏** `AGENTS.md` | ✅ | 新增 `scripts/agents-md-gate.mjs`（`--check` 对 5 个 fixture 自检 + 校验真实文件），已注册进 `verify.mjs` 的 `GUARDS` | `agents-md-gate --check` → **OK (5 fixtures)**；`verify:all` → **12/12** |

**一处必须说清楚的诚实说明（win32 实测）**：我用探针验证了"孙子进程挂住父进程 stdout 管道"这个假设——**它在本平台不成立**：runner 被杀后 **311ms** `close` 就触发了，而孙子进程仍然存活（`grandchildpid` 可见）。所以"管道被挂住导致永久挂起"这个具体场景**无法在 win32 复现**；`killRunnerTree` 的升级是**兜底**（应对礼貌 kill 失败或不生效），不是这条测试能强制的路径。测试因此只断言确定性事实：**调用会返回、失败运行会进信箱、锁随后可释放**。我没有为了让测试"变绿"而把它删掉，也没有把它写成断言 -1 的假红。

**副产物（提交时暴露的仓库健康问题）**：`git commit` 触发的自动 gc 报

```
fatal: bad object refs/tags/mattpocock-skills@1.0.0
error: Could not read 6654f6b60cd9d5be8b54c6fafe44346dabeb3b76
```

提交本身成功（`e99af92`），但**这个坏 tag ref + 缺失的上游基线对象会让每次自动 repack 都报错**，值得单独清理一次（与仓库自身的 `recovery: full fork content onto origin base c21c343` 那条历史吻合）。

---

### 第三轮：归档门强度 / Gate 6 作用域 / 上游同步硬门 / 发布链 / 忽略规则

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **归档门强度**：`MARKER_RE` 无词边界 | ✅ | 改为 `\b(?:pass\|passed\|fail\|failed)\b\|✅\|❌`；`evidencePresent` 复用同一词表（抽出 `EVIDENCE_RE`，消除两处正则各自演化的可能） | 新测试 **AC9**：`- implement bypass logic` 现在 **Gate 4 FAIL(101004)**；对照组（同一句话 + 真标记）放行。**变异测试**：还原无边界正则 → AC9 立刻变红 |
| **字段解析误切**：`FIELD_RE` 把 `- AC1: …` 当字段 | ✅ | `contracts/receipt-v2.json` 新增 `fields` 白名单（18 个），解析器只认白名单内的名字 | 新测试 **AC10**：以 `- AC1: …` 标注的验收条目不再把 Acceptance criteria 截成空 → **6/6 放行**。**变异测试**：去掉白名单锚定 → AC10 立刻变红 |
| **Gate 6 校验错树** | ✅ | `actualWorktreePaths(worktreeDir)`；新增 **`--checkout <dir>`**（默认 cwd，取代原先硬编码的"脚本所在仓库"）；FAIL 消息带上被比对的树 | 新测试 **AC11**：同一份 receipt，`--checkout <干净临时仓>` 放行、`--checkout <脏临时仓>` 报 **101006** 并点名 `phantom-drift-file.ts` |
| **上游同步死守卫** | ✅ | 删除永远为真的 `git merge-base --is-ancestor "$base" upstream/main`；替换为**真实**守卫：拒绝无关历史；README 记录的基线不再是上游祖先时告警（上游被强推的信号） | `bash -n` 通过（Git Bash 可用） |
| **同步冲突无 trap** | ✅ | 新增 `trap cleanup EXIT`：rebase 未完成且存在 `rebase-merge` 状态时 **`git rebase --abort` + 回到备份分支**，并打印前滚方式；`sync_failed` 补上 `git reset --hard <backup>` | `bash -n` 通过 |
| **同步后置校验集 < pre-push** | ✅ | 补齐 `check:router`、`build-codex-plugin --check`、`receipt:gate --check`，与 pre-push/CI 对齐 | 逐条核对 |
| **文档与脚本矛盾** | ✅ | `docs/maintaining-fork.md`：删掉"冲突就继续 rebase"（与脚本行为相反），改为"冲突即中止并复原"；新增 **When a sync fails** 四行 runbook 表 | 文档与脚本逐条对齐 |
| **发布链断点 A**：`npm run version` 不重建 codex 载荷 | ✅ | `package.json` 的 `version` 追加 `&& node scripts/build-codex-plugin.mjs` | JSON 可解析；`verify:all` 绿 |
| **发布链断点 B**：README 版本徽章无人校验 | ✅ | `sync-plugin-version.mjs` 升级为**版本身份**守卫：package.json ↔ `.claude-plugin` ↔ README `fork-` 徽章（含 shields.io 的 `-`→`--` 转义） | **反证**：把徽章改成旧版本 → `--check` **EXIT=1** 并同时报出两个值；写模式又把它改回正确值 |
| **可变状态未忽略** | ✅ | `.gitignore` 增补 `.scratch/`（本地 tracker）与 `.tdd-slice-log.jsonl`（切片门台账） | `git check-ignore -v` 命中 `.gitignore:14` 与 `:18` |

**首轮遗留的 #9 已被并发会话修掉**：`build-codex-plugin.mjs` 的 `generate()` 现在会镜像 `.claude-plugin/hooks/`，`buildManifest()` 也补齐了 `mcpServers` —— 重新生成不再会静默删掉 Codex 的 Stop 钩子。

**一处必须说明的行为变更**：`receipt-gate.mjs` 在契约缺少 `fields` 时**直接 `exit 9`**（内部错误），而不是静默退回旧的宽松解析——静默退回等于把刚补上的漏洞再放回去。

**结果**：`npm run verify:all` → **12/12**；`receipt-gate.test.mjs` → **16/16**；`mailbox-cycle.test.mjs` → **20/20**。

---

### 第四轮：提取鲁棒性 / 契约自洽 / 传输注册表 / 仓库对象库诊断

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **`extractReceipt` 取首个标记块** | ✅ | 改用 `lastIndexOf`。启动提示词**本身内嵌一份 receipt 模板**（同一标题，且同样满足 schema 校验），"首个匹配"会把**模板**当成结果存进信箱——门随后因此否掉真实工作，而操作者从信箱里看不出原因 | 新测试（stub runner 先回显模板、再输出真结果）：`receipt_extracted: true`，存下的块含 `Conclusion: completed` 且**不含** `<exactly one single token`。**变异测试**：还原 `indexOf` → 该测试立刻变红 |
| **`max_turns` 死参数** | ✅ | 从 `spawn_execution` 的 inputSchema 删除，并写明理由：runner 的严格解析器遇 `--max-turns` 会以 "Unknown option" 直接 abort，所以这个上限**永远不可能生效**。`runHeadless` 同时去掉未使用的形参 | 新测试断言 schema 不再 advertise `max_turns`；传入该属性仍被忽略而非报错（兼容） |
| **传输注册表**（原"没有单一收口点"） | ✅ | 新增 `contracts/transports.json`（3 条传输：检测 token / route 段标题 / 实现文件 / 决策 ADR）+ `scripts/transport-gate.mjs`，注册进 `verify:all`。它**不生成散文**（措辞仍由技能自己负责），只拒绝让注册表与技能的检测列表**静默分叉**——这正是"新增 harness 要手工改 7–8 处、漏一处即路由撒谎"的解药 | `--check` **OK (4 fixtures)**；**反证**：把 `## Manual fallback runbook` 改名 → 闸报 `"manual-runbook" is registered but its route section is missing` 并 EXIT=1 |

#### 仓库对象库：修了什么、没修什么（首轮提交时暴露的问题）

1. **已修复 —— 7 个悬空 tag ref。** 逐个核对对象可用性后删除（这些对象在本地与远端都不存在）：`mattpocock-skills@1.0.0`、`v1.0.0`、`v1.0.1`、`v1.1.0`、`v1.2.0`、`v1.2.2`、`v1.2.3`。修后 `git fsck` 的 `invalid sha1 pointer` 从 **7 条降到 0 条**。这批 ref 正是 `git fetch` 与几何 repack 失败的直接原因。
2. **未修复（超出授权范围，需人工决策）—— 祖先链断裂。** `is-shallow: false`，但 **`git rev-list --count HEAD` 直接失败**：提交 `3cca18b` 记录的父对象 `6654f6b`（README 里记的上游基线）**不存在**，`git cat-file` 取不到；表现为 `fatal: Failed to traverse parents of commit 3cca18b` 与 17 条 `invalid reflog entry`。**后果**：`git fetch upstream`（也就是 `sync-upstream.sh` 的第一步）在当前 clone 上**仍然失败**（`did not send all necessary objects`），几何 repack 也仍会失败。
3. **我没有做历史手术。** 这类修复（`git fetch --unshallow` / 重建 graft / 重新 clone 后重放大批未提交改动）会改写仓库结构，属于必须由人决定的操作。**工作树本身完好**——全部未提交改动与已提交的 `e99af92` 均未受影响。
4. 附注：这些对象**在我动手之前就已缺失**（本轮第一次 `git commit` 时就报了 `Could not read 6654f6b…`），不是本轮引入的。

**结果**：`npm run verify:all` → **13/13**；`mailbox-cycle.test.mjs` → **22/22**；`receipt-gate.test.mjs` → **16/16**。

---

#### 补充（第五轮）：对象库问题的完整根因与修复决策

**根因已确定（非推断）**
- `6654f6b`（README 记录的上游 v1.2.3 基线）是本地历史断口缺失的父对象，被两处引用：
  - `f14eb162` —— fork 的第一个提交（"Matt skills with to-goal (v1.2.3-to-goal.2) + fork hardening batch"），`parent 6654f6b`；
  - `3cca18b` —— **Matt Pocock 本人的合并提交**（带 GPG 签名、committer = GitHub），`parent 6654f6b` + `8666e05d`。
- **该对象已不在任何可达历史里**：`git fetch upstream <sha>` 与 `git fetch origin <sha>` 均被拒（`did not send all necessary objects`）。**因此"补拉对象"这条修复路径在物理上不存在。**

**已完成的止血（全部可逆）**
1. 删除 7 个悬空 tag ref → `git fsck` 的 `invalid sha1 pointer` **7 → 0**。
2. 本仓 `.git/config` 关闭自动维护：`maintenance.auto=false`、`gc.auto=0`、`fetch.writeCommitGraph=false`。
3. 效果：`git fetch --tags origin` 与 `git fetch upstream main` 现在**完全干净、EXIT=0**（此前会刷 fatal 并使 fetch 失败）。

**当前可用性边界（实测）**

| 操作 | 状态 |
|---|---|
| `git status` / `git log -3` / `git commit` / 全部测试套件 | ✅ 正常 |
| `git fetch`（origin / upstream） | ✅ 干净，EXIT=0 |
| `git log --oneline -200` | ⚠️ 走到 **40 个提交**即停（断口处） |
| `git rev-list --count HEAD` / `git fsck` | ❌ 报错（EXIT=128） |
| **`git merge-base HEAD upstream/main`** | ❌ **EXIT=255** → **`sync-upstream.sh` 在本 clone 上不可能工作** |

**三条修复路径（需人工选择；本轮未擅自执行）**

| 方案 | 做什么 | 效果 | 代价 / 风险 |
|---|---|---|---|
| **A. 浅边界（`.git/shallow`）** | 把 `f14eb162` 标为历史根，让 git 把它当作**合法的浅克隆** | `rev-list` / `fsck` / 深度 `log` 的报错消失；`merge-base` 从"崩溃"变为**明确返回"无共同祖先"**——即本轮新加的守卫会给出清晰拒绝而非堆栈 | 2 行、完全可逆（删行即回）。**不恢复** `sync-upstream` 能力 |
| **B. 重新锚定到当前上游（真正的修复）** | 把 fork 侧提交重新嫁接到**当前** `upstream/main`（`git commit-tree` re-rooting——与本仓历史上 `fork-reanchored-20260914`、`recovery-onto-3cca18b` 是同一手法） | 历史完整 + `merge-base` 恢复 + **`sync-upstream` 重新可用** | **高**：重写本地分支历史；**工作树里现有 30+ 未提交文件（另一会话在途），必须先提交**，否则会被卷进重写 |
| **C. 维持现状 + 保留止血（建议先做）** | 保留上述配置，不动历史 | 本地开发 / 提交 / 测试全部正常；`fetch` 干净 | `sync-upstream` 仍不可用；需记住本 clone 不能做上游同步 |

**建议**：**先 C**——工作树里有 30+ 未提交改动，此时做 B 会把它们一并卷入历史重写；等那批改动提交、工作树干净后再做 **B**。A 可作为可选的"外观清理"，让工具不再报错。

#### 第六轮：修复被网络卡死（本轮结论）

1. **缺失机制已确认。** 当前上游 tip `3cca18b` 缺失的父正是 `6654f6b`（实测 `FETCH_HEAD` == `upstream/main` == `3cca18b`）。而 **git 不会为"已经拥有的提交"重新拉取其祖先**——本地已有 `3cca18b`，于是普通 `git fetch` 报 "everything up to date"，一个对象也不下载。这解释了为什么反复 fetch 都补不回来。
2. **修复被网络阻塞，不是技术问题。** 诊断时 `origin` 与 `upstream` **两个远端均不可达**（`CONNECT tunnel failed, response 502` —— 代理网关故障；此前 `git fetch upstream main` 曾成功一次，属间歇性）。因此 A / B / 重新 clone 三条路**当前都执行不了**。
3. **本轮交付：把完整诊断与修复 runbook 写入 [`docs/maintaining-fork.md`](../docs/maintaining-fork.md) 的「When the local object store is incomplete」**，内容包括：症状清单、诊断命令的**执行顺序**、止血配置及其撤销命令，以及那条关键因果——**先清悬空 tag，再谈补对象**（一个坏 tag 会让几何 repack 失败，进而让**整个 `git fetch` 失败**，看起来像网络故障）。
4. **未变**：C 已就位且验证有效；仓库对本地开发完全健康——`verify:all` **13/13**、`receipt-gate.test.mjs` **16/16**、`mailbox-cycle.test.mjs` **22/22**。

---

### 第七轮：提交批次（工作树已清空）

按主题分 3 组提交，工作树现在**完全干净**（0 条剩余）——因此 `verify:all` 的结果**验证的就是已提交的内容**，而非"工作树恰好是绿的"。

| 提交 | 主题 | 规模 |
|---|---|---|
| `6b65003` | `fix(fork-loop-mcp)`: 关闭命令注入、收窄锁释放、让超时 runner 收口 | 2 文件，+788/−92 |
| `fdacd60` | `feat(guards)`: verify 单一入口、契约驱动的归档门、三个新护栏、同步与版本身份加固 | 37 文件，+1666/−205 |
| `6bbb8c6` | `chore`: 提交审计证据（skill-audit、本报告、out-of-scope 说明） | 3 文件，+723 |
| （早先）`e99af92` | `fix(agents-md)`: 提交真实的 AGENTS.md（9 → 863 字节） | 1 文件 |

**提交后的最终验证（针对已提交内容）**：`npm run verify:all` → **13/13**；`receipt-gate.test.mjs` → **16/16**；`mailbox-cycle.test.mjs` → **22/22**。

**副产品：对象库修复的前提已满足。** 「第五轮」列出的 Option B 需要"工作树干净"这一硬前提——**现在已经满足**，唯一剩下的阻塞是网络（远端 502）。

#### 🆕 提交过程中发现的硬故障：`changeset version` 无法运行

- **现象**：`npx changeset status` → `Error: Found changeset expression-layer-style-pass for package ask-matt which is not in the workspace`。
- **根因**：`.changeset/` 下 4 个 changeset 的 frontmatter 用 **skill 名当包名**（`ask-matt`、`code-review`、`to-goal`、`harvest`、`evals`、`project-standards`…，共 **24 个键**），而工作区里**唯一的包是根 `sam-skills`**（`skills/` 下没有任何 `package.json`）。
- **影响**：`npm run version` 的第一步就是 `changeset version` → **必失败**。也就是说发布链比首轮报告描述的更早断（首轮说"版本 PR 变不绿"，实际是**版本命令根本跑不起来**）。这解释了 `CHANGELOG.md` 里那句 "manual bump（changelog-pat 拿不到）" 背后的真实处境。
- **我做了什么**：本轮的 changeset（`fork-loop-and-gate-hardening.md`）用**合法包名** `sam-skills`，实测 `[OK]`；**没有**擅自改那 4 个既有 changeset——那属于仓库约定决策。
- **已按方案 1 修复（提交 `a6c293a`）**：4 个 changeset 的 24 个键收敛为 `"sam-skills": patch`，**散文逐字节保留**——行数差值恰好等于被收敛的键数，且 `lint-skills` 会读 changeset 文本用于 inherited-skill 的 `--diff-audit` 豁免，所以这点必须确认无虞。验证：`npx changeset status` → `Packages to be bumped at patch: sam-skills`；`verify:all` 仍 **13/13**。
- **未采用的方案 2**：给每个 skill 目录加 `package.json` + 根 `workspaces`，让 per-skill 版本语义真正成立。仓库形态变化较大（约 40 个包），而目前只有根版本（`1.2.3-to-goal.3`）有意义。
- **仍需注意（未修复）**：`.changeset/config.json` 的 changelog 用 `@changesets/changelog-github` 且指向 `opsbli/sam-skills`，本地既无 PAT、远端当前又不可达（502）→ **本地跑 `npm run version` 仍会在 changelog 步骤受阻**。但在 CI（`release.yml` 带 `GITHUB_TOKEN`）该步可用。**所以本次修复真正解锁的是 CI 的版本 PR 路径**——此前 `changeset version` 在**任何**环境都会因未知包名直接失败，版本 PR 连创建的机会都没有。

---

#### 第八轮：对象库**已原地修复**（原"需人工决策"作废）

网络恢复后，我找到了真正的解法——而且它比我列的 A/B/C **都简单**：

```bash
git fetch --refetch --no-tags --force upstream main
```

`--refetch` **不按已有 ref 协商，整包重新下载**。而"协商"正是问题的藏身之处：git 看到自己已经有 tip，就报 "everything up to date"，**永远不会去要缺失的祖先**。这一条命令就把 `6654f6b` 找回来了。

| 指标 | 修复前 | 现在 |
|---|---|---|
| `6654f6b`（上游基线） | 对象缺失 | ✅ **commit** |
| `git rev-list --count HEAD` | ❌ EXIT=128 | ✅ **502** |
| `git log`（完整历史） | 中断 | ✅ **502** 提交 |
| **`git merge-base HEAD upstream/main`** | ❌ EXIT=255 | ✅ **`6654f6b`** → **`sync-upstream.sh` 恢复可用** |
| `git log --all` / `rev-list --all` | ❌ 中断 | ✅ **516**（经 `git replace --graft`） |
| `git fetch`（origin + upstream） | 刷 fatal、退出失败 | ✅ **完全干净，EXIT=0** |
| `git fsck` pointer / reflog / traverse | 7 / 17 / 有 | **0 / 0 / 0** |

**执行序列（无历史手术、无 re-clone）**：① 删除 7 个悬空 tag → ② `git fetch --refetch` 取回缺失基线 → ③ 外科式过滤 `.git/logs/*` 里指向已消失对象的 reflog 行（保留其余） → ④ `git replace --graft 6348c2ef` 恢复全库遍历。

**唯一刻意保留的残留**：1 个 broken link。提交 `6348c2ef`（"Republish home: tt-a1i/matt-skills-with-to-goal -> opsbli/sam-skills"）的父 `be553a9d` 已从所有远端消失，而**文档记录要保留的 re-graft 前备份分支 `backup/pre-graft-20260904-105531` 正指向它**。该分支的价值高于一次干净的 `fsck`，因此保留它，并定向关闭**无法完成的那两项维护任务**（`maintenance.auto=false`、`gc.auto=0`、`fetch.writeCommitGraph=false`，均可逆）。

**结论：A/B/C 三个方案全部作废——原地就能修好。** 完整 runbook（症状 → 诊断顺序 → `--refetch` → reflog 处理 → graft → 何时该关维护）已写入 [`docs/maintaining-fork.md`](../docs/maintaining-fork.md)。

---

### 第九轮：`stop-hook.cjs` —— 补齐首轮 🔴 #10

对象库收尾后，首轮报告的 **🔴 #10（投递钩子零测试）** 被漏下了（它只在泰莎的补测计划里，没进我的行动清单）。本轮补齐。

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **投递钩子零测试** | ✅ | 新增 `scripts/fork-loop-mcp/test/stop-hook.test.mjs`，**12 条真断言**，注册进 `verify:all` | 12/12 通过；`verify:all` **14/14** |
| **malformed mailbox 抛未捕获异常**（原 🔴 #10 / 发现 #13 的另一半） | ✅ | `box.receipts` 缺失或非数组时，`box.receipts.find` 抛 `TypeError` → 非零退出 → **阻断它本该服务的那个 Stop 事件**。现改为静默 pass | 两条新测试（`{}` 与 `receipts: "nope"`）；**变异测试**：去掉守卫 → 这两条立刻变红（10/12） |
| **mailbox 写入非原子**（🟠 #23） | ✅ | 钩子改用 `<file>.<pid>.tmp` + `renameSync`，与 MCP 侧 `writeJson` 同一纪律——两侧都在对同一份 mailbox 做 read-modify-write，撕裂写会丢掉先落地的更新 | 原子性**由构造保证**；见下方"诚实说明" |

**覆盖的 12 项行为**：空 stdin / 不可解析 stdin / 无 mailbox / mailbox 不可读 / 无 `receipts` 数组 / `receipts` 非数组 / session 不匹配（且条目不消耗）/ 正常投递并落盘 `delivered`+时间戳 / 二次 Stop 静默（exactly-once）/ 无 receipt 时注入 WARNING 与 raw tail / 状态目录无残留 / 从嵌套 cwd 向上找到 mailbox。

**一处我自己纠正的不严谨**：第 11 条测试最初被我写成"原子写验证"，但它**没有判别力**——直接写与 tmp+rename 都不留残留文件，两种实现下都通过，属于假信号。已改为如实命名「状态目录无残留」，并在注释里明确：**原子性由构造保证，且刻意不用一条看不见它的测试去声称**。

---

### 第十轮：`spawn_execution` 不再等待（🟠 #19）+ mailbox 跨 checkout 过滤（🟠 #23）

**矛盾点**：技能文档在**同一页**写了两件不可能同时成立的事——第 1 步「runner 退出码与 receipt 是否存在**随工具结果返回**」，第 2 步「**不要阻塞**、继续用规划会话」。而阻塞式实现让 MCP 调用**最长持住规划轮次 90 分钟**，恰好摧毁了 ZCode 路线存在的理由（Stop 钩子在**轮次之间**投递 receipt）。阻塞那侧是错的。

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **spawn 阻塞** | ✅ | 改为**异步**：runner 启动后立即返回 `{ok, task_id, status:'running'}`；运行结束由新的 `recordRun()` 追加 mailbox 条目。tool description 与 SKILL.md 第 1 步同步更正 | 新测试：对一个工作 **2.5s** 的 runner，spawn 必须 **<1.5s** 返回、邮箱为空、锁仍持有，且随后 receipt 确实到达。**变异测试**：改回 `await` → 该条立刻变红 |
| **recordRun 写失败会搁死锁** | ✅ | 条目写不进去时显式 `releaseLockIfHeldBy` + 落日志——运行**已经结束**，不该把 checkout 搁到 6 小时陈旧扫描 | 异常路径不便直测，已注释说明 |
| **check_mailbox 跨 checkout 混投**（🟠 #23） | ✅ | 除 planner session 外**再按 `checkout` 过滤**；两侧都先路径规范化（spawn 传相对路径、poll 传绝对路径时仍能对上） | 新测试：邮箱里有**另一个 checkout** 的待投递条目 → 本 checkout 轮询返回 `mail: null`，且该条目**保持 pending** |

**测试规模**：`mailbox-cycle.test.mjs` **22 → 24 条**；`verify:all` **14/14**。

**过程中门禁抓到我一次**：我改了 `skills/engineering/execute-spec-in-fork/SKILL.md` 却忘了重建 `.codex-plugin/` 镜像 → `codex-payload` 立刻报 `drifted: .codex-plugin/skills/execute-spec-in-fork/SKILL.md`。重建后 14/14。**这正是新护栏该做的事**——上一轮我加的这条门，这一轮就拦住了我自己。

---

### 第十一轮：Windows 与 CI 平台一致性（🟠 #22）+ 修掉我自己引入的一处回归

**先说回归——它是"把要写进 CI 的命令先在本机跑一遍"逼出来的：**

`lint-skills.mjs` 把**整份 changeset 文本**当作继承技能的豁免凭据（`:90-92` 读全部 `.changeset/*.md`，`:131` 做 `changesetText.includes(name)`）。我上一轮把 15 个 per-skill 键收敛成单个 `sam-skills`，**等于把那 15 个技能名从文件里删掉了** → 6 个技能开始报 `no changeset mentioning …`。

**上一轮为什么没发现**：`verify:upstream` **刻意不在** `verify:all` 里（它需要已抓取的上游 ref，放进默认门禁会让每个新 clone 失败），所以我只跑 `verify:all` 时看不见它。这次因为要预跑 CI 命令才撞上。

修法：技能名移入 `expression-layer-style-pass.md` 的**正文**（机制能看见的地方），并写明为什么必须留在正文。

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **豁免被键名收敛删掉**（自引入） | ✅ | 15 个技能名写入 changeset 正文 | `npm run verify:upstream` → **`diff-audit OK`，0 warning**（此前 6 条） |
| **CI 只有 Linux**（🟠 #22） | ✅ | 新增 `guard-windows` job：与 Linux 跑**同一组** `verify:all` + `verify:upstream`，另用 `bash -n` 解析全部 `.sh` | YAML 解析通过（`jobs=guard,guard-windows`；9 步 / 7 步）；本机预跑 job 内每条命令：`verify:all` **14/14**、`verify:upstream` **OK**、**5 个 `.sh` 全部 `bash -n` 通过** |

**为什么值得多花一个 runner**：fork-loop 明确面向 win32，而**所有护栏此前只在 `ubuntu-latest` 上跑过**——`taskkill /T /F` 树杀、无 shell 的 `spawn` 解析裸 `node`、mailbox 与 diff-audit 里的反斜杠路径，这些 **win32 专有分支零覆盖**。贡献者也在 Windows 上工作，而"本地门禁红、CI 绿"正是这个 job 要消除的失败。

**诚实边界（必须写明）**：我验证的是**命令本身**（在本机 Git Bash / PowerShell 上逐条跑通），**不是 GitHub 的 runner 镜像**。`.sh` 的**执行**仍是 Linux-only（`sync-local-skills.sh` 需要 `rsync`，Windows 镜像不带）。另外本机沙箱会把 Git Bash 内层的 `bash` 解析到 WSL stub 并被安全策略拦下——**那是本机策略，不是 runner 行为**（GitHub 的 `shell: bash` 显式指向 Git Bash）。

---

### 第十二轮：修正我自己的过度声明 + 🟡 #27 有界捕获 + 🟡 #31 供应链固定

**先纠正上一轮的措辞**：我写了「首轮报告的全部开放项现已清零」——那只是指**阻塞项**。报告里仍有一批 🟡/🟢 未处理（见本节末尾如实清单）。本轮处理其中两条。

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **🟡 #27 runner 输出无上限累积** | ✅ | 捕获改为**有界尾部缓冲**（默认 2 MB，`FORK_LOOP_MAX_CAPTURE_CHARS` 可覆盖）；条目新增 `runner_output_chars` / `output_truncated`，**截断可见而非静默**；**session id 在每个 chunk 经过时抽取**——它在尾部之前就被打印，只留尾部会把它丢掉 | 新测试：把 receipt 埋在 ~36 KB 噪声之下、上限设 4 KB → 断言 receipt 仍可解析、session id 仍在、保留长度 < 上限。**变异测试**：去掉上限 → 该条立刻变红（24/25） |
| **🟡 #31 CI 供应链未固定** | ✅ | `npx --yes @anthropic-ai/claude-code` → **`@2.1.270`**（＝不固定时今天本来就会解析到的版本：行为不变，但从此冻结） | `npm view @anthropic-ai/claude-code@2.1.270 version` → **2.1.270**；YAML 解析确认 job 内命令已固定 |

**为什么 #27 值得修**：旧实现只存尾部 2000 字符，却把**整条流**留在内存里——而这个进程**同时承载规划会话**。跑偏的 runner 能把 MCP 服务撑爆，等于把整条链路一起拖下水。

**测试规模**：`mailbox-cycle.test.mjs` **24 → 25 条**；`verify:all` **14/14**；`verify:upstream` **OK**。

**仍未处理的 🟡/🟢（如实列出，不粉饰）**：

- 🟡 #38 `lint-skills --diff-audit` 对每个继承技能单独起一次 `git diff --numstat`
- 🟡 #39 两个 tdd 门各自复制一份 `isTestFile/walk/SKIP_DIRS`；`receipt-gate` 内两份 porcelain 解析
- 🟡 #40 README「32 个 promoted Skills」是散文计数，机械校验只保集合不保数字
- 🟢 #42 锁只有 6h 时间戳、无 PID 存活校验
- 🟢 #43 `receipt-gate.test.mjs` 的 compliant fixture 依赖宿主 git 状态（半密闭）+ AC6 与 AC2–AC5 冗余
- 🟢 #44 磁盘满时 `saveMailbox` 抛错被 catch，无落盘日志

---

### 第十四轮：🟡 #38 —— diff-audit 的 N 次 git 子进程

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **🟡 #38** | ✅ | `runDiffAudit` 从「**每个继承技能一次** `git diff --numstat`」改为**一次覆盖全部被审目录、按文件分组**；`--no-renames` 保证每个变更文件单行纯路径（分组不被 rename 花括号语法迷惑）；路径全部用正斜杠（git 在所有平台都打印 `/`，分组不依赖宿主分隔符） | 输出与改前**逐行一致**：25/25 audited、各技能行数相同、6 条 warning 全部标上 `(changeset)`。耗时 **6466ms → 1011ms（6.4×）**，`verify:upstream` **6913ms → 1491ms** |

**一个行为取舍（写明）**：旧实现对「单个技能 diff 失败」是软处理（记 `unreadable` 后继续），新实现是**一次 diff 要么整体成功要么 abort**。这与文件头承诺的 fail-closed 一致（"a diff that errors instead of returning empty → exits 2"），但意味着一次 git 故障会拦下整个审计、而不是只跳过一个技能。我认为这是对的方向：**部分审计比没有审计更危险**——它会打出 `audited 24/25` 然后照样绿灯。

**为什么这个性能修复现在更值钱**：上一轮加了 Windows CI job——这 25 次 git spawn 原本要在 runner 上**跑两遍**，而 Windows 上每次 spawn 更贵。

---

### 第十五轮：🟡 #40 散文计数 + 🟢 #44 mailbox 写失败韧性

| 项目 | 状态 | 改动 | 验证证据 |
|---|---|---|---|
| **🟡 #40 README「32 个 promoted」散文计数无校验** | ✅ | `lint-skills.mjs` 抽取 README 中所有 `<n> promoted` 字样（`32 个 promoted Skills` 与 mini-receipt 的 `OK (32 promoted)` 都命中），**逐个**与 promoted 集合比对；**一个都没有也算失败**（防止有人把那句改没了） | `verify:all` **14/14**（README 现值 32 = 集合 32，通过） |
| **🟢 #44 mailbox 写失败无日志** | ✅ | ① 服务端 `check_mailbox`：写失败 → 侧车 `failures.log` + **仍然投递**（返回 `delivery_persisted: false`）——receipt 已在手，可能的重投好过一次因钩子崩溃而彻底丢失的投递；② `recordRun` 同样落到侧车日志；③ **钩子自身的写**也包上 try/catch | 三个套件 **16/16、25/25、12/12**；`verify:all` **14/14** |

**追下去比报告写的更深**：🟢 #44 原本只是"无日志"，但顺着 `saveMailbox` 的调用方看，**钩子侧**的写失败是未捕获异常——磁盘满会让 Stop 事件整个卡死。这条从 🟢 提到了值得修的档位。

**诚实边界**：写失败路径**无法用跨平台测试模拟**（在 Windows 上把目录设为只读不可靠），所以韧性**由构造保证**，测试不声称覆盖它——与 stop-hook 原子写同一处理。

**剩余 🟡/🟢**：#39（门之间重复的 walk/porcelain 助手）、#42（锁无 PID 存活校验）、#43（fixture 半密闭 + AC6 冗余）。

---

## 🏗️ 架构影响评估（Archi）

### 一个根因，六处症状：**「同一条规则被复写多份，且防漂移不接线」**

A1/A2/A3/A6 是同一个病。`receipt v2` 契约同时存在于 **6 处**：`spec-executor/SKILL.md:70-88`、`server.mjs:215-233`（MCP 提示词里**再嵌一份完整模板**）、`receipt-gate.mjs:44-56`、`delivery/系统设计.md:1391-1397,1565-1580`、`README.md:201-224,134-140`、`.agents/adr/0004:14,32`。改一个必填字段要同步 6 处，漏改即静默分叉——**已经发生过**：ADR 0004:30-34 自recorded了 v1→v2 的静默演进事故；本次审查又实测出 Conclusion token 集三方不一致、Codex 镜像 7 处漂移。

### 传输抽象：主张正确，落地有泄漏

ADR 0003/0005 的架构判断是**克制且正确的**——"一个真 adapter + 诚实 fallback 优于假的可移植层"（`SPEC READY` 进 / `RECEIPT v2` 出，三条传输同一契约）。但落地时 harness 专名渗进了 `execute-spec-in-fork/SKILL.md` 正文（`:92,93,96,99-101,108-149`），且 `ask-matt:57` 与 docs 镜像页滞后一代。

### 当前架构的优点（应保留）

1. **契约与传输分离**，`SPEC READY`→`RECEIPT v2` 三传输一致（`README.md:396`）。
2. **"refuse-not-degrade" 的门设计**：输入不可用报 SKIP，git 不可用是显式拒收；缺失/不符 Schema 即拒收、禁止手补（`receipt-gate.mjs:33-35,169-181,261-262`）——堵死"假装通过"。
3. **机械门反向读契约的意识**已有雏形（`receipt-gate.mjs:383-433` 读 SKILL.md 比对），问题只在没接 CI。
4. **上游同步的工程化护栏**：干净工作树前置、时间戳备份分支、`SYNC INCOMPLETE` 显式标记；`sync-drill.sh` 的"试跑 rebase 量冲突、不碰真分支、结束即清理"；碰撞 playbook 决策树。
5. **状态外置与幂等细节扎实**：状态落被忽略的 `.zcode/`、`writeJson` tmp+rename、lock 原子 `mkdir`。
6. **诚实的知识边界**：`PROTOCOL.md:52-54`「评测测技能契约非 agent 通用能力」、`SCOREBOARD.md:3`「零运行＝诚实的空白，不是 0 分」。

### 主推架构决策：**ADR 0007 — 每份机读契约在 CI 中有唯一权威副本 + 反向校验**

- **决策**：为每条机读契约（receipt v2 schema / 六道门错误码表 / promoted 集合 / 版本身份 / 表达层 40 行预算）指定**恰好一个权威来源**，其余副本一律"引用或由权威生成"；在 `fork-guard.yml` 对每条契约挂一个 `--check`，做"权威→副本"的单向一致断言。**CI 全绿＝"契约未漂移"的唯一机械证明。**
- **为什么是这条**：它是发现 #1/#11/#17/#24 的共同根因与统一解法；落地成本低（多数 `--check` 已存在，主要是接线 + 补 Conclusion token 与版本身份两处覆盖）；直接兑现 ADR 0004:34 已承认的教训（"future bumps must edit this ADR and the skill template in the same changeset"）——把"靠人记得同步"升级为"机器强制同步"。
- **代价**：不能再用"手改生成的 `.codex-plugin/`"救急（恰是 ADR 0006 想要的约束）。

---

## 🧪 测试覆盖评估（Tessa）

**15 个模块中，只有 `receipt-gate.mjs` 有"强"判定力测试；2 个"中/弱"；1 个是伪测试；其余 9 个完全无自动化测试。**

| 模块 | 有自动化测试 | CI 执行 | 判定力 |
|---|---|---|---|
| `receipt-gate.mjs` | ✅ 13 条 | ❌ | **强**（唯一高质量测试；主理人实测 13/13 pass） |
| `test-coupling-gate.mjs` | ✅ 2 条 | ❌ | 中（仅下划线耦合一种形态；主理人实测 2/2 pass） |
| `fork-loop-mcp/server.mjs` | ⚠️ 伪测试 | ❌ | **伪**（恒真） |
| `tdd-slice-gate.mjs` | ⚠️ 仅内建自检 | ❌ | 弱（且 `gate:slice` 入口恒 exit 1） |
| `sync-plugin-version.mjs` / `build-codex-plugin.mjs` | ❌ | ✅ 仅 `--check` | 弱（只走 happy path） |
| `stop-hook.cjs` / `sync-upstream.sh` / `sync-local-skills.sh` / `sync-drill.sh` / `list-skills.sh` / `link-skills.sh` | ❌ | ❌ | 无 |
| `lint-skills.mjs` / `check-router.mjs` | ❌ 无单测 | ✅ 集成 | 无单测（负例从未被断言） |

**`docs/evals` 的定位（关键）**：**不是 CI 的一部分**（两个 workflow 全文无 eval 步骤）。`PROTOCOL.md:3` 明确"No test runner, no framework"，"scoring is a rubric the scorer reads and applies **by hand (or by agent)**"——**不可机械复现**。`SCOREBOARD.md` 的 tdd 3/8 是"回归探测"而非覆盖率指标（样本极小、逐轮人工介入）。手工台账（`metrics.md` 仅 1 行、`skill-friction-log.md` 为空）**无 schema 校验、无 CI 校验**，可靠性＝书写者纪律。

**补测优先级（Tessa 提议）**：
1. **P0-1（最高杠杆）**：把**已有**的 3 个测试接入 CI（新增 `npm test` + fork-guard 步骤）——不是写新测试，是让已有的跑起来。成本 **S**。
2. **P0-2**：新建 `stop-hook.test.mjs`（空邮箱静默 / 命中投递 / exactly-once / session 不匹配）。成本 **S**。
3. **P1-1**：把 `mailbox-cycle.test.mjs` 重写为真测试（去掉 `:57` 的无条件 exit 0，换成 `node:test`+`assert`；加 lock 冲突用例）。成本 **S/M**。
4. **P1-2**：新建 `sync-plugin-version.test.mjs`，**必须**断言"不一致 → exit 1"。成本 **S**。
5. **P2**：`tdd-slice-gate.test.mjs` + 修 `gate:slice` 入口。成本 **M**。

---

## 🚦 Go/No-Go 决策（Rex 运维轴）

| 维度 | 结论 |
|---|---|
| fork-guard 触发/阻塞强度 | ✅ 触发覆盖 main push + 全 PR，5 步全 blocking |
| **fork-guard 当前状态** | ❌ **红**（codex payload 门 1 stale + 6 drifted，主理人实测 EXIT=1） |
| CI 是否跑测试 | ❌ **完全不跑** |
| 自定义门的自检 | ❌ 无 meta-test，坏成"恒绿"不可发现 |
| 版本身份门 | ✅ 实测 pass（比 package ↔ .claude-plugin） |
| lock 可靠性 | ❌ **不能可靠防并发**（竞态 + 迟到释放 + 手动路由无锁） |
| 同步硬门 | ⚠️ 只覆盖"rebase 后验证失败"，冲突路径无门、无回滚 |
| 发布链 | ❌ 自动路径不可走通；README badge 无校验 |
| 可观测性 | ❌ 无任何自动化异常信号，唯一"告警"是人读 `metrics.md` |
| 本地钩子 | ❌ `core.hooksPath` 未激活（实测） |
| Windows 复现 CI | ❌ 本机跑不了 bash 门；CI 无 Windows job |

**决策**：**No-Go（限 fork-loop-mcp 传输层与发布链路）**。若上游分支保护不强制 fork-guard，还需确认"CI 红"是否真的阻塞合并——**此项无法从仓库判定，需仓库设置确认**。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | ~~**补上或摘除 `scripts/append-only-gate.mjs`**~~ ✅ **已完成**（脚本已落地，`verify:all` 转绿 11/11） | 维护者 | ~~P0~~ | 已完成 |
| 2 | ~~**先重写 `mailbox-cycle.test.mjs` 为真测试，再保留其 CI 接线**~~ ✅ **已完成**（13 条断言，变异测试证明非恒真） | Tessa | ~~P0~~ | 已完成 |
| 3 | ~~`server.mjs` win32 去掉 `shell:true`；`checkout` 走 `realpathSync` + 目录断言~~ ✅ **已完成**（`shell: false` + `normalizeCheckout()`，注入 sink 已关闭并验证） | Cody | ~~P0~~ | 已完成 |
| 4 | ~~锁修复三连~~ ✅ **已完成**（scoped release + orphan-lock 宽限 + tree-kill/无条件 settle；变异测试证明有牙齿） | Cody | ~~P0~~ | 已完成 |
| 5 | ~~**提交 `AGENTS.md` 修复** + 加字节数 guard~~ ✅ **已完成**（提交 **`e99af92`**，blob 9→863；新增 `agents-md-gate.mjs` 并注册进 `verify:all`） | 维护者 | ~~P0~~ | 已完成 |
| 6 | ~~修 `receipt-gate` 门禁强度 + Gate 6 接受 `--checkout`~~ ✅ **已完成**（词边界标记、契约字段白名单、`--checkout`；三条新测试 + 两次变异验证） | Cody + Archi | ~~P1~~ | 已完成 |
| 7 | ~~`npm run version` 末尾追加 `build-codex-plugin.mjs`；生成器保住 `hooks/`~~ ✅ **已完成**（`version` 已追加；`hooks/` 由并发会话修好并核实） | Rex + Cody | ~~P1~~ | 已完成 |
| 8 | ~~`sync-upstream.sh` 删死守卫 + `trap cleanup` 回滚 + 补 runbook~~ ✅ **已完成**（死守卫换成真实守卫；trap 中止并复原；`maintaining-fork.md` 补四行 runbook 表） | Rex | ~~P1~~ | 已完成 |
| 9 | ~~给 `scripts/verify.mjs` 本身加一致性测试~~ ✅ **已完成**（改为更强的形状断言：`TESTS` 条目若无断言、或以 `process.exit(0)` 结尾，直接判 FAIL；反证已验证） | Tessa | ~~P1~~ | 已完成 |

> 另建议并行推进：落实 **ADR 0007（机读契约单一权威 + 反向校验接 CI）**（P1）；`.gitignore` 补 `.scratch/` 与 `.tdd-slice-log.jsonl`（P2）；统一 `checkout` 锁到全部 3 条执行路由（P2）。

---

## ⚠️ 待完善 / 已知局限

- **审查方法局限**：全部为**只读静态审查 + 局部实测**（`node --test` 与 4 个门脚本主理人已跑）。**未做**端到端攻击复现（命令注入的"可达性"需一个能诱导规划会话传入恶意 checkout 的 prompt-injection 场景）；**未做**用户项目场景下 Gate 6 的实地验证；**未在干净机器上跑 `npm ci` 全链路**。
- **推断项已标注**：发现 #8、#9（发布链断点A、hooks 被删）为**读代码推断**，未在 CI 实跑验证；#19（版本提交不触发 workflow）为 GitHub 语义推断。
- **无法从仓库判定**：GitHub 分支保护是否强制 fork-guard → 若无，"CI 红"甚至不阻塞合并，优先级需重新评估。
- **未验证**：`claude plugin validate . --strict` 当前是否通过；`.changeset/*.md` 是否真被 `--diff-audit` 命中。
- **架构优点不可忽视**：本次审查发现密度高，但仓库的**契约文档化、门禁设计范式（refuse-not-degrade）、上游同步护栏、诚实的方法论边界**均属成熟做法——问题集中在"fork 自建基建没接线到强制流程"，而非设计能力不足。
- **仓库对象库：已原地修复**（见「第八轮」）。`git fetch --refetch` 取回了缺失的上游基线 `6654f6b`；`git merge-base HEAD upstream/main` 恢复、**`sync-upstream.sh` 重新可用**、`git fetch` 完全干净、`fsck` 的 pointer/reflog/traverse 错误全部归零。**唯一刻意保留的残留**：1 个 broken link——它由文档记录要保留的 re-graft 前备份分支 `backup/pre-graft-20260904-105531` 钉住，代价是定向关闭两项无法完成的维护任务（可逆，见 runbook 第 7 步）。
- **评分口径**：本报告不给出单一百分制分数；严重度分布与 Go/No-Go 结论即评级依据。

---

## 📚 数据来源 & 成员产出索引

| 成员 | 负责轴 | 核心产出 | 关键锚点 |
|---|---|---|---|
| **科迪（Cody）· 代码审查师** | 安全/性能/正确性/可维护性 | 16 条发现（1🔴/2🟠/5🟡/8🟢）+ 5 条详解 + 优点与总体判断 | `server.mjs:148-153` 命令注入（本机实测 `&&` 被执行）；`:92-94,300,371-373` 锁；`:161-165` 超时；`receipt-gate.mjs:58-59` 门禁强度 |
| **阿奇（Archi）· 系统架构师** | 架构债/单一事实来源/传输抽象 | 13 条架构风险（A1–A13）+ 7 条优点 + ADR 0007 提案 | A1 Codex 镜像漂移（实测 exit 1）；A2 Conclusion token 三处矛盾（实测 FAIL）；A4 Gate 6 校验错树（实测）；A13 tdd 6 轮代价 |
| **泰莎（Tessa）· 测试专家** | 测试债/判定力/覆盖缺口 | 15 模块覆盖矩阵 + 逐文件判定力审查 + 5 条补测计划 | `mailbox-cycle.test.mjs:57` 恒真伪测试；`sync-upstream.sh:21-24` 恒真守卫；`server.mjs:29` v1 死常量；CI 零测试 |
| **雷克斯（Rex）· SRE 工程师** | CI/发布/锁/可运维性 | Go/No-Go 清单（23 项）+ 18 条风险 + 发布链路图 + lock 专项 + 8 条缺失 runbook | `build-codex-plugin.mjs --check` 实测失败；`sync-upstream.sh:2,36-41` 冲突无 trap；`server.mjs:74,76,88` lock 竞态；`fork-guard.yml` 无测试步骤 |
| **甄宇航（Zhen）· 工程督导** | 编排 + 汇编 + 独立复核 | 本报告；复核记录 5 项 | 见下 |

### 复核记录（主理人亲自执行，非成员转述）

| 复核项 | 命令 / 动作 | 结果 |
|---|---|---|
| CI 是否真红 | `node scripts/build-codex-plugin.mjs --check` | **EXIT=1**，7 项 stale/drifted ✅ 坐实 |
| 门自检是否绿 | `node scripts/receipt-gate.mjs --check` | EXIT=0 ✅ |
| receipt 门测试 | `node --test scripts/receipt-gate.test.mjs` | **13/13 pass** ✅（但 CI 不跑） |
| 耦合门测试 | `node --test scripts/test-coupling-gate.test.mjs` | 2/2 pass ✅ |
| 伪测试 | 读 `mailbox-cycle.test.mjs` 全文 | 无 `assert`、`:57` 无条件 `exit(0)` ✅ 坐实 |
| 命令注入 sink | 读 `server.mjs:144-153` | `shell: win32` + args 零转义 ✅ 坐实 |
| v1 死常量 | 读 `server.mjs:29,109-113` | 常量声明后未被引用 ✅ 坐实 |
| lock 竞态 | 读 `server.mjs:74-88` | `mkdir` 先于 `writeJson` ✅ 坐实 |
| 超时无升级 | 读 `server.mjs:161-165` | 单次 `child.kill()` ✅ 坐实 |

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。

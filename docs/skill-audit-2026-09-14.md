# Skill 工作流审计报告

- **审计对象**: `sam-skills`（42 个 `SKILL.md`，32 个 promoted；7 个 `.mjs` + 5 个 `.sh` 守卫脚本；CI/pre-push 两道门）
- **审计日期**: 2026-09-14
- **审计模式**: 只读。审计阶段未修改任何 SKILL.md、脚本、清单或事实文档；本报告是当时的快照，修复在随后的独立一轮完成（见 §七）。
- **审计方法**: 逐个读源文件 + 实跑只读守卫（`lint-skills` / `check-router` / `lint-skills --diff-audit`）+ `git ls-files -s` / `git fsck` 交叉验证。
- **修复状态**: 下列 10 项已全部落地，并在过程中额外发现 2 处缺陷（见 §七）。

---

## 一、结论摘要

体系本身是健康的：32 个技能全部通过 lint 与 router 校验，`README ↔ plugin.json ↔ docs 页 ↔ bucket README` 四向一致，eval 台账与 draft-proposal 闭环真实运转（tdd 的两个 confirmed-defect 已端到端关闭）。

问题集中在**护栏层（guardrails）而非技能内容层**：三道本该拦住漂移的守卫里，**一道是假绿，两道没接进 CI**；另外契约文本被复制到 7+ 个落点、而机械校验只覆盖其中 2 个。技能正文的优化项（跨目录深链、description 规范）都属于小改。

| 等级 | 数量 | 主题 |
|---|---|---|
| P0 | 3 | 守卫假绿 · CI 缺位 · AGENTS.md 失效 |
| P1 | 7 | 单一事实来源 · fork 归属口径 · 依赖规范 · 镜像重复 · 交付物耦合 · 调用档位 |
| P2 | 4 | append-only 无校验 · 无聚合 verify · 数字手写 · openai.yaml 半校验 |

---

## 二、P0 — 需立即处理

### F1. `--diff-audit` 在 git 失败时静默输出 "OK"（假绿）

**位置**: `scripts/lint-skills.mjs:34-97`

```
try { numstat = git(["diff","--numstat","-w",`${ref}...HEAD`, ...]); }
catch { continue; }          // ← 任何 git 失败都被吞掉
```

只有 `git rev-parse --verify <ref>` 失败才 `exit 2`；真正的 `git diff` 失败走 `catch { continue }`，于是所有技能都被跳过，末尾照常打印 `diff-audit OK`。

**实测证据**（本机实跑）:

```
$ node scripts/lint-skills.mjs --diff-audit upstream/main
diff-audit vs upstream/main (budget 40 lines, fork-owned exempt):
diff-audit OK
# 同时 stderr 刷 30 行：
# fatal: bad revision 'upstream/main...HEAD'
# error: Could not read 6654f6b60cd9d5be8b54c6fafe44346dabeb3b76
```

交叉验证同源故障：`git merge-base HEAD upstream/main` 同样报 `Could not read 6654f6b…`，`git fsck` 报出大量 `missing blob/tree/commit` 与 7 个 `invalid sha1 pointer` 的 tag。

**影响**: 这是"继承技能表达层改动预算"的唯一机械守卫。上游 ref 一旦浅克隆、换名、或对象缺失，Guard 从"设防"变成"空转绿灯"，而输出文案仍写 OK——比没装守卫更危险。

> 说明：本机对象库的不完整可能是工作区拷贝造成的环境态，但**代码路径本身**已足以证明守卫在 git 失败时不设防。

**建议**: ① 区分错误类型——ref 不可解析 → `exit 2`；单技能无 diff → `continue`；② 增加"审计行数为 0 且 `PROMOTED` 非空"的自检，报异常；③ 接入 CI（见 F2）。

### F2. 只读守卫大面积未接入 CI / pre-push

**位置**: `.github/workflows/fork-guard.yml`、`.githooks/pre-push`

已接（两条通道一致）：`lint:skills` · `check:router` · `check-plugin-version` · `build-codex-plugin --check` · `claude plugin validate --strict`

**未接**：

| 守卫 | 作用 | 现状 |
|---|---|---|
| `lint-skills --diff-audit` | 上游继承技能改动预算 | 从未自动跑 |
| `receipt:gate --check` | 校验器规则 ↔ 契约文档防漂移 | 从未自动跑 |
| `test:receipt-gate` | 六道门合成错误覆盖（7 个用例） | 从未自动跑 |
| `gate:coupling --check` | tdd 耦合门自检 | 未接（`test-coupling-gate.test.mjs` 存在） |
| `gate:slice --check` | tdd 切片门自检 | 未接 |
| `scripts/fork-loop-mcp/test/mailbox-cycle.test.mjs` | MCP 信箱循环 | **连 npm script 都没有** |

**影响**: `receipt:gate --check` 是唯一守着"receipt v2 契约会不会悄悄漂移"的机械门，而它和它的测试都不在流水线上——契约漂移只能靠人发现。

### F3. `AGENTS.md` 是 9 字节文件，内容是字面量 `CLAUDE.md`

**实测**：

```
$ node -e "…readFileSync('AGENTS.md')…"
bytes=9
"CLAUDE.md"

$ git ls-files -s AGENTS.md
100644 681311eb… 0  AGENTS.md        # 普通文件，不是 symlink
```

**影响**：这是双重故障。

1. 任何按社区惯例读 `AGENTS.md` 的 harness 拿到的是无意义字符串——等于本仓库对外**没有**任何 agent 级常驻指令。
2. `skills/engineering/project-standards/SKILL.md:29` 明确写道："add one pointer block to `AGENTS.md`（**create the file if none exists — never overwrite an existing one's custom sections**）"。文件"存在"但是垃圾，于是标准指针块会被追加到一个坏文件上，而"标准已生效"的假象继续存在。`harvest` 的输入清单里同样把 `AGENTS.md` 当事实文档。

**建议**: 改为 `@CLAUDE.md`（Claude Code 的 memory import 语法，应是原始意图）；或直接搬运 CLAUDE.md 正文。并在 lint 中加最小可读性校验（存在时长度 > 阈值、非单行裸路径）。

---

## 三、P1 — 值得排期

### F4. 同一契约被复制到 7+ 个落点，机械校验只覆盖 2 个

`Schema: spec-executor-receipt/v2` 与六道门/错误码表出现在：

| 落点 | 位置 |
|---|---|
| 技能模板 | `skills/engineering/spec-executor/SKILL.md:70` |
| 门清单 + 校验说明 | `skills/engineering/execute-spec-in-fork/SKILL.md:114-121`；同文件 `:68,117` |
| README（4 处） | `README.md:134,203,278,498` |
| 守护脚本 | `scripts/receipt-gate.mjs:44,47-55` |
| MCP 服务 | `scripts/fork-loop-mcp/server.mjs:217` |
| 人类文档 | `docs/engineering/spec-executor.md`、`docs/engineering/execute-spec-in-fork.md` |
| 交付文档 | `delivery/系统设计.md`（§3.5.1 错误码注册表）、`delivery/UserStory.md:87,409,411,421,463,531`、`delivery/安全设计.md`、`delivery/部署设计.md` |

`receipt-gate.mjs --check` 只校验其中 **2 处**（spec-executor SKILL.md + 系统设计.md），且不在 CI 上（F2）。

**影响**: 技能自己写着"必填字段增删改名必须 bump 版本（D39）"，但没有任何一条机械路径保证 bump 时 7 个落点一起动。这是典型的高变异度、低校验覆盖组合。

**建议**: 抽出机器可读契约（如 `contracts/receipt-v2.json`：token、门序、错误码、必填字段），其余落点改为生成或引用，并让 `--check` 遍历全部落点。

### F5. `FORK_OWNED` 与"fork 自有技能"的口径三处不一致

| 出处 | 清单 |
|---|---|
| `scripts/lint-skills.mjs:24-30` | 5 个：`to-goal, goal-crafter, spec-executor, execute-spec-in-fork, roundtable` |
| `docs/maintaining-fork.md:42` | 同上 5 个 |
| `README.md:480` | **7 个**：额外含 `project-standards`、`harvest` |

`project-standards` 与 `harvest` 是本 fork 100% 自写的（changeset 原文：“This is a deliberate fork feature: upstream has no stack-playbook concept”），却被当作「继承技能」接受 40 行 diff 预算审查；当前豁免靠 `changesetText.includes(name)` 这条文本匹配侥幸成立。

**影响**: `changeset version` 消费掉 `.changeset/*.md` 之后豁免即失效——下一次 `--diff-audit` 会对这两个自研技能报"expression-layer edits to inherited skills need justification"。这是一个**有明确触发时机的定时告警**，且触发时间点在发布流程里。

**建议**: 统一为单一来源（例如新增 `fork-authorship.json`，lint 与 maintaining-fork 都读它），把两个自研技能纳入豁免。

### F6. `user-invoked` 技能的 description 未按自家规范剥离触发词

**规范**：`.agents/invocation.md:5` 与 `skills/productivity/writing-for-agents/SKILL-MECHANICS.md:10` 一致规定——user-invoked 技能的 `description` 是 human-facing 的**一行摘要，剥离 trigger lists**。

**违反者**（三处均为 `disable-model-invocation: true`）：

| 技能 | 现 description 摘录 | 问题 |
|---|---|---|
| `to-goal` | "Use after to-tickets or triage, before starting a fresh implementation session; use `--all` only for…" | 触发器 + 配方 |
| `harvest` | "Run it periodically, or right after /project-standards audit when the friction log has new entries." | 触发器 |
| `project-standards` | "Use when the user wants to codify team conventions, stop agents from guessing project rules…" | 整段触发器 |

**正确样式对照**：`ask-matt` → "Ask which skill or flow fits your situation."

**建议**: 在 `lint-skills.mjs` 增加机械规则——`disable-model-invocation: true` 且 description 命中 `Use when|Use after|Run it|when the user` → fail。

### F7. `to-goal` 跨目录深链另一个技能，违反自家依赖规范

**规范**：`.agents/invocation.md:16` — "Dependencies are expressed as **`/skill`-style prose invocation**, not deep `../other-skill/FILE.md` cross-references. Shared reference docs live inside the skill that owns them."

**违反**: `skills/engineering/to-goal/SKILL.md:13`

```
Read `../goal-crafter/SKILL.md` only for **compiled-handoff mode**, Phase 2 harness
formats, Phase 3's four self-checks, and Special Rules…
```

**影响**: ① 相对路径在插件安装态（技能被平铺）与任何布局变化下语义改变；② 更本质的是把 `goal-crafter` 的 Phase 2/3 规则「抄成部分引用」——两份文本会各自漂移，而 `goal-crafter` 已声明自己是该词汇的 single source of truth。

**建议**: 改为"Run `/goal-crafter`（compiled-handoff 模式）"，或把 harness 格式表内联进 `to-goal`；不要跨目录读取。同一文件中"Skip Phase 1 and Examples"这类指令本身就说明跨文件读法已经在制造脆弱耦合。

### F8. `.codex-plugin/skills/` 是 32 个技能的提交式镜像

`git ls-files .codex-plugin` 显示 **88 个 tracked 文件**，是 `skills/{engineering,productivity}/*` 的完整副本（含 `PHASE-BOUNDARIES.md`、`STACK-PLAYBOOKS.md`、`template.sh` 等附属文件）。

**现状是好的**：由 `build-codex-plugin.mjs --check` 守一致性，且已接入 CI 与 pre-push。

**代价**：任何技能改动都要"改源 + 重新生成 + 提交"，PR diff 翻倍；镜像产物入库使仓库体积与 review 成本线性上升；`goal-crafter/.gitignore`、`goal-crafter/README.md` 这类文件也被一并复制。

**建议**: 若 Codex 侧确实只能接受单一路径递归发现（ADR 0002 已论证），则考虑发布流程内生成产物、仓库不追踪；否则至少在 `PULL_REQUEST_TEMPLATE.md` 里把"重生成 codex payload"列为显式 checklist（目前只有 CI 事后拦截）。

### F9. 运行时开发脚本硬耦合 `delivery/` 交付文档

**位置**: `scripts/receipt-gate.mjs:414-424` 读 `delivery/系统设计.md` 作为错误码注册表契约源；`docs/maintaining-fork.md:55` 把这一耦合写进文档。

**影响**: `delivery/`（`UserStory.md` / `高层架构设计.md` / `系统设计.md` / `安全设计.md` / `部署设计.md` / `research_report.md` + 3 张 PNG）是本项目的**过程交付物**；一旦归档、精简或改名，`receipt:gate --check` 直接失效。此外中文文件名在非 UTF-8 环境（CI、Windows 脚本）中脆弱（`git ls-files` 输出已可见八进制转义）。

**建议**: 反向依赖——把错误码注册表抽到 `contracts/`（英文名、机器可读），`delivery/系统设计.md` 引用它。

### F10. `spec-executor` 是 model-invoked，与本设计的头号风险直接冲突

`skills/engineering/spec-executor/SKILL.md` **没有** `disable-model-invocation`（不同于 `to-goal`/`harvest`/`project-standards`/`ask-matt` 等），因此对模型可达。

同时 `README.md:246` 自己把这条标为⚠️：「**分叉口（最常见的踩空点）**：这时点『确认』= 同线程直接实现，管线到此断开」——而 spec-executor 的 description 正是 "Use after to-spec when the final spec fits one implementation session and **the new thread** should implement…"。

**影响**: 整套设计靠"实现必须发生在 fork 出来的执行线程里"成立。Codex 侧有 `openai.yaml: default_prompt` 里的 "from this forked conversation" 范围限定，但 Claude Code 侧模型只能读到 frontmatter description——兜底约束在最强 harness 上恰好缺失，等于给踩空路径装了个自动挡。

**建议**: 评估改为 user-invoked。两条真实调用路径（Messenger/Stop 钩子注入的 Ask、手动粘贴启动命令）都是用户态指令，不影响自动闭环；或在 description 里显式声明"仅当本会话是已 launch 的执行线程时才可用"。

---

## 四、P2 — 机会项

### F11. 三处「append-only 台账」只有文字纪律

`docs/metrics.md`、`docs/skill-friction-log.md`、`.tdd-slice-log.jsonl` 都自称 append-only，但没有机械校验。`delivery/部署设计.md:592` 甚至把"git diff 检出台账非 append 变更（行删除/改写）"写成了人工诊断步骤。

**建议**: 一条 20 行脚本 + 一个 CI step：断言这些文件在 diff 中只有 `+` 行。

### F12. 守卫入口分散，缺一条聚合命令

现有只读守卫 9 个 + 测试 3 个，`package.json` 里没有 `verify` / `ci` 聚合入口；`mailbox-cycle.test.mjs` 无 npm script。

**建议**: 加 `npm run verify`（全部只读守卫）与 `npm run verify:all`（含测试），CI 与 pre-push 都调用它。**这是投入产出比最高的一条**——它同时修掉 F2 的结构性问题。

### F13. 关键数字靠手写维护

`README.md:480`「32 个 promoted Skills：25 个上游 + 7 个 fork 新增」、`:73` 六道门清单、`:498` v2 字段说明均为手写；lint 只校验链接可解析与集合一致，不校验叙述与数字。

**建议**: 数字由脚本从 `plugin.json` + fork 归属清单生成（与 F5 的单一来源改造合并做）。

### F14. `agents/openai.yaml` 与 SKILL.md 只做了半配对校验

`lint-skills.mjs:338-354` 只校验 `disable-model-invocation` ↔ `policy.allow_implicit_invocation` 成对；不校验 `interface.display_name` / `short_description` 是否与 SKILL.md 的 name/description 语义一致。

这两项是 Codex 技能选择器的**用户可见文案**，是最容易在改名/改描述时静默漂移的字段。

**建议**: 在 lint 中加一条弱校验（display_name 与 name 的 slug 对应、short_description 非空且不含触发器措辞）。

---

## 五、建议的修复顺序

| 序 | 动作 | 消除 | 成本 |
|---|---|---|---|
| 1 | `diff-audit` 失败语义分型 + 零输出自检 | F1 | 小 |
| 2 | 修 `AGENTS.md`（`@CLAUDE.md` 或搬运正文）+ lint 最小校验 | F3 | 小 |
| 3 | 新增 `npm run verify` 聚合并接入 CI 与 pre-push | F2, F12 | 小 |
| 4 | `FORK_OWNED` → 单一来源清单，纳入 `project-standards`/`harvest` | F5, F13 | 小 |
| 5 | lint 新增两条规则：user-invoked description 剥离触发器；`AGENTS.md` 可用性 | F6, F3 | 小 |
| 6 | `to-goal` 深链改为 `/goal-crafter` 调用 | F7 | 小 |
| 7 | 评估 `spec-executor` 改 user-invoked | F10 | 小（需决策） |
| 8 | 抽出 `contracts/receipt-v2.json`，`receipt-gate --check` 遍历全部落点 | F4, F9 | 中 |
| 9 | append-only 机械校验；台账类 CI step | F11 | 小 |
| 10 | `.codex-plugin` 产物入库策略复议 | F8 | 中（需决策） |

**第 1–7 项全部是小改，可以在一到两个 PR 内清掉，并一次性把护栏层从"看起来有守卫"变成"守卫真的会响"。**

---

## 六、本次审计没做的事

- 审计阶段未修改任何 `SKILL.md`、`.mjs`、`.sh`、清单、`AGENTS.md`/`CLAUDE.md`、事实文档、CI 配置。
- 未应用 `docs/evals/draft-proposals/` 下的任何提案（8 份均已是 `Approved: yes` + `Applied:`，状态一致，无需干预）。
- 审计阶段工作树保持干净（`git status --short` 无输出）；临时统计文件已删除。

---

## 七、修复记录（2026-09-14）

按 §五 的顺序 1→10 全部落地。全部改动由 `npm run verify` 与 `npm run verify:all` 背书（8 守卫 + 3 测试套件全绿）。

| 序 | 落地内容 | 消除 |
|---|---|---|
| 1 | `lint-skills.mjs --diff-audit` 失败分型：ref/commit 对象不可读、merge base 不可达、落点集为空、单个 diff 报错，一律 `exit 2`；新增"实际审计了 N/M 个继承技能"自检 | F1 |
| 2 | `AGENTS.md` 重写为可被任意 harness 读懂的指针文件（指向 `CLAUDE.md` 并说明它承载什么） | F3 |
| 3 | 新增 `scripts/verify.mjs`（`npm run verify` / `verify:all` / `verify:list` / `verify:upstream`），聚合全部只读守卫；接入 `fork-guard.yml`（含 `fetch-depth: 0` + 显式 fetch upstream + 严格漂移审计）与 `.githooks/pre-push` | F2, F12 |
| 4 | 新增 `contracts/fork-authorship.json` 作为 fork 自研技能单一来源（7 个，含 `project-standards`/`harvest`）；lint 读它并校验每个 id 都是已 promoted 的技能；`maintaining-fork.md` 改为引用 | F5, F13 |
| 5 | lint 新增 3 条规则：user-invoked 描述不得含模型触发词、`AGENTS.md` 指针必须可解析、SKILL.md 不得跨技能目录深链；并修正 `to-goal`/`harvest`/`project-standards` 的描述 | F6, F3, F7 |
| 6 | `to-goal` 的 `Read ../goal-crafter/SKILL.md` 改为 `/goal-crafter` 散文调用，另两处 Phase 引用同步改写 | F7 |
| 7 | `spec-executor` 转为 user-invoked（frontmatter + `openai.yaml` policy），同步 bucket README 分组与 docs 页调用方式说明 | F10 |
| 8 | 抽出 `contracts/receipt-v2.json`（schema/门表/错误码/Conclusion 词表/14 个落点）；`receipt-gate` 从契约取规则，`--check` 遍历落点、拒绝过期 `spec-executor-receipt/vN` 与半途升版；delivery 文档降为 optional 解除硬耦合 | F4, F9 |
| 9 | 新增 `scripts/append-only-gate.mjs`，保护 `docs/metrics.md`/`docs/skill-friction-log.md`/`.tdd-slice-log.jsonl`；接入 verify 与 CI 的 PR/push 双路径 | F11 |
| 10 | 记录 `.out-of-scope/codex-plugin-payload-generated-at-release.md`（持久理由：manifest 单一 skills 路径 + 仓库本身是安装源 + 漂移成本已有机械门）；PR 模板改为引用单一来源并新增"重生成 codex payload"checklist | F8 |

### 修复过程中新发现的缺陷（均已修）

**N-1（P0）`.codex-plugin` 生成器不忠实，`--check` 既长期为红又会"修绿即删功能"。**
`build-codex-plugin.mjs` 只产出 skills 与 `plugin.json`，不产出已提交产物里的 `mcpServers`（`${CODEX_PLUGIN_ROOT}`）与 `hooks/hooks.json`。后果有两层：`--check` 在 HEAD 上就是失败的；而"照提示重生成"会**静默删掉 Codex 插件的自动传输**（MCP + Stop 钩子），随后 `--check` 变绿。已让生成器忠实复现整个产物并同步 hooks 目录，重生成后 `--check` 真正通过，`mcpServers` 与 stop-hook 均在位。

**N-2（P1）`build-codex-plugin --check` 在 Windows 上假阳性。**
`plugin.json` 由生成器写 LF，而 Windows 检出经 `core.autocrlf` 落地为 CRLF，逐字节比较因此每次都报 drift。已改为文本文件按 CRLF 归一比较（含 NUL 的按二进制比较）。

### 一条保留的观察（未改）

`.codex-plugin` 镜像本身是**真实漂移**过的（`to-goal`/`spec-executor`/`tdd`/`execute-spec-in-fork`/`goal-crafter` 在 HEAD 上就与源不一致，已由本次重生成修正）——这正好印证 F8 的"改一处忘一处"。策略层面的取舍已按 §七-10 记录在 `.out-of-scope/`，不再靠人工记忆。

### 另一条与本仓库无关的观察

本次会话期间工作区出现了未跟踪目录 `deliverables/engineering-assurance/code-review-sam-skills-2026-09-14.md`（34KB）。它不是本轮改动产生的，未纳入本报告结论，也未做任何处理。

### 说明：`verify:upstream` 在当前克隆上 exit 2

本机对象库里 `upstream/main` 的 merge base 提交（`6654f6b…`）缺失，`git merge-base` 不可达。这正是第 1 项要分开的语义：**旧代码在这种情况下打印 `diff-audit OK`（假绿），新代码 `exit 2` 并明确说明原因**。要恢复绿灯需重新 `git fetch upstream main`（或在 CI 中按 `fork-guard.yml` 的步骤拉取完整历史）。

# Proposal: from-prototype 毕业到 productivity 桶（第 33 个 promoted skill）

- Skill: from-prototype（`skills/in-progress/` → `skills/productivity/`）+ 7 处配套登记
- Evidence: 用户反馈 zcode 安装插件后看不到该 skill——CLAUDE.md 桶规则规定 `in-progress/` 不随插件发布，`.claude-plugin/plugin.json` 只收 promoted 集（Grep 核实：plugin.json 有 `./skills/productivity/grill-me`，无 from-prototype）；该 skill 已完成首次 forward-test（瑞迅通指南站 13/20 页 → drafts/瑞迅通运营管理系统-plan-draft.md，[待确认] 标记机制有效，happy path 通过）；commit 2a043b9 已在 main。
- Verdict: promote（用户在三选项 A 单技能直装 / B 本地拷贝 / C 毕业 中明确选 C）
- Change（apply 清单，逐项核对）:
  1. `git mv skills/in-progress/from-prototype skills/productivity/from-prototype`（SKILL.md 与 agents/openai.yaml 内容不变——已核对文件内无 in-progress 自引用）。
  2. `skills/in-progress/README.md`：删除 from-prototype 条目行。
  3. `skills/productivity/README.md`：User-invoked 组追加（按字母序置于 grill-me 前）：
     > `- **[from-prototype](./from-prototype/SKILL.md)** — Turn a product prototype link or UI screenshots into a structured, inference-tagged plan draft with decision branches, ready for grill-me to interrogate.`
  4. `.claude-plugin/plugin.json`：skills 数组追加 `"./skills/productivity/from-prototype"`。
  5. 顶层 `README.md` 三处：
     - "32 个 promoted Skills" → "33 个"，fork 新增技能枚举末尾追加 [`from-prototype`](./skills/productivity/from-prototype/SKILL.md)；
     - 技能地图"规划 / 澄清"行首列追加 [`from-prototype`](./skills/productivity/from-prototype/SKILL.md)；
     - 使用步骤第 1 步代码块在 `/grill-me` 前加一行：`/from-prototype   ← （可选）产品给了原型链接/截图时先做 intake，产出需求草案`。
  6. 新建 `docs/productivity/from-prototype.md`：按 `.agents/writing-docs.md` 模板（What it does 含 defining constraint「只 intake 不访谈、只抽取不复刻」/ When to reach for it 含 user-invoked 声明与 grill-me、prototype 的边界 / Where it fits 命名为 chain step `from-prototype → grill-me → to-spec`）；fork-owned 跨 skill 链接一律用 `https://github.com/opsbli/sam-skills/...` 绝对 URL（不用 aihero.dev，那是上游发布域）；无 install 命令、无 H1；Common questions 如实从简（无 wiki/issue 证据，最多 1–2 条）。
  7. `skills/engineering/ask-matt/SKILL.md`：On-ramps 段追加一条——产品给了原型链接/截图 → `/from-prototype` 转成需求草案，随后汇入主流程序列（有工作目录走 `/grill-with-docs`，无则 `/grill-me`）；Standalone 段不动。
  8. 运行 `node scripts/build-codex-plugin.mjs` 重新生成 `.codex-plugin/skills/` 扁平镜像（ADR 0006：promoted-skill 变更后重生成是强制步骤，陈旧镜像属 review 缺陷）。
  9. `CHANGELOG.md`：在 `## Unreleased` 的 `### Patch Changes` 追加一条"Promote `from-prototype` to the promoted set (productivity bucket)…"，版本号不 bump（与 Unreleased 段既有做法一致；plugin-version 检查只要求 package.json ↔ plugin.json 一致）。
  10. 验证：`npm run verify`（10 项）+ 若本机有 claude CLI 则 `claude plugin validate . --strict`；全部通过后单独 commit（不动 drafts/，不进本 commit）。
- 不做的事：不改 SKILL.md 正文；不动主流程 mermaid 图；不 push origin（push 前另走 docs/maintaining-fork.md 清单）；drafts/ 仍不入库。
- Approved: yes

Applied: 2026-09-15 — 10 项清单全部落盘：git mv 完成（rename 保留历史）；in-progress/productivity README、plugin.json（33 skills）、顶层 README（计数 33 + 技能地图 + 使用步骤第 1 步）、docs/productivity/from-prototype.md 新建、ask-matt On-ramps 首条、codex 镜像重生成（33 skills）、CHANGELOG Unreleased 追加。verify 首轮 FAIL 2 项（README mini-receipt 计数漏改；user-invoked description 含 "Use when" 模型触发语）——按 .agents/invocation.md 修正后 `npm run verify` 10/10 通过。claude plugin validate 未跑：本机无 claude CLI。drafts/ 未入库，origin 未 push。

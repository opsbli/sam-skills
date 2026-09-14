# Harvest run — 2026-09-14 (US-6, MVP 首次回灌)

Inputs read: docs/metrics.md（空表）、docs/skill-friction-log.md（空）、docs/evals/results/（8 份首跑台账 + SCOREBOARD）、docs/evals/SCOREBOARD.md、相关 SKILL.md（to-goal / spec-executor / tdd）与 AGENTS.md/CLAUDE.md。

## 信号分诊（一行一记录）

- 2026-09-14 · eval to-goal/02 first-run fail（goal 落盘 tracker 区 + 误报 clean）→ **noise**（repeat-test：首败不立案；失败模式本身值得关注——to-goal 对输出介质沉默，一条子句可修，留待复跑确认）
- 2026-09-14 · eval spec-executor/02 first-run fail（Docs delta: none 掩盖 product-adjacent 决策）→ **noise**（首败；失败模式恰为 v2 契约点名的 silent-deviation，留待复跑确认）
- 2026-09-14 · eval tdd/02 first-run fail（镜像仓库既有实现耦合惯例 + 批量写测试）→ **noise**（首败；留待复跑确认）
- 2026-09-14 · friction log 空 → 无跨 receipt 重复摩擦 → 无 confirmed-defect 来源
- 2026-09-14 · metrics ledger 空（首跑 receipt 未走 metrics 回灌，US-3 流程尚未全链运转）→ 无 quality 标签信号
- X2/X3/X6 三处漂移为 **G1 资料摘要已确认事实**（material_digest.md §冲突表，D1~D77），非本 run 新发现；按 US-6 N3 口径以 confirmed-defect 起草三份提案（见同目录三份提案文件）

## 处置声明

本 run 未直接改动任何 SKILL.md / AGENTS.md / 事实文档；唯一写目标为 docs/evals/draft-proposals/ 下四份文件（含本记录）。

流程例外备注（X2 关联）：ADR 0004 的 v1→v2 amendment 于 US-4 收尾时直接补档（补档动作先于本机制可用），已在 ADR 内自注「backfilled」与流程缺口；自本 run 起，事实文档修订一律走提案-审批-应用流程。

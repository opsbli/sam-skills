# AICoding 架构设计 · 行业调研报告

> 本文档为《AICoding 架构设计》核心产物之一，定位为**行业调研报告（research_report）**。
> 上游输入：主理人转交的用户诉求 + G1 已审核的资料摘要（material_digest.md，D1~D77、冲突 X1~X6）；
> 下游输出：驱动 `business-architect`（业务架构师）的行业调研判断，最终落入《高层架构设计》的行业调研章节。

> **产出者**：`research-analyst`（研究分析师 - 查有据），经 G2 自动校验与人工审核通过后方可进入下游消费。
> **结构纪律**：全文按「事实 → 对比 → 建议 → 风险」四段式组织：§1 收敛、§2 事实、§3 对比、§4 建议、§5 风险、§6 来源、§7 硬指标。

---

## 0. 元信息：修订记录

```yaml
标题: sam-skills（AICoding 架构设计） - 行业调研报告 v1.0
版本: v1.0
状态: Draft   # Draft | Reviewing | Approved | Deprecated
创建日期: 2026-09-11
最后更新: 2026-09-11
调研人: research-analyst（研究分析师 - 查有据）
审核人:
  - 主理人（team-lead）→ G2 人工审核待执行

关联文档:
  上游输入:
    - 用户诉求: 「启动 AICoding 架构专家团，基于我的项目背景和资料生成完整架构方案。」（已确认：需要行业调研；跳过云现状核对）
    - 资料摘要: .workbuddy/output/material_digest.md（G1 已过，77 份资料、D 编号可溯源、冲突 X1~X6）
    - 调研目标: AI coding 工作流/规范管线/技能工程领域标杆对比，围绕 sam-skills 四大核心命题找证据链
  下游产出:
    - 高层架构设计·行业调研章节: 将由 business-architect 整合
```

| 版本 | 日期 | 作者 | 变更内容 | 评审状态 |
| --- | --- | --- | --- | --- |
| v1.0 | 2026-09-11 | research-analyst | 初稿（11 次公开来源检索，6 家标杆盘点，5 维加权对比） | Draft |

**引用记号约定**：引用上游资料摘要时标注（D编号，§章节）；引用公开来源时标注（SR-编号）。全文引用语法一律使用全角〈〉，与摘要转写约定一致。

---

## 1. 调研问题收敛

> **四段式前置**：调研启动前，先围绕用户诉求收拢为明确的调研问题集合，确保调研不偏离当前项目背景。

### 1.1 原始调研种子

> 从用户诉求与主理人建议方向中提取需要调研验证的论题，逐条给出调研优先级。

| 编号 | 待验证论题 | 来源（用户诉求要点） | 调研优先级 | 备注 |
| --- | --- | --- | --- | --- |
| S1 | AI coding 工作流中「规划与执行线程分离」的业界标杆与主流形态 | 用户诉求「生成完整架构方案」+ 主理人建议方向（spec-driven 框架、Claude Code 官方实践） | 高 | 对应 sam-skills 命题一：grill → SPEC READY → execute in fork 线程分离（D1，§30 秒主流程） |
| S2 | spec 成稿 → 执行 → 验收回执的闭环工件与机器校验先例 | 主理人建议方向（Spec Kit 等 spec-driven 框架） | 高 | 对应 sam-skills 命题二：SPEC READY→receipt 闭环、六道归档门（D39，§Receipt v2 字段；D75，§Decision） |
| S3 | 长任务/跨会话的上下文重置与交接契约机制 | 主理人建议方向（跨上下文契约） | 高 | 对应 sam-skills 命题三：to-goal 跨上下文契约，「fork 全量继承、to-goal 全量压缩」（D1，§fork 与 to-goal 分工） |
| S4 | 多 harness 传输适配的路线谱系（通用集成 / 开放标准 / 真适配器） | 主理人建议方向（传输适配器策略） | 中 | 对应 sam-skills 命题四：Codex/ZCode/手动三通道，ADR 0003 拒绝跨 harness 抽象（D74） |
| S5 | 技能/规则工程生态的机制成熟度与分发模式 | 主理人建议方向（Claude Code skills、上游 mattpocock/skills 生态、Cursor Rules） | 中 | 对应 sam-skills 资产形态：32 个 promoted skills、invocation 双轨、双分发轨道（D4，§Invocation 模型；D73） |

### 1.2 调研问题收敛

> 将 §1.1 的种子收敛为 5 个可执行的调研问题。每条问题明确调研对象、调研目标和产出预期。

| 编号 | 调研问题 | 调研对象 | 调研目标 | 预期产出 | 关联种子 |
| --- | --- | --- | --- | --- | --- |
| Q1 | 主流 AI coding 工具与框架如何划分规划线程与执行线程？门禁与人工确认点设在哪里？ | GitHub Spec Kit、AWS Kiro、OpenSpec、Claude Code（plan mode/subagents）、Cursor | 盘点各方案管线形态、阶段工件与门禁机制 | §2.2 详述卡片 + §2.3 横向事实表 | S1 |
| Q2 | spec → 执行 → 验收的闭环中，业界有哪些结构化工件与机器可校验的验收先例？ | Spec Kit（checklist/analyze/converge）、Kiro（EARS + 可追溯性）、OpenSpec（validate --strict + delta 归档）、Codex（AGENTS.md 完成判据） | 为 receipt v2 契约与六道归档门寻找业界对标与差距 | §2.3 横向事实表 + §4 借鉴点 | S2 |
| Q3 | 长任务与跨会话场景下，业界如何做上下文重置与状态交接？ | Anthropic 官方 harness 设计工程文、Claude Code subagents、AGENTS.md 标准、OpenHands EventLog/condenser | 验证 to-goal「压缩契约」路线的业界依据 | §2.2 卡片 + §3 评分证据 | S3 |
| Q4 | 多 harness 支持存在哪几条路线？各自成本与适用条件是什么？ | Spec Kit（35+ 集成）、OpenSpec（30 agents）、AGENTS.md（开放标准）、sam-skills ADR 0003/0005（真适配器） | 评估「一适配器一文档」路线与通用集成路线的取舍依据 | §2.3 横向事实表 + §3.2 结论 | S4 |
| Q5 | 技能/规则工程（skills/rules engineering）生态的机制与分发模式成熟度如何？ | Claude Code Agent Skills 官方体系、上游 mattpocock/skills、Cursor Rules | 为技能资产的维护、校验、分发提供基线事实 | §2.2 卡片 + §4.3 技术栈建议 | S5 |

**收敛说明（自检点 1 记录）**：Q1~Q5 与主理人建议的候选标杆名单（Claude Code 官方 skills 与最佳实践、GitHub Spec Kit、Cursor Rules、Aider、OpenHands/SWE-agent、上游 mattpocock/skills 生态）一一对应，无方向分歧。Aider 经评估降为 §2.3 横向事实行而非独立标杆：其定位是单机会话 CLI 结对编程（git 自动提交 + repo map），无规划/执行线程分离与验收回执机制，与本调研四命题契合度低；此取舍属主理人建议名单内的专业裁量（主理人已授权「调研方向建议可自行扩展」），不构成方案分歧。

---

## 2. 事实：标杆系统盘点和方案详述

> **四段式「事实」段**。只陈列调研发现的事实，不做引申建议或边界裁决。每条事实标注置信度与来源。

### 2.1 行业标杆清单

**硬指标达成**：共盘点 6 家标杆系统，含头部 SaaS 代表（B1 Claude Code、B3 Kiro）与开源/自研代表（B2 Spec Kit、B4 OpenSpec、B5 OpenHands/SWE-agent、B6 上游 mattpocock/skills）。

| 编号 | 标杆系统 | 厂商 / 社区 | 部署形态 | 场景覆盖 | 技术亮点 | 商业模式 | 调研来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Claude Code（含 Agent Skills/subagents 体系） | Anthropic | SaaS（CLI/桌面/API），本地文件系统操作 | 终端自主编码 + 技能生态 + 多代理编排 | Skills 三层渐进披露；plan mode 只读规划；内置 Explore/Plan 子代理；插件 marketplace | 订阅 + API 按量 | SR-1、SR-2、SR-3 |
| B2 | GitHub Spec Kit | GitHub（官方开源） | 本地 CLI（uv 安装），works offline | spec-driven 开发全流程管线 | constitution/specify/plan/tasks/implement 五命令 + clarify/analyze/checklist/converge 质量命令；35+ agent 集成 | 开源免费 + 社区扩展生态 | SR-6、SR-7 |
| B3 | Kiro | AWS | 商业 IDE（Code OSS fork）+ CLI，Bedrock 托管模型 | spec-driven 从原型到生产 | EARS 记法三文档（requirements/design/tasks）、三阶段人工门禁、Agent Hooks、Requirements Analysis（SMT 求解器查需求矛盾） | Freemium credit 计费（0/20/40/200 美元档） | SR-8、SR-9、SR-10 |
| B4 | OpenSpec | Fission AI | 本地 CLI（npm），零 API key | 存量系统（brownfield）变更管理 | Propose→Apply→Archive 状态机；delta specs（ADDED/MODIFIED/REMOVED）；validate --strict 结构门；30 agents 适配 | 开源免费（MIT） | SR-9、SR-10 |
| B5 | OpenHands / SWE-agent | AllHands（原 OpenDevin）/ Princeton NLP | 开源自托管（Docker 沙箱 / 本地文件系统） | 自主软件工程（issue 修复、SWE-bench） | OpenHands 五层 SDK + 事件流 + Docker 沙箱；SWE-agent 的 ACI（Agent-Computer Interface）；mini-SWE-agent 100 行基线 | 开源免费（MIT），OpenHands 另有云服务 | SR-11、SR-12、SR-13 |
| B6 | mattpocock/skills（sam-skills 的上游） | Matt Pocock（社区） | 本地 markdown 技能仓库（skills.sh / Claude 插件分发） | 工程纪律技能集（访谈/规格/拆票/TDD/评审） | 53 个 skills、230k+ stars、18M+ 安装；grilling frontier 轮次制；user/model invoked 双轨；双分发哲学 | 开源免费（MIT）+ Claude 官方 marketplace 上架 | SR-19、SR-20、SR-21 |

### 2.2 标杆方案详述

> 每家标杆逐一展开。每行区分「已核实」与「推断/综合归纳」，推断行注明推理来源。

#### 2.2.1 B1 - Claude Code（Anthropic）

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | 终端优先的自主编码代理，兼容桌面/Web 入口；通过 Skills/subagents/hooks 形成可扩展代理平台 | 已核实（SR-1、SR-3） |
| 目标用户 | 专业开发者与团队；skills 生态同时服务个人与插件分发者 | 已核实（SR-1） |
| 核心能力 | Agent Skills 三层渐进披露：L1 元数据常驻（每技能约 100 token 的 name+description）、L2 SKILL.md 正文触发时加载（5k token 以内）、L3 资源与脚本按需读取（脚本经 bash 运行、代码本身不进上下文）；disable-model-invocation 支持把技能限定为用户手动调用 | 已核实（SR-1） |
| 架构特点 | 内置 Explore（只读快速探索）、Plan（plan mode 下只读研究）、general-purpose 三类子代理，各自独立上下文窗口；子代理可声明 permissionMode（含 plan 只读模式）；支持 fork 语义（继承主对话上下文）与 SendMessage 恢复；子代理支持持久记忆目录（user/project/local 三档作用域） | 已核实（SR-3） |
| 部署形态 | 本地 CLI 优先，模型侧 SaaS；技能以文件系统目录分发 | 已核实（SR-1、SR-2） |
| 集成方式 | 插件 marketplace（含官方 listing 与自建 marketplace 两路）、MCP、hooks 事件 | 已核实（SR-2、SR-3） |
| 定价模式 | 订阅（Pro/Max）+ API 按量 | 已核实（SR-3 官方文档语境） |
| 优势 | 官方机制与 sam-skills 资产形态天然同构：SKILL.md、invocation 双轨、插件分发均由官方承载 | 综合归纳（SR-1 对照 D4/D66） |
| 局限 | 官方 marketplace 对 fork 的 listing 存在 pin 滞后现象（上游已有同类记录：官方 listing sha 钉死，技能数落后 main 两个提交），fork 需自建 marketplace（sam-skills 已如此处理，D73，§Fork update 2026-08-10） | 已核实（上游 ADR 记录）+ 推断（官方审核细则未完全公开，见 §5.2 U-1） |
| 对本项目的参考价值 | 宿主平台官方机制即 sam-skills 的运行底座；Skills 三层披露、invocation 双轨、子代理上下文隔离均为可对齐的官方事实标准 | 推断（对照 D4、D77） |

#### 2.2.2 B2 - GitHub Spec Kit

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | GitHub 官方开源的 spec-driven 开发工具包（Specify CLI），把「规范作为可执行之物」推进为通用基线 | 已核实（SR-6、SR-7） |
| 目标用户 | 使用任意 AI 编码代理的团队；官方定位「intent-driven harness」，可承载 SDD 或自定义流程 | 已核实（SR-6） |
| 核心能力 | 五核心命令：/speckit.constitution（项目宪法）、/speckit.specify（规格，只说做什么）、/speckit.plan（技术方案）、/speckit.tasks（任务拆解）、/speckit.implement（执行）；辅助命令：/speckit.clarify（澄清欠定区）、/speckit.analyze（跨工件一致性分析）、/speckit.checklist（需求质量清单，官方称「unit tests for English」）、/speckit.converge（对照 spec/plan/tasks 评估代码库并追加剩余任务）、/speckit.taskstoissues（任务转 GitHub issues） | 已核实（SR-7） |
| 架构特点 | 每阶段产出 Markdown 工件喂下一阶段（structured context instead of ad-hoc prompts）；模板四层优先级解析：项目本地覆盖 → presets → extensions → 核心 | 已核实（SR-6、SR-7） |
| 部署形态 | 本地 CLI（uv tool install），works offline、可自托管目录 | 已核实（SR-6） |
| 集成方式 | 35+ AI 代理集成（Copilot、Codex、Claude、Cursor、Kiro、Gemini CLI 等）+ generic 集成兜底未适配工具；138 个社区扩展、25 个 presets（含完全替换 SDD 流程的非软件类流程） | 已核实（SR-6、SR-7） |
| 定价模式 | 开源免费 | 已核实（SR-6） |
| 优势 | 阶段工件化 + 质量门（clarify/analyze/checklist）是目前公开方案中最完整的 spec 管线基线；社区扩展生态活跃（240+ 贡献者） | 综合归纳（SR-6、SR-7） |
| 局限 | 社区共识其重型与严格对小型改动偏重（多个第三方评测同口径指出学习成本与环境依赖——uv/Python）；第三方中文实践文建议 spec 编写需 3~5 轮迭代才合格 | 已核实（SR-7 社区文章口径，标注为社区实践而非官方声明） |
| 对本项目的参考价值 | 其 analyze（跨工件一致性）与 checklist（需求可测性门）与 sam-skills 的 readiness checklist（D41）、receipt 六道门（D39）形成同位对照，是 receipt 契约演进的最直接参考系 | 推断（对照 D39、D41） |

#### 2.2.3 B3 - Kiro（AWS）

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | AWS 的 spec-first 一体化 IDE + CLI，官方定位 Amazon Q Developer 的后继者 | 已核实（SR-8、SR-10） |
| 目标用户 | AWS 生态内从原型走向生产的团队 | 已核实（SR-8） |
| 核心能力 | 一个 prompt 生成三份版本化工件：requirements.md（EARS 记法：WHEN〈触发〉THE SYSTEM SHALL〈行为〉，强制可测句式）、design.md（含数据流图与接口）、tasks.md（依赖排序且每任务回链需求）；三阶段门禁要求人工逐段批准；2026 年新增 Requirements Analysis 用形式逻辑与 SMT 求解器在编码前查需求矛盾 | 已核实（SR-9、SR-10） |
| 架构特点 | steering 文件承载常驻项目上下文；Agent Hooks 按文件保存等事件后台跑代理；模型经 Bedrock 路由 | 已核实（SR-8、SR-10） |
| 部署形态 | 商业 IDE（Code OSS fork）+ CLI，深度绑定 AWS | 已核实（SR-9、SR-10） |
| 集成方式 | 原生 MCP（含 remote）、AWS 服务族（Lambda/CDK/CloudFormation） | 已核实（SR-8） |
| 定价模式 | Freemium credit 制：0/20/40/200 美元档，超额约 0.04 美元/credit，credit 不滚存 | 已核实（SR-10） |
| 优势 | EARS 记法把需求强制为机器可检查句式 + requirement→task 双向可追溯，是验收标准措辞的最佳公开实践 | 综合归纳（SR-9、SR-10） |
| 局限 | 2025 年 8 月 vibe/spec 请求双轨计费叠加计量故障引发持续社区反弹（Hacker News 用户原话：〈Clear pricing makes it easy for you to control costs. Vibe pricing makes it easy for the vendor to maximize revenue.〉）；小改动写三份文档的仪式成本高；EARS 是需求句法纪律而非可执行测试 | 已核实（SR-9，社区舆论为社区实践口径） |
| 对本项目的参考价值 | EARS 句式与可追溯性思想可局部参考，但其整体形态（商业绑定 + credit 计费 + 全托管）与本项目本地优先、无云部署的前提冲突 | 推断（对照用户诉求「本地 CLI/Skills 仓库，无云部署」） |

#### 2.2.4 B4 - OpenSpec（Fission AI）

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | 轻量级 repo-resident SDD CLI，官方定位「lightweight spec-driven framework」，brownfield 优先 | 已核实（SR-9、SR-10） |
| 目标用户 | 在既有系统上做增量变更、且不想被框架绑定的开发者 | 已核实（SR-9） |
| 核心能力 | 严格三态状态机：Propose（proposal.md + tasks.md + delta specs）→ Apply（执行）→ Archive（delta 并入 source-of-truth spec）；signature 机制是 delta specs：变更目录只记录 ADDED/MODIFIED/REMOVED 需求项 | 已核实（SR-10） |
| 架构特点 | openspec/ 目录分离 specs/（当前真相）与 changes/（进行中提案）；openspec validate --strict 阻断不完整提案（实测曾拦下缺失 GIVEN/WHEN/THEN 场景的提案）；审批门在代码生成之前 | 已核实（SR-10） |
| 部署形态 | 本地 CLI（npm，Node 20.19+），仓库内自持 | 已核实（SR-9） |
| 集成方式 | 30 agents 适配，自身不调 LLM（零 API key、零 MCP），骑在用户既有代理上 | 已核实（SR-9、SR-10） |
| 定价模式 | 开源免费（MIT） | 已核实（SR-9） |
| 优势 | delta 语义让多个在途变更可并行编辑同一 spec 而互不冲突；archive 归档后文档随系统持续复真（社区称 semi-living）；「验证=结构校验、不做编排」的极简主义边界清晰 | 综合归纳（SR-10） |
| 局限 | 无多代理编排、无持久代码库上下文（官方取舍，社区评测口径一致）；验证只查结构不证行为（verify 不阻断 archive） | 已核实（SR-10） |
| 对本项目的参考价值 | 「诚实不做编排」+「结构门硬阻断」与本仓 ADR 0003（缺依赖即 refuse 不降级模拟，D74）哲学同构；delta 归档语义可对照 receipt 的 Docs delta 结算（D39，§Receipt v2 字段） | 推断（对照 D74） |

#### 2.2.5 B5 - OpenHands / SWE-agent（开源自主代理双代表）

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | OpenHands：生产向开源自主代理平台（原 OpenDevin）；SWE-agent：研究向最小自主代理（Princeton，NeurIPS 2024） | 已核实（SR-11、SR-13） |
| 目标用户 | OpenHands 面向企业自托管与生产；SWE-agent 面向学术研究与可复现基线 | 已核实（SR-11、SR-12） |
| 核心能力 | OpenHands：五层解耦 SDK（Agent/Conversation/Events/Tool System 与 MCP/Workspace）+ 追加型不可变 EventLog + condenser 事件压缩 + Docker 沙箱；SWE-agent：ACI（Agent-Computer Interface）概念开创者，为 LLM 人体工学重构终端/编辑器/搜索工具，输出截断与防误写栅栏；mini-SWE-agent 后代仅约 100 行 Python，SWE-bench Verified 76.8%（配 Opus 4.5） | 已核实（SR-11、SR-12、SR-13） |
| 架构特点 | OpenHands 核心循环：Action → 沙箱执行 → Observation → EventLog → 下一 Action；SWE-agent 走最小工具面 + 完整轨迹上下文 | 已核实（SR-11、SR-13） |
| 部署形态 | OpenHands：Docker 容器化自托管 + 云服务；SWE-agent：本地文件系统/容器 | 已核实（SR-11） |
| 集成方式 | OpenHands 支持 MCP、Web UI、REST/WebSocket API、RBAC 审计；两者均模型无关（BYOK） | 已核实（SR-11、SR-12） |
| 定价模式 | 开源免费（MIT）；OpenHands 另有商业云与融资（2025 年 11 月 1880 万美元 A 轮） | 已核实（SR-12） |
| 优势 | SWE-bench Verified 开源脚手架第一梯队：OpenHands + Sonnet 4.5 约 66%、配 Opus 4.5 内部 harness 约 77.6%；事件日志提供完整审计轨迹 | 已核实（SR-11、SR-12，成绩为第三方汇总口径） |
| 局限 | 社区评测共识：真正新题（SWE-bench-Live）两者只解约 18~20%，框架差异小于模型差异；OpenHands 资源消耗与部署复杂度高；与商业头部仍有差距（Claude Code 同基准约 80% 档） | 已核实（SR-12，第三方评测口径） |
| 对本项目的参考价值 | 代表「沙箱自主执行」路线的工程上限与成本；其 EventLog/审计思想与 receipt 遥测行（D39，§Receipt metrics）同位；ACI 证明「工具面越小越稳」 | 推断（对照 D39、D76） |

#### 2.2.6 B6 - mattpocock/skills（上游基线与社区技能工程标杆）

| 维度 | 内容 | 置信度 |
| --- | --- | --- |
| 产品定位 | 「Skills for Real Engineers」——把资深工程师纪律编码为 agent 可执行 markdown 技能；sam-skills 的直接上游（fork 基线 6654f6b / v1.2.3，D1，§开头/定位） | 已核实（SR-19、SR-20；D1） |
| 目标用户 | 使用 Claude Code/Codex 等技能型代理的工程师 | 已核实（SR-20） |
| 核心能力 | 四大失败模式各配救援技能：Agent 没干想要的事→grill-me/grill-with-docs（访谈）；太啰嗦→CONTEXT.md 统一词汇 + writing-for-agents；代码不 work→tdd 红绿循环 + diagnosing-bugs 六步；大泥球→to-spec/codebase-design/improve-codebase-architecture | 已核实（SR-20、SR-21） |
| 架构特点 | v1.2 的 grilling 改为 frontier 轮次制：先画决策树，把前置已 settle 的问题组成一轮全问，官方 PR 数据同样 13 问从 13 轮压到约 3 轮；事实问题交后台子代理查证、决策问题留给用户（事实与决策分离）；user-invoked（disable-model-invocation / allow_implicit_invocation: false 双侧配对）与 model-invoked 双轨 | 已核实（SR-19、SR-21） |
| 部署形态 | 纯本地 markdown；双分发哲学：Claude 官方 marketplace 托管插件（只读自动更新）vs skills.sh 可编辑拷贝（用户自管），官方明确警告勿双装 | 已核实（SR-21；D77，§install-block.md） |
| 集成方式 | Claude 插件 + skills.sh + Codex（v1.2 起每技能配 agents/openai.yaml 元数据镜像）；AGENTS.md→CLAUDE.md symlink 统一入口 | 已核实（SR-21；D66、D3） |
| 定价模式 | 开源免费（MIT）；生态数据：230k+ stars、18M+ 安装、grill-me 单技能约 508k 安装 | 已核实（SR-21，第三方统计口径） |
| 优势 | 技能工程方法论公开可查（aihero.dev 25 课目录）；改名/弃用全程留痕（/to-prd→/to-spec 在 7 分钟内完成提交级替换）；社区安装量证明管线需求真实 | 已核实（SR-19、SR-20、SR-21） |
| 局限 | 迭代剧烈带来语义漂移（第三方追踪文记录多起改名与弃用）；已知路由缺陷（ask-matt docs 页自录：误报缺技能、路由时不读 SKILL.md 正文——sam-skills 摘要亦收录，D22，§已知 bug） | 已核实（SR-19；D22） |
| 对本项目的参考价值 | fork 的合法性基线：上游把「规划线程人类决策、事实交代理」的分工在 v1.2 进一步制度化，与 fork 的 SPEC READY 门/ receipt 契约方向一致；fork 的 40 行表达层预算与冲突决策树（D8、D12）正是为吸收此类上游漂移而设 | 推断（对照 D8、D12） |

### 2.3 关键技术能力横向事实

> 不评分、不排序，仅按能力维度横陈各方案事实。

| 能力维度 | B1 Claude Code | B2 Spec Kit | B3 Kiro | B4 OpenSpec | B5 OpenHands/SWE-agent | B6 上游 mattpocock/skills | 说明 / 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 规划/执行线程分离 | plan mode 只读规划 + Plan 子代理独立上下文，批准后转执行 | Specify→Plan→Tasks→Implement 四阶段，每阶段 Markdown 工件喂下一阶段 | 三文档三阶段门禁，逐段人工批准后才动代码 | Propose 先行，审批门在代码生成之前 | 无内建规划阶段（任务即输入） | grill 访谈→to-spec 成稿→to-tickets 拆票→implement 执行，阶段边界即上下文边界 | SR-3、SR-6、SR-8、SR-9、SR-10、SR-19 |
| 验收回执/结构化验收工件 | 无统一 receipt；子代理返回摘要 + hooks 侧效果 | checklist（需求可测性）+ analyze（跨工件一致性）+ converge（对照补差） | EARS 可测句式 + requirement→task 双向追溯 + SMT 查矛盾 | validate --strict 结构门 + delta 归档复真 | OpenHands EventLog 审计（过程侧非验收侧） | 无 receipt 机制（fork 的 receipt v2 六道门为 fork 自有新增，D39/D75） | SR-7、SR-9、SR-10、SR-11、D39 |
| 跨上下文交接契约 | 官方 harness 文：context reset + 结构化交接工件优于 compaction（context anxiety 论证）；子代理 fork/SendMessage | 工件文件即交接载体，无显式跨会话契约编译 | spec 持久化为 repo 工件，跨会话可读 | delta specs 持久化，archive 复真 | EventLog 持久化 + condenser 压缩 | handoff 交接文档 + CONTEXT.md/ADR 沉淀；to-goal 契约编译为 fork 新增（D41） | SR-5、SR-3、SR-11、D41 |
| 多 harness 支持 | 自家生态封闭，MCP/hook 开放 | 35+ 集成 + generic 兜底（框架级投入） | 深度绑定 AWS/Bedrock | 30 agents，零 API key 骑乘既有代理 | 模型无关，单 harness 形态 | Claude+Codex 双侧 invocation 同步（openai.yaml 配对，D66）+ 插件/skills.sh 双轨 | SR-6、SR-9、SR-10、SR-14、D66 |
| 需求/规则资产形态 | Skills 目录（三层披露）+ CLAUDE.md 记忆 | constitution + spec/plan/tasks 模板四层覆盖 | .kiro/specs + steering 文件 | openspec/specs 单一真相 | 仓库即状态（无独立规则资产） | CONTEXT.md glossary + docs/adr + 53 skills | SR-1、SR-6、SR-8、SR-10、SR-19、D2 |
| 机器可校验性 | Skills 元数据预算与过滤可查（/context） | 模板运行时解析 + 社区扩展 CI Guard | SMT 求解器查需求矛盾（2026 新增） | validate --strict 硬阻断 | EventLog 类型安全 | lint-skills/check-router 脚本机器校验为 fork 维护机制（D68） | SR-1、SR-6、SR-10、D68 |
| 基准成绩（口径各异，仅供参考） | Claude Code SWE-bench Verified 约 80% 档（第三方汇总） | 未参与 SWE-bench（管线框架） | 未公开 SWE-bench | 未参与 SWE-bench | OpenHands 66~77.6%、mini-SWE-agent 76.8%（配 Opus 4.5） | 未参与 SWE-bench | SR-11、SR-12（成绩为第三方汇总口径，非官方声明） |

**补充横向事实（Aider，主理人建议名单内、未入标杆详述的说明）**：Aider 为开源 CLI 结对编程工具，特点是深度 Git 集成（自动提交与可回滚）、repo map 上下文管理、BYOK 多模型；无规划/执行线程分离、无验收回执、无跨会话契约机制（SR-4 第三方评测口径）。其「小步提交 + 自动 lint/test 纠错环」思想与本仓 tdd 技能的红绿循环同向，但整体与本调研四命题契合度低，故不进入加权对比。

**Anthropic 官方一手工程结论（Q1/Q3 关键证据，SR-4、SR-5）**：
- 多代理研究系统采用 orchestrator-worker 模式：Opus 4 主导 + Sonnet 4 子代理在内部研究评测上比单代理 Opus 4 高 90.2%；token 用量单项解释 BrowseComp 80% 性能方差；多代理约 15 倍于聊天的 token 成本。
- 同文明确：**大多数编码任务的可并行度低于研究任务，且 LLM 代理实时协调授权能力不足，需要共享上下文的领域不适合多代理**——这是对「编码场景单活跃执行线程」的一手背书。
- 官方 harness 设计文（长任务）：模型存在 context anxiety（临近自估上下文上限时提前收工）；**compaction 保留连续性但不给干净状态，context reset + 结构化交接工件（structured handoff artifact）才是长任务正解**；并提出 planner/generator/evaluator 三代理架构与「生成者/评审者分离」以治理自我评价偏宽。

---

## 3. 对比：对比矩阵与加权评分

> **四段式「对比」段**。在 §2 事实基础上建立对比矩阵，赋予权重并打分。权重为研究侧建议值，business-architect 可在裁决时调整。

### 3.1 对比矩阵

> **每行权重之和 = 1.00**。评估维度按本次调研问题（Q1~Q5 与 sam-skills 四大核心命题）设定，模板默认的「合规可控性」维度因本项目为本地 CLI/Skills 仓库、无云部署、无数据出境与监管诉求（用户已确认跳过云现状核对）而由「本地优先/成本」吸收，特此说明。

| 评估维度 | 权重 | 权重理由 | B1 得分 | B2 得分 | B3 得分 | B4 得分 | B5 得分 | B6 得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 规划/执行管线契合度 | 0.30 | sam-skills 命题一/二的直接对标维度；主流程（grill→SPEC READY→receipt）是仓库主干，权重最高 | 4 | 5 | 5 | 4 | 2 | 4 |
| 跨上下文契约机制 | 0.25 | sam-skills 命题三（fork 继承 vs to-goal 压缩）是 fork 差异化核心，需独立于管线单独评估 | 5 | 3 | 3 | 3 | 3 | 4 |
| 技能/规则工程成熟度 | 0.20 | 仓库资产形态即 32 个 skills + CONTEXT.md/ADR，资产可维护性决定长期演化 | 5 | 3 | 3 | 3 | 2 | 5 |
| 多 harness 适配策略 | 0.15 | sam-skills 命题四；ADR 0003 已定调真适配器路线，此维度评估业界路线成本佐证 | 3 | 5 | 2 | 5 | 4 | 4 |
| 本地优先/成本可控 | 0.10 | 用户诉求明确本地 CLI/无云部署；商业绑定与计费争议在本项目语境下为负资产 | 3 | 5 | 2 | 5 | 5 | 5 |
| **加权总分** | **1.00** | — | **4.20** | **4.10** | **3.35** | **3.80** | **2.85** | **4.30** |

**评分标尺**：每项 1~5 分，1 = 严重不符合，3 = 基本满足但存在明显局限，5 = 完美契合。

**加权计算过程（可复核）**：
- B1 Claude Code：4×0.30 + 5×0.25 + 5×0.20 + 3×0.15 + 3×0.10 = 1.20 + 1.25 + 1.00 + 0.45 + 0.30 = **4.20**
- B2 Spec Kit：5×0.30 + 3×0.25 + 3×0.20 + 5×0.15 + 5×0.10 = 1.50 + 0.75 + 0.60 + 0.75 + 0.50 = **4.10**
- B3 Kiro：5×0.30 + 3×0.25 + 3×0.20 + 2×0.15 + 2×0.10 = 1.50 + 0.75 + 0.60 + 0.30 + 0.20 = **3.35**
- B4 OpenSpec：4×0.30 + 3×0.25 + 3×0.20 + 5×0.15 + 5×0.10 = 1.20 + 0.75 + 0.60 + 0.75 + 0.50 = **3.80**
- B5 OpenHands/SWE-agent：2×0.30 + 3×0.25 + 2×0.20 + 4×0.15 + 5×0.10 = 0.60 + 0.75 + 0.40 + 0.60 + 0.50 = **2.85**
- B6 上游 mattpocock/skills：4×0.30 + 4×0.25 + 5×0.20 + 4×0.15 + 5×0.10 = 1.20 + 1.00 + 1.00 + 0.60 + 0.50 = **4.30**

**打分依据要点（对应 §2 事实）**：
- B1 管线 4 分：plan mode + Plan 子代理成熟，但阶段工件化程度低于 B2/B3，管线靠生态而非内建命令；跨上下文 5 分：官方 harness 文一手背书 context reset + 结构化交接，且子代理 fork/SendMessage/持久记忆机制齐备（SR-3、SR-5）；技能工程 5 分：Skills 三层披露即官方事实标准（SR-1）。
- B2 管线 5 分：四阶段 + clarify/analyze/checklist/converge 质量门最完整（SR-7）；跨上下文 3 分：工件即交接但无显式契约编译；多 harness 5 分：35+ 集成 + generic 兜底（SR-6）。
- B3 管线 5 分：三文档三门禁 + SMT 查矛盾属最强门禁（SR-10）；多 harness 2 分、成本 2 分：Bedrock/credit 绑定与不滚存争议（SR-9）；本地优先维度负资产。
- B4 管线 4 分：状态机完整但无 plan/design 深工序（SR-10）；validate --strict 与 delta 语义是结构门最佳实践；多 harness 5 分（30 agents 零依赖）。
- B5 管线 2 分：无内建规划阶段（SR-13）；EventLog/ACI 在跨上下文与工具面维度有局部参考价值；本地优先 5 分（开源自托管）。
- B6 管线 4 分：主线完整但 receipt 闭环为 fork 新增、上游缺失（D39）；跨上下文 4 分：handoff/CONTEXT.md/ADR 齐备，to-goal 契约编译是 fork 补上的缺口（D41）；技能工程 5 分：53 skills + 双轨 invocation + 公开方法论（SR-20、SR-21）。

### 3.2 评分结论

> 基于加权总分形成三层结论。每层引用得分作为依据。**本节为调研侧评估结论，不构成对下游的边界冻结——裁决权归 business-architect。**

- **优先借鉴**：
  - **B6 上游 mattpocock/skills** — 加权总分 **4.30**（最高）。理由：规划/执行管线契合度 4 + 技能工程成熟度 5 + 本地优先 5；它既是 fork 的继承基线也是方法论源头，fork 的核心差异化（receipt 契约、to-goal、传输适配）恰好落在上游尚未覆盖的位置——继承与差异化边界天然清晰。
  - **B1 Claude Code 官方机制** — 加权总分 **4.20**（次高）。理由：跨上下文契约 5 分（官方一手论证 context reset + 结构化交接工件，SR-5）+ 技能工程 5 分（Skills 三层披露、invocation 双轨为官方事实标准，SR-1）；sam-skills 的资产形态与其官方机制同构，对齐成本最低。
- **部分借鉴**：
  - **B2 Spec Kit** — 加权总分 **4.10**。借鉴点：analyze（跨工件一致性分析）、checklist（需求可测性门）、converge（对照 spec 补差）三个质量门思想，可对照强化 receipt 六道门与 readiness checklist；不借鉴的部分：其 CLI/模板栈与四层模板覆盖机制（与 fork 的 skill 形态冲突）、35 集成的框架级投入。理由：管线维度 5 分证明其阶段工件化有效，但整体形态与本仓 skill 形态不兼容。
  - **B4 OpenSpec** — 加权总分 **3.80**。借鉴点：delta specs（ADDED/MODIFIED/REMOVED）增量语义可对照 receipt 的 Docs delta 结算（D39）；validate --strict「结构门硬阻断、验证不做编排」的极简边界印证 ADR 0003 的 refuse-not-degrade（D74）；不借鉴的部分：brownfield 单场景定位与「无编排」在多任务并行时能力缺口。
- **不借鉴（否决）**：
  - **B3 Kiro** — 加权总分 **3.35**。否决理由：多 harness 适配 2 分 + 本地优先/成本 2 分——商业绑定（Bedrock/credit 不滚存）与计费争议（SR-9）同本项目本地优先、无云部署前提直接冲突；整体产品形态不可借鉴。局部保留：EARS 可测句式（WHEN〈触发〉THE SYSTEM SHALL〈行为〉）与 requirement→task 双向可追溯，可作为 receipt 验收标准措辞的参考素材（局部思想吸收，非系统借鉴）。
  - **B5 OpenHands/SWE-agent** — 加权总分 **2.85**。否决理由：规划/执行管线契合度 2 分——沙箱自主代理路线（任务直接进执行循环）与 sam-skills「规划线程人类决策 + 执行线程受契约约束」的哲学分歧；且 Anthropic 官方结论（编码任务并行度低、不适合多代理，SR-4）反向支持单活跃执行线程设计（D75，§Decision 3）。局部保留：ACI「最小工具面越稳」与 EventLog 审计思想可作 receipt 遥测（D39，§Receipt metrics）的参考。

### 3.3 方案组合分析

> 单一方案无法覆盖 sam-skills 全部需求（事实上 sam-skills 本身就是「上游基线 + fork 差异」的组合体），故按能力项给出组合参考。

| 组合方式 | 覆盖哪些能力 | 未覆盖能力 | 组合复杂度 | 总体成本估算 |
| --- | --- | --- | --- | --- |
| B6 基线继承（现状）+ B1 官方机制对齐 | grill→spec→tickets 主线、invocation 双轨、插件分发、子代理隔离 | receipt 闭环、to-goal 契约、第三传输通道（fork 自有，需自持） | 低（现状即此组合） | 已沉没，增量维护为主 |
| 现状 + B2 质量门思想（analyze/checklist） | 规格一致性与可测性门进 readiness checklist/receipt 前置 | 不引入 B2 CLI，仅以本仓 skill 形态落地思想 | 中 | 约 1~2 个新 skill + eval 黄金任务各 2 条（对照 D16 粒度） |
| 现状 + B4 delta 语义 | Docs delta 结算的形式化（ADDED/MODIFIED/REMOVED 枚举进 receipt v2 Docs delta 字段细则） | 无重大缺口 | 低 | receipt v2 字段细则一次修订（X1 已确认 v2 为当前契约） |

---

## 4. 建议：取舍决策支持

> **四段式「建议」段**。基于 §2 事实 + §3 对比，给出可被 business-architect 直接采用的建议。**本节全部为建议而非最终裁决，最终边界由业务架构师冻结。**

### 4.1 自研 / 采购 / 复用边界建议

| 能力项 | 建议方式 | 建议依据 | 候选方案 / 系统 | 关键前提 |
| --- | --- | --- | --- | --- |
| 规划→执行管线骨架（grill/SPEC READY/执行路由） | 复用（已有底座） | 上游主线（B6，4.30 分）+ fork 自有技能已闭环（D22，§The main flow）；业界同位方案（B2/B3）无法整体移植 | mattpocock/skills 基线 + fork 新增技能 | 维持 40 行表达层预算与冲突决策树（D8、D12） |
| receipt 验收契约（v2 + 六道归档门） | 自研（保持 fork 差异） | 业界无同构物（§2.3 横向表）：B2 checklist 与 B4 validate 门是最近的先例但均无执行回执语义；fork 已有 schema 版本规则（D75，§Decision 1） | fork 自有（spec-executor/execute-spec-in-fork） | 借鉴 B4 delta 枚举细化 Docs delta 字段；schema 变更走版本 bump |
| receipt 机器校验器（六道门脚本化） | 自研 | D75 自评「门下纪律是 prompt 级、可检测非可防止」；业界 lint/CI 门模式成熟（B6 的 check-router/lint-skills 同模式，D68） | Node 脚本，参照 lint-skills.mjs / check-router.mjs 既有模式 | 先冻结 v2 字段清单（X1），再写校验器 |
| 阶段质量门（spec 一致性/可测性） | 自研（以 skill 形态吸收 B2 思想） | B2 的 analyze/checklist 在 4.10 分管线维度证明有效（SR-7）；B3 的 EARS 可测句式为措辞参考（SR-9） | 新增 1~2 个 skill + 黄金任务 | 需 receipt/metrics 数据积累后定形（见 4.2 顺序） |
| 传输适配层 | 复用（既有决策） | ADR 0003/0005「一适配器一文档、拒绝便携抽象」（D74、D76）；业界通用集成路线（B2 的 35+、B4 的 30 agents）是框架级投入，非单仓可负担；B1 官方多代理文证明编码场景不宜多代理编排（SR-4） | Codex App 适配器 + ZCode fork-loop-mcp + 手动 runbook 三通道 | ZCode 升级时重跑验证（ADR 0005 已内置）；能力表单点维护 |
| 评测体系（evals） | 复用 + 立即激活 | 协议已定义且零依赖（D14）但全部 0 runs（X4）——机制存在、证据为零 | docs/evals 既有 8 黄金任务 | G3 前完成首跑并回填 SCOREBOARD |
| 术语与规范资产（CONTEXT.md/ADR/规范文档） | 复用 | 领域建模机制成熟（D26、D2）；AGENTS.md 开放标准背书「agent 状态即资产」路线（SR-14） | 既有机制 | 修复 X3/X6 两处漂移后冻结本轮基线 |

### 4.2 MVP 范围建议

> 对用户诉求（生成完整架构方案）中可先行落地的能力给出调研侧 MVP 判断。

| 功能（对齐用户诉求与 fork 能力） | 建议 MVP？ | 理由 |
| --- | --- | --- |
| receipt 六道门脚本化校验器 | ✅ | 业界 lint/CI 门先例充分（B6 自身维护脚本即同模式，D68）；D75 明示 prompt 级门可检测非可防止，脚本化是补齐「防止」侧的最低成本路径 |
| eval 8 黄金任务首跑 + SCOREBOARD 回填 | ✅ | 协议零依赖（D14），成本低；X4 风险（质量声称无证据）的唯一直接解除手段；harvest 闭环（D30）依赖 eval 失败信号 |
| express lane（轻任务直通） | ✅ | 已实现且有 ADR 背书（D27、D75），保持即可 |
| 阶段质量门 skill（吸收 B2 analyze/checklist 思想） | ✅（P1，receipt 数据积累后） | B2 证明此类门有效（SR-7），但门规则需要 receipt metrics 与 friction log 数据定形（D30，§run/1），先跑数据再定门 |
| 第三 harness 适配器（如 Cursor/其他） | ❌ | ADR 0003 refuse-not-degrade 原则（D74）；B1/B2 生态机制差异大（§2.2.1、§2.2.2），通用便携层成本业界已证（SR-6 框架级投入）；等真适配器条件成熟再议 |
| to-goal 会话档位（Session recommendation）推广 | ✅（P1） | 机制已有（D41，§Session recommendation），推广成本低，与 B1 官方 context reset 论证同向（SR-5） |

### 4.3 技术栈参考建议

| 技术层 | 推荐方案 | 替代方案 | 选择理由 |
| --- | --- | --- | --- |
| 校验/工具脚本 | Node 18+ ESM（延续 lint-skills.mjs / server.mjs 先例，D68、D69） | Deno / Bun | 与 fork-loop-mcp 零依赖路线一致；B6 上游同栈，降低同步成本 |
| 代理-工具传输协议 | MCP stdio（fork-loop-mcp 现状） | 自定义 CLI 协议 | MCP 已成 agent 工具互联事实标准（B1、B5 原生支持，SR-3、SR-11）；ADR 0005 信箱协议刻意小到可丢弃（D76） |
| 评测执行 | 零依赖 markdown 协议 + 人工会话跑（现状，D14） | GitHub Actions CI 化（上游已有 release workflow 先例，D71 盘点） | D14 明确零依赖边界；CI 化作为 P1 可选项，勿在首跑前引入工具依赖 |
| 技能分发 | Claude plugin marketplace（自建 opsbli listing）+ skills.sh 双轨 | 单轨 | 上游已验证双轨并存与勿双装警告（D77）；X2 显示 Codex 插件轨道已实际存在但缺 ADR 级记录，需补档 |
| 规范/记忆资产 | CONTEXT.md（纯 glossary）+ docs/adr + docs/agents 三件套 | 引入 AGENTS.md 开放标准替换（不建议现阶段） | AGENTS.md 标准背书资产化方向（SR-14），但本仓 CLAUDE.md↔AGENTS.md symlink 已兼容（D3）；替换收益小于迁移成本 |

---

## 5. 风险与待确认项

> **四段式「风险」段**。列出调研中发现的主要风险、不确定信息、待业务架构师进一步裁决的依赖项。

### 5.1 主要风险清单

| 编号 | 风险描述 | 触发条件 | 影响范围 | 严重程度 | 缓解建议 |
| --- | --- | --- | --- | --- | --- |
| R-1 | 上游高速迭代击穿 fork overlay 预算：上游改动剧烈（/to-prd→/to-spec 7 分钟内完成替换、v1.2 重构 grilling 轮次制，SR-19、SR-21），继承技能表达层 40 行预算可能被上游结构性重写突破 | 上游重构触及 fork 已改造的继承技能 | 同步成本上升，40 行预算从 warn 转硬门（D8）后可能阻塞合并 | 高 | 提高 sync drill 频率（当前仅 1 次记录且零冲突，D11）；冲突命中时按 playbook c 路径及时晋升为 fork 全所有权技能（D12） |
| R-2 | 评测体系空转：evals 机制完整定义但 SCOREBOARD 全部 0 runs（X4），receipt 契约与 harvest 闭环的质量声称目前无任何运行证据 | 持续不首跑 | 下游不得引用评测结果作质量证据（X4 已明示）；缺陷信号通道（harvest 的 confirmed-defect）空转（D30） | 高 | G3 前完成 8 黄金任务首跑并回填 SCOREBOARD；repeat-test 规则按 D14 执行 |
| R-3 | 传输适配器随宿主版本腐化：ZCode 0.16.5 实测硬事实（--settings 参数宣传与实现错位、auth 桌面/CLI 分裂）随 ZCode 升级可能失效（D76，§Hard facts） | ZCode 版本升级 / provider 通道变更 | 自动闭环静默失效，退化为手动 runbook | 中 | 能力表单点维护 + 升级重验（ADR 0005 已内置）；保持手动 runbook 兜底与「适配器可丢弃」设计（D76，§Consequences） |
| R-4 | 术语与文档漂移累积：X3（goal-crafter README 指向外部仓库且内容漂移）、X6（ready-for-afk vs ready-for-agent 单字符级漂移）已存在两处 | 后续演化继续不分叉治理 | 下游消费误引；CONTEXT.md 领域语言失真（D2、D28、D44） | 中 | 经 harvest 起草 draft proposal 修订（D30 流程）；docs 页按 writing-docs 规则同步（D77） |
| R-5 | 分发轨道政策变化：上游官方 listing 存在 pin 滞后（技能数落后 main 两提交，D73，§Update 2026-08-05），fork 自建 listing 的审核与 pin 机制无公开契约 | marketplace 机制/政策调整 | 用户安装路径中断或版本滞后 | 中 | 双轨保持 + install-block.md 唯一话术（D77）；X2 的 Codex 插件轨道补 ADR 级记录，避免引用错位复发 |

### 5.2 待确认项（需主理人 / 业务方反馈）

| 编号 | 待确认项 | 不确定性说明 | 若无法确认的备选路径 |
| --- | --- | --- | --- |
| U-1 | Claude Code 官方 marketplace 对第三方 fork listing 的长期审核/pin 政策 | 官方文档未详述第三方 fork 审核细则；上游 pin 滞后案例（D73）为唯一实测样本 | 维持自建 marketplace（现状）+ 跟踪官方插件文档；skills.sh 轨道已可独立承载安装 |
| U-2 | ZCode headless 在用户自配第三方 provider 上的长期兼容承诺 | D76 实测基于 ZCode 0.16.5，属实测事实而非官方契约；provider-1113 负例样本仅覆盖单一失败形态 | 手动 runbook 永久兜底；信箱协议按 ADR 0005 设计为可丢弃，ZCode 原生长出会话原语即退役 |
| U-3 | 上游 mattpocock/skills 是否会把 receipt 类验收工件吸收进主线 | 无公开路线图可查（SR-19、SR-20 均无此迹象） | fork 差异标注机制已覆盖（D1，§与上游差异）；若上游吸收，按冲突 playbook a 路径评估放弃 fork 差异（D12） |

### 5.3 需业务架构持续关注的依赖项

| 编号 | 依赖项 | 说明 | 建议关注阶段 |
| --- | --- | --- | --- |
| DEP-1 | receipt schema v2 为当前契约的冻结点 | X1 确认 v1→v2 为时间线演进，下游应以 v2 为准（此为资料内部声明）；schema 增删改必 bump 的规则（D39）应进入系统设计的契约管理章节 | 高层架构设计（契约与版本管理部分） |
| DEP-2 | 单活跃执行线程 / 执行锁语义 | D75 的 Skeptic 幸存异议（prompt 级边界弱、跨 worktree 并行超范围）是架构决策的显式残留风险，D76 已用原子 mkdir 锁机械化；worktree fork 隔离是预留升级路径 | 高层架构设计（并发与边界部分） |
| DEP-3 | fork-loop-mcp 与插件分发的耦合 | MCP 服务随插件分发（D70，§mcpServers），影响部署形态与供应链安全（MCP 工具描述质量风险见 SR-4 官方论述） | 部署设计 + 安全设计（G5） |
| DEP-4 | eval 结果作为质量证据的时点约束 | 首跑完成前，所有下游章节不得引用评测结果作质量声称（X4）；harvest 闭环启动以首跑为前提 | 全部下游章节（G3~G6） |

---

## 6. 关键来源目录

> 集中列出全部调研所使用的公开资料。每条不低于 URL 粒度，关键来源注明用途章节。最后访问日期均为 2026-09-11。

| 编号 | 来源类型 | 标题 / 名称 | URL / 路径 | 相关章节 | 最后访问日期 |
| --- | --- | --- | --- | --- | --- |
| SR-1 | 官方文档 | Agent Skills Overview（Anthropic） | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | B1，§2.2.1；§2.3 技能资产行 | 2026-09-11 |
| SR-2 | 官方文档 | Agent Skills in the SDK（Claude Code Docs） | https://docs.claude.com/it/docs/agent-sdk/skills | B1，§2.2.1（plugins/skills 发现机制） | 2026-09-11 |
| SR-3 | 官方文档 | Create custom subagents（Claude Code Docs） | https://code.claude.com/docs/zh-CN/sub-agents | B1，§2.2.1（内置子代理/权限模式/记忆）；§3.1 B1 打分依据 | 2026-09-11 |
| SR-4 | 大厂工程博客 | How we built our multi-agent research system（Anthropic Engineering） | https://www.anthropic.com/engineering/multi-agent-research-system | §2.3 Anthropic 结论；§3.2 B5 否决依据；§4.1 传输适配层依据 | 2026-09-11 |
| SR-5 | 大厂工程博客 | Harness design for long-running application development（Anthropic Engineering） | https://www.anthropic.com/engineering/harness-design-long-running-apps | §2.3 Anthropic 结论（context reset/交接工件/三代理）；§3.1 B1 跨上下文 5 分依据 | 2026-09-11 |
| SR-6 | 官方站点 | GitHub Spec Kit | https://github.github.com/spec-kit | B2，§2.2.2；§2.3 多 harness 行 | 2026-09-11 |
| SR-7 | 开源仓库 | github/spec-kit（README：命令清单与集成列表） | https://github.com/github/spec-kit | B2，§2.2.2（五命令 + 辅助命令 + 集成）；§3.2 部分借鉴依据 | 2026-09-11 |
| SR-8 | 官方站点 | Kiro（AWS，What is spec-driven development） | https://kiro.dev/ | B3，§2.2.3 | 2026-09-11 |
| SR-9 | 第三方评测 | Kiro vs OpenSpec (2026)（codemyspec.com） | https://codemyspec.com/blog/kiro-vs-openspec | B3，§2.2.3（计费争议/EARS 局限）；B4，§2.2.4 | 2026-09-11 |
| SR-10 | 第三方评测 | Spec Kit vs Kiro vs OpenSpec: Spec-Driven Development Tools Compared（levelop.dev） | https://levelop.dev/blog/spec-driven-development-tools-compared | B3，§2.2.3（EARS/SMT/门禁）；B4，§2.2.4（delta/validate） | 2026-09-11 |
| SR-11 | 第三方评测 | OpenHands vs SWE-agent（codesota.com，含 SWE-bench Verified 汇总） | https://codesota.com/agentic/openhands-vs-swe-agent | B5，§2.2.5（架构与成绩） | 2026-09-11 |
| SR-12 | 第三方评测 | OpenHands vs SWE-Agent (2026): SWE-bench Scores Compared（localaimaster.com） | https://localaimaster.com/blog/openhands-vs-swe-agent | B5，§2.2.5（融资/企业特性/新题通过率） | 2026-09-11 |
| SR-13 | 百科/汇编 | SWE-agent（aiwiki.ai，ACI 概念与 mini-SWE-agent） | https://aiwiki.ai/wiki/swe_agent | B5，§2.2.5（ACI 与 100 行基线） | 2026-09-11 |
| SR-14 | 开放标准 | AGENTS.md（agents.md 官方站点） | https://agents.md/ | §2.3 规则资产行；§4.3 技术栈建议；§4.1 术语资产行 | 2026-09-11 |
| SR-15 | 官方文档 | Rules（Cursor Docs） | https://cursor.com/docs/context/rules | §1.2 Q5；B1 对照（规则激活模式） | 2026-09-11 |
| SR-16 | 百科/汇编 | Cursor Rules（aiwiki.ai，四模式与版本演进） | https://aiwiki.ai/wiki/cursor_rules | §1.2 Q5（AGENTS.md 原生支持时间线） | 2026-09-11 |
| SR-17 | 社区实践 | Getting 10x More Out of OpenAI Codex（genalphai.com） | https://genalphai.com/openai-codex-power-user-playbook | §2.3（Codex 沙箱/审批双轴、AGENTS.md 收集规则） | 2026-09-11 |
| SR-18 | 社区实践 | How to write OpenAI Codex AGENTS.md instructions（understandingai.net） | https://understandingai.net/codex-master-prompt | §2.3（完成判据写法先例，Q2 证据） | 2026-09-11 |
| SR-19 | 社区追踪 | Matt Pocock's skills, mapped（skillselion.com，v1.1 全量追踪） | https://skillselion.com/guides/matt-pocock-skills-map | B6，§2.2.6（改名/弃用史、安装量）；R-1 依据 | 2026-09-11 |
| SR-20 | 官方站点 | AI Skills for Real Engineers（aihero.dev skills catalog） | https://www.aihero.dev/skills-catalog | B6，§2.2.6（25 课方法论目录） | 2026-09-11 |
| SR-21 | 社区文章 | What Makes the Matt Pocock 'Skills' Repo Reach 230K Stars and 18M Installs?（besthub.dev） | https://www.besthub.dev/articles/what-makes-the-matt-pocock-skills-repo-reach-230k-stars-and-18m-installs-a36190c0b852 | B6，§2.2.6（体量与双分发）；R-1 依据 | 2026-09-11 |
| SR-22 | 社区实践 | AI 编程助手横向对比（gaudeztechlab，Cursor Plan mode 与多代理界面） | https://www.gaudeztechlab.com/en/ressources/coding-with-ai-in-2025 | §2.3 补充（Cursor 2025-10 起 Plan mode 与并行代理界面）；Aider 横向事实行 | 2026-09-11 |

**来源分级说明**：SR-1/2/3/6/7/8/14/15/20 为官方一手来源；SR-4/5 为官方工程博客一手来源；SR-9/10/11/12/13/16/17/18/19/21/22 为第三方评测与社区实践——凡引用社区口径处均已在正文标注「社区实践/第三方评测口径」，与官方声明区分。本项目内部事实一律以 material_digest.md 的 D 编号与冲突编号 X1~X6 溯源，二者不混用。

---

## 7. 硬指标清单

> 汇总本报告所有章节硬指标，供自动校验与人工审核使用。

| 章节 | 硬指标项 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| §1 | 调研问题已收敛为 ≥ 3 条可执行问题 | ✅ | 5 条（Q1~Q5），每条含对象/目标/产出 |
| §2.1 | 标杆系统 ≥ 3 家，含 ≥ 1 家头部 SaaS | ✅ | 6 家；B1 Claude Code、B3 Kiro 为头部 SaaS/云厂商代表 |
| §2.1 | 标杆系统 ≥ 1 家开源或自研代表 | ✅ | B2/B4/B5/B6 均为开源代表 |
| §2.2 | 每家标杆有独立详述卡片 | ✅ | B1~B6 六张卡片，10 维度逐行标注置信度 |
| §2.3 | 关键能力横向事实无遗漏 | ✅ | 7 个能力维度 × 6 家 + Anthropic 一手结论 + Aider 取舍说明 |
| §3.1 | 对比矩阵含 5 维度 + 权重 + 评分 | ✅ | 5 维度，权重 0.30+0.25+0.20+0.15+0.10 = 1.00，计算过程可复核 |
| §3.2 | 评分结论含优先/部分/不借鉴三层 | ✅ | 优先（B6/B1）、部分（B2/B4）、不借鉴（B3/B5），逐条引用得分 |
| §4.1 | 自研/采购/复用边界有明确建议 | ✅ | 7 个能力项，每项含依据/候选/前提 |
| §4.2 | MVP 范围建议与用户诉求对齐 | ✅ | 6 项功能逐条判断 |
| §5.1 | 主要风险 ≥ 3 条，有缓解建议 | ✅ | R-1~R-5 五条，每条含触发条件/影响/缓解 |
| §6 | 关键来源可追溯（URL / 章节） | ✅ | SR-1~SR-22 共 22 条，全部含 URL 与用途章节；官方/社区口径分级标注 |
| 全文 | 明确区分事实 / 推断 / 建议 / 风险 | ✅ | 四段式组织；卡片逐行置信度；社区口径显式标注 |
| 全文 | 不存在编造来源或占位符 | ✅ | 无〈...〉占位、无待验证类残留标记、无待定字样；sam-skills 内部事实全部 D/X 编号溯源 |

---

## 附录 A：中间确认自检报告（协议 §2.4）

> 按《阶段内中间确认协议》要求，在 §1、§2.1、§3.1、§5.2 四个关键决策点完成后各插入一次自检：先按协议 §2.1 判定，再按 §2.3 反向验证 3 问。**本轮四个决策点均未命中触发条件，故未发起 [中间确认]**；以下如实记录每次自检的判定与 3 问证据。

### 自检 1：§1 调研问题收敛后

- **§2.1 判定**：未命中。调研问题收敛方向与主理人建议名单一一映射（候选标杆、核心命题均已由主理人消息显式给出），不存在 ≥2 种各有合理性且无法单方裁决的方案分歧。
- **反向 3 问**：
  - Q1（返工成本）：若标杆名单调整需重写 §1/§2 两章，估值约 0.5~1 人日，可控。
  - Q2（可感知性）：报告经 G2 人工审核，用户在审核弹窗中可见并裁决——属正常 Gate 路径而非未经确认的既成事实。
  - Q3（与诉求一致性）：用户诉求显式要求「需要行业调研」（主理人任务消息原文），本收敛与之直接一致。
- **证据**：主理人调度消息「调研方向建议（可自行扩展）」原文；§1.2 收敛说明段。

### 自检 2：§2.1 标杆清单定稿后

- **§2.1 判定**：未命中。候选标杆超出 3 家（6 家入清单）属「覆盖更全」而非「取舍分歧」；行业/地域范围由项目性质唯一确定（AI coding 工具生态、公开来源、无本地化合规约束）。
- **反向 3 问**：
  - Q1：换标杆需重写 §2/§3，约 1~2 人日，可控。
  - Q2：用户经 G2 审核可见标杆名单与取舍理由；无对外承诺变化。
  - Q3：主理人建议名单即用户侧输入，本清单为其超集（扩展权已授权），一致。
- **证据**：§2.1 清单表；§1.2 收敛说明中 Aider 降级的显式记录。

### 自检 3：§3.1 权重设定前

- **§2.1 判定**：未命中。存在「沿用模板默认权重」与「按项目四命题重设」两种做法，但模板明文授权「评估维度与权重可根据本次调研问题调整，但必须保留并给出理由」——属上游已授权的专业裁量，不同权重方案在本项目语境下的差异可由主理人已给定的四大核心命题直接推导（管线 0.30 + 契约 0.25 覆盖命题一/三，适配 0.15 覆盖命题四，技能工程 0.20 覆盖生态定位，成本 0.10 覆盖本地优先约束），第 1 条「无法仅凭专业判断单方裁决」不成立。
- **反向 3 问**：
  - Q1：若权重被推翻，仅需重算 §3 矩阵并同步 §3.2 结论，约 0.5 人日，可控。
  - Q2：权重不改变任何用户可见行为；权重与理由在 G2 审核中可见，用户可否决——裁决通道存在。
  - Q3：用户诉求未显式提及权重（注明：用户诉求/material_digest 均无权重相关表述）；权重设定不改变产品形态与对外承诺。
- **证据**：§3.1 每行权重理由列；模板原文「权重可根据本次调研问题调整」；§3.1 引言「权重为研究侧建议值，business-architect 可在裁决时调整」。

### 自检 4：§5.2 待确认项整理时（最后一轮完整复核）

- **§2.1 判定**：未命中。全部取舍建议（§4.1）不涉及绑定外部供应商、合同或长期商务条款（均为开源/本地生态内建议）；三个待确认项均为「持续跟踪型」而非「阻塞性不可得」，各有备选路径，不影响本报告结论成立。
- **反向 3 问**：
  - Q1：§4 建议若被 business-architect 推翻，返工 = §4 一章 + 下游架构章节局部调整，约 1 人日内，可控。
  - Q2：本项目为本地 CLI/Skills 仓库，无客户合同、无监管与对外承诺变化；用户仅在 G2/G3 审核中感知结论本身。
  - Q3：建议方向（保持 fork 差异、receipt 脚本化、eval 首跑）与用户诉求「基于我的项目背景和资料生成完整架构方案」直接一致，未偏离任何显式提及的能力或形态。
- **证据**：§4.1 候选方案列全部为开源/自研资产；§5.2 U-1~U-3 备选路径列；R-1~R-5 均有缓解建议。

### 结论

四个关键决策点均未命中协议 §2.1（方案分歧）或 §2.2（不可逆/跨界感知）触发标准，反向验证 3 问全部给出具体证据。**本报告未发起 [中间确认]，且明确声明：§3 加权打分与 §4 全部建议均为调研侧评估意见，不构成对下游 business-architect 的已冻结输入。**

---

## 附录 B：调研方法与工具清单

| 项 | 内容 |
| --- | --- |
| 方法论 | tech-research-advisor 六阶段流程（问题识别 → 分层抽象 → 多维收集 → 候选整理 → 业务特征分析 → 综合评估），叠加本角色模板的「事实→对比→建议→风险」四段式 |
| 检索工具 | WebSearch（共 11 次，中英文关键词交替，预算 15 次内）；来源优先级：官方文档/工程博客 → 开源仓库/官方站点 → 第三方评测与社区实践（口径分级标注） |
| 内部资料 | material_digest.md（G1 已过）：77 份资料的 D 编号溯源体系 + 冲突 X1~X6；本报告内部事实引用不与外部来源混用 |
| 检索轮次 | 第一轮（标杆官方资料 3 次）→ 第二轮（SDD 三强/AGENTS.md/自主代理 3 次）→ 第三轮（上游生态/Cursor Rules/Claude Code 机制 3 次）→ 第四轮（Codex CLI/Anthropic 工程博客 2 次） |
| 已知局限 | ①SWE-bench 成绩均为第三方汇总口径，未经各官方逐项核验；②Kiro 计费争议引自社区舆论（Hacker News 用户引述），代表社区情绪而非官方承认；③Claude Code marketplace 第三方 fork 审核细则无公开文档（已列入 U-1 持续跟踪） |

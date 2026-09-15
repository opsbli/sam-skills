---
name: from-prototype
description: Turn a product prototype link or UI screenshots into a structured plan draft with decision branches — the intake step before grill-me. Produces the draft only; does not interview, does not build UI.
disable-model-invocation: true
---

# From Prototype

The intake step before `grill-me`. Product hands over a prototype link or
screenshots; this skill converts them into a **plan draft** — structured,
plain-language, every inference marked — so `grill-me` has something concrete
to interrogate instead of starting from thin air.

Pipeline position: **from-prototype → grill-me → to-spec**.

## When to use / not use

Use when:
- The user provides a prototype URL (Axure, Figma, Modao/墨刀, MasterGo,
  Lanhu/蓝湖, 即时设计, or any live page) and wants requirements out of it.
- The user provides UI screenshots / design images and wants a plan.
- The user says "产品给了原型/设计稿" and the next step would otherwise be
  grilling on nothing.

Do NOT use when:
- The user already has a written plan or draft → go straight to `grill-me`.
- The user wants the page *rebuilt as code* → that is implementation, not
  intake. This skill never writes UI code.
- The user wants a throwaway code prototype to answer a design question →
  use `prototype`.

## Workflow

### Step 1: Capture the source

Try strategies in priority order, fall back gracefully:

1. **Browser automation** (preferred): navigate to the URL, read the page
   structure, screenshot key screens. Prototype tools often hide content
   behind JS — interact (click menus, open dialogs) when reachable.
2. **WebFetch**: raw HTML fallback. Many prototype platforms require login;
   if blocked, ask the user for exported images or a share link with access.
3. **Screenshots/images**: analyze directly. When both URL and images are
   given, the images are the source of truth for what the UI actually shows.
4. **User narration**: if neither link nor image is accessible, interview the
   user minimally to get the page list and key flows — then proceed.

If access fails entirely, say so and stop. Do not invent content.

### Step 2: Extract requirement facts, not pixels

You are mining the prototype for **requirement-relevant facts**, not cloning
the design. Extract:

- Page tree and navigation structure (menus, tabs, routes)
- Per page: fields, control types, buttons/actions, table columns
- Flows: what action leads where, multi-step wizards, dialog triggers
- Business rules visible in the UI: defaults, options, status values, formats
- Validation hints: required markers, error copy, disabled-state logic

Language rules (same discipline as design docs):
- Plain business language only — "下拉选择" not "el-select", "按钮" not
  "el-button type=primary". No framework names, CSS values, or pixel sizes.
- Describe what the UI *does and requires*, never how it is implemented.

**Mark every inference.** If something is not directly visible in the source
(behavior behind a button you can't open, a rule you deduced from layout),
tag it `[待确认]` with a one-line reason. Never present a guess as fact.

### Step 3: Write the plan draft

Write the draft to `drafts/<topic>-plan-draft.md` in the current workspace
(create the folder if needed; if the user named a location, use that).
Template:

```markdown
# <主题> 需求草案（from-prototype）

> 来源：<URL / 图片清单 / 用户口述>
> 抓取日期：<date>　覆盖页面：<n/n>　未覆盖：<list or "无">

## 背景与目标
从原型推断的产品目标。推断部分必须标 [待确认]。

## 范围
本次草案覆盖的页面与功能；明确不覆盖的部分。

## 页面与功能清单
### <页面名>
- 描述：页面包含的字段、控件、操作（纯业务语言）
- 输入/前置条件：进入条件、数据来源
- 输出/后置条件：操作结果、跳转、提示
- 校验限制及提示：必填、格式、范围、无数据展示
（一个页面多个弹窗/操作就拆成多节，各自完整。）

## 业务规则
跨页面的规则：状态流转、权限可见性、枚举取值、计算逻辑。

## 未决问题
所有 [待确认] 项的汇总清单，每条一行，按页面分组。

## 初步决策分支
3–6 个顶层决策分支（grill-me 的访谈入口），按依赖顺序排列。
```

### Step 4: Hand off to grill-me

End with a compact handoff block:

```text
DRAFT READY

- Source: <prototype URL / images>
- Draft: <path to plan draft>
- Coverage: <pages captured / pages total>
- Open questions: <count> 条 [待确认]
- Decision branches: <top-level branches, one line each>
- Next route: grill-me（项目无领域模型）| grill-with-docs（项目有 CONTEXT.md / ADR）
```

Then stop. Do not start the interview yourself — that is grill-me's job.

## Boundaries

- **No code.** Not even scaffolding. Output is exactly one markdown draft.
- **No pixel fidelity.** Layout notes only where they carry requirement
  meaning (grouping implies a relationship; tab order implies a flow).
- **No silent invention.** Missing access, unreadable screens, or ambiguous
  behavior become `[待确认]` entries, never fabricated answers.
- **No interview.** Questions are collected into the draft, not asked
  one-by-one. Interrogation belongs to grill-me.

## It's working if

- Every page reachable in the source appears in the draft, or is listed as
  not covered with a reason.
- Every inferred statement carries `[待确认]`; every directly-observed fact
  carries no tag.
- The decision-branch list is what grill-me opens with — no "it depends"
  left floating outside it.

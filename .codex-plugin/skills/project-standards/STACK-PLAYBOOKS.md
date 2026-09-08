# Stack Playbooks

Detection heuristics and exploration checklists per stack. A playbook answers **"what to probe"** — it never prescribes what the standard should be. When several playbooks match (common: a backend + a frontend in one repo), run each and produce one standards document per concern, or one per repo when the user keeps them separate.

## Generic (any repo)

Probe when nothing below matches:

- Manifests and build: build tool, run/build/test commands, CI files.
- Layout: top-level directories, naming conventions, where tests live.
- Docs: README, CONTRIBUTING, docs/, existing AGENTS.md/CLAUDE.md instructions.
- Tests: framework, count, how they run, whether CI runs them.
- Config: where environment differences live, how secrets are handled.

## Spring Boot / RuoYi-style Java backend

**Detect:** `pom.xml` with `spring-boot` dependencies; RuoYi markers: `ruoyi-*` module names, `org.dromara` groupId, `BaseMapperPlus`, `ruoyi-generator` module.

Probe:

- **Skeleton:** package layout per module (`controller/service/service.impl/mapper/domain`), base classes (`BaseController`, `BaseEntity`, `TenantEntity`), return types (`R<T>`, `TableDataInfo`), mapper base (`BaseMapperPlus`), DI style, exception handling, permission annotations (`@SaCheckPermission` pattern).
- **Generator:** is there a code generator (`ruoyi-generator`, Velocity `.vm` templates, mybatis-plus-generator)? What does its output skeleton look like? Which existing classes follow it, which don't?
- **DDL:** all `.sql` files and their directories. Audit columns present per table generation (`create_dept/create_by/create_time/update_by/update_time/del_flag/tenant_id` frequency counts), PK strategy (snowflake vs AUTO_INCREMENT), `del_flag` semantics in comments, physical FKs, index habits. Quote 3–5 contrasting DDL excerpts.
- **Migrations:** flyway/liquibase present? If manual: directory conventions for baseline vs incremental scripts, idempotency guards (`information_schema`, `IF NOT EXISTS`, `INSERT IGNORE`), file-header conventions, how fresh-env vs existing-env installs differ.
- **Config:** `application*.yml` inventory, profile activation mechanism, datasource definition, `${ENV:default}` usage vs hardcoded values, plaintext secrets (report location only).
- **Tests:** count and type (Mockito unit / Spring integration), tags/groups, whether default build runs them (`skipTests`, surefire groups), test config source (H2? real DB from yml?), integration base classes.
- **Docs:** AGENTS.md coding rules, docs/adr, design docs referenced from code comments.

## Vue 3 + TypeScript frontend

**Detect:** `package.json` with `vue` ^3, `vite`, TS; RuoYi markers: `ruoyi-vue-plus` name, `v-hasPermi`, `useDict`.

Probe:

- **API layer:** request wrapper (single axios instance?), `src/api` organization, type-file conventions (`types.ts`, `XxxQuery/XxxVO/XxxForm`).
- **Component reuse:** `src/components` inventory with purpose; per-page reuse vs raw UI-library usage counts (search forms, tables, pagination, toolbars, dict tags, dialogs); two-generation patterns coexisting — name both with counts.
- **Page patterns:** list-page skeleton, hooks/composables inventory and adoption counts, permission directive usage, global-property access pattern (`getCurrentInstance` proxy).
- **Verification floor:** test files count and location, `test`/`typecheck`/`lint` scripts presence, CI files, git hooks; what "done" verifiably means today (build only?).
- **Engineering:** package manager(s) and lockfiles, Node version declarations, env files and what's committed in them (report secrets as locations only), proxy config, TS strictness flags actually enabled, prettier/eslint config vs existing-code reality.

## Adding a playbook

When a `generate` run on an unrecognized stack produces a useful probe list, offer to fold it back into this file as a new section — detection markers first, then probes grouped by concern. Playbooks are heuristics for exploration, so they may be extended by agents; standards documents may not.

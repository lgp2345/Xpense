# AGENTS.md

## 项目简介

个人记账系统，包括 APP 端、WEB 端和 API 服务。
技术栈：React Native、React、NestJS、PostgreSQL。
仓库采用 Turborepo + pnpm workspace 管理。

## 仓库结构

默认目录结构：

- `apps/mobile`：React Native App
- `apps/web`：React Web
- `apps/server`：NestJS API
- `packages/shared`：共享类型、工具函数、常量
- `packages/database`：数据库 schema、migration、seed

## 硬性规则（必须遵守，CI 会验证）

1. 单文件不超过 300 行
2. 新增代码必须有对应测试
3. 使用结构化日志，禁止 `console.log`
4. 禁止提交真实密钥、token、密码或个人敏感配置
5. 新增环境变量必须同步更新 `.env.example`

## 开发命令

默认使用 pnpm，通过 Turborepo 编排任务。

常用命令：

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`

如具体子项目命令不同，以对应 `package.json` scripts 和 `turbo.json` pipeline 为准。

## Turborepo 规则

- 新增 app 或 package 时，必须接入 pnpm workspace
- 新增可缓存任务时，必须同步更新 `turbo.json`
- `build`、`test`、`lint`、`typecheck` 应保持可被 turbo 调度
- 不要在 package 之间引入循环依赖
- shared package 不得依赖具体 app

## 测试要求

- 新增业务逻辑必须有单元测试
- 修复 bug 必须先补充能复现问题的测试
- API 关键流程需要集成测试
- 测试不得依赖真实外部服务
- 不允许为了通过测试删除或弱化有效断言

## 代码规范

- 保持模块职责单一，避免大文件和大函数
- React / React Native 组件只保留必要 UI 逻辑，复杂逻辑抽到 hook 或 service
- NestJS 按 module、controller、service、repository 分层
- 共享类型和通用工具优先放入 `packages/shared`
- 数据库相关 schema、migration、seed 放入 `packages/database`

## 日志规范

- 禁止使用 `console.log`、`console.warn`、`console.error`
- 服务端必须使用结构化 logger
- 日志中不得输出密码、token、银行卡号等敏感信息
- 错误日志应包含可追踪上下文，但不能泄露用户隐私

## 数据库规范

- 数据库变更必须通过 migration 管理
- migration 文件命名应能说明业务意图
- 涉及金额的字段不得使用浮点数
- 删除数据优先考虑软删除，除非明确需要物理删除

## 文档查询

涉及库、框架、SDK、API、CLI 工具或云服务的问题时，必须使用 ctx7 查询当前文档。

流程：

1. `npx ctx7@latest library <name> "<user's question>"`
2. 选择最佳 `/org/project`
3. `npx ctx7@latest docs <libraryId> "<user's question>"`

如果 ctx7 出现额度错误，提示用户登录或设置 `CONTEXT7_API_KEY`。
如果出现网络/DNS 错误，应按环境规则在 sandbox 外重试。

## 提交规范

提交信息使用：

- `feat`: 新功能
- `fix`: 修复
- `refactor`: 重构
- `docs`: 文档
- `test`: 测试
- `chore`: 工具链、依赖、配置
- `ci`: CI/CD 配置
- `perf`: 性能优化

提交前应确认：

- `pnpm test` 通过
- `pnpm lint` 通过
- `pnpm typecheck` 通过
- 没有 `console.log`
- 没有真实密钥

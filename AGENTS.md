# AGENTS.md

## 项目简介

个人记账系统，包括 APP 端、WEB 端和 API 服务。
本文件只记录 Agent 执行规则；项目架构、技术栈、目录结构和系统边界详见同目录 `ARCHITECTURE.md`。

## 硬规则

- 修改代码前，先给出可选方案并等待确认。
- 默认使用中文沟通、说明和评审。
- 未经确认，不进行实质性代码写入、删除、迁移、重构。
- 读取文件、运行只读检查、给出方案不需要确认；写入、删除、迁移、重构、安装依赖、提交代码必须确认。
- 不得覆盖、回滚或污染用户已有未提交改动。
- 新发现的稳定约定，需要提示是否沉淀到公共规范。
- 业务源文件原则上不超过 300 行；生成文件、migration、lockfile、快照、配置聚合文件除外。
- 使用结构化日志，禁止 `console.log`

## 开发命令

默认使用 pnpm，通过 Turborepo 编排任务。

常用命令：

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`

如具体子项目命令不同，以对应 `package.json` scripts 和 `turbo.json` pipeline 为准。

## 测试要求

- 新增业务逻辑必须有单元测试
- 修复 bug 必须先补充能复现问题的测试
- API 关键流程需要集成测试
- 测试不得依赖真实外部服务
- 不允许为了通过测试删除或弱化有效断言

## 实现边界

- 代码组织、目录职责、共享包边界、数据库归属、金额和时间策略详见 `ARCHITECTURE.md`
- 不得为了完成局部任务绕过既有架构边界；需要调整架构时先给方案并等待确认

## 日志规范

- 禁止使用 `console.log`、`console.warn`、`console.error`
- 服务端必须使用结构化 logger
- 日志中不得输出密码、token、银行卡号等敏感信息
- 错误日志应包含可追踪上下文，但不能泄露用户隐私

## 文档查询

涉及库、框架、SDK、API、CLI 工具或云服务的问题时，必须使用 ctx7 查询当前文档。

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

# ARCHITECTURE.md

## 项目定位

个人记账系统，包括移动端、WEB 后台和 API 服务。
系统优先保证记账录入、查询筛选、预算管理、统计分析和用户配置等核心流程稳定、清晰、可维护。

## 总体技术栈

- 移动端：React Native
- WEB 端：React
- 服务端：NestJS
- 数据库：PostgreSQL
- 仓库管理：Turborepo + pnpm workspace

## 目标目录结构

- `apps/mobile`：React Native App
- `apps/web`：React Web
- `apps/server`：NestJS API
- `packages/shared`：共享类型、工具函数、常量

## 代码组织原则

- 保持模块职责单一，避免大文件和大函数。
- React / React Native 组件只保留必要 UI 逻辑，复杂逻辑抽到 hook 或 service。
- NestJS 按 module、controller、service、repository 分层。
- 共享类型和通用工具优先放入 `packages/shared`。

## 系统边界

- 移动端和 WEB 端只通过服务端 API 访问业务数据。
- 服务端是业务规则、权限边界、事务一致性和数据访问入口。
- 客户端负责展示、交互、表单状态和必要的轻量校验。
- 数据库实现细节不暴露给移动端和 WEB 端。

## 数据库归属

数据库相关 schema、migration、seed、连接配置和数据访问入口统一放入 `apps/server/src/db`。
这样可以让数据库结构归属于服务端实现细节，避免客户端或共享包直接依赖数据库层。

数据库变更必须通过 migration 管理，migration 文件命名应能说明业务意图。
删除数据优先考虑软删除，除非明确需要物理删除。

## 共享包边界

`packages/shared` 只放跨端稳定共享的内容：

- 业务类型
- 常量
- 纯工具函数
- 与运行环境无关的校验或格式化逻辑

不得放入数据库连接、服务端密钥、平台专属实现或有副作用的运行时代码。

## API 边界

- API 同时服务移动端和 WEB 端，接口语义必须稳定。
- 请求、响应和错误结构应保持一致，便于客户端统一处理。
- 分页、排序、筛选、金额、日期和时区相关约定应全局统一。
- 不在 API 响应中暴露密码、token、内部异常栈或数据库细节。

## 金额与时间

- 涉及金额的字段不得使用浮点数。
- 金额优先使用整数最小货币单位，或使用明确的 decimal 字符串策略。
- 日期、时区、货币和分类展示必须在多端保持一致。

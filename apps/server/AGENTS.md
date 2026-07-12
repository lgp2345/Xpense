# apps/server/AGENTS.md

## 适用范围

本文件专用于个人记账系统的后端服务。
后端服务负责为移动端和 WEB 后台提供统一 API。
这里的规则继承根目录 `AGENTS.md`，并补充服务端专属约束。
服务端架构、技术栈、目录边界和数据访问边界详见同目录 `ARCHITECTURE.md`。

## 服务端实现规则

- 必须遵循同目录 `ARCHITECTURE.md` 的分层、数据库、API、认证、事务和配置边界
- controller 不得承载业务逻辑，不得直接调用 Drizzle
- 全局启用请求校验 pipe
- 异常通过 NestJS exception/filter 体系处理，不直接返回临时错误对象
- 不直接依赖 Express 专属 middleware 或 request/response API
- 需要原始 SQL 时必须封装、参数化，并说明原因
- migration 必须和 schema 变更一起提交
- 业务接口不得绕过认证和用户作用域校验

## 依赖注入

- controller、service、repository、guard 等 Nest provider 必须优先使用构造器注入，不使用属性注入或静态属性保存依赖
- 注入普通 class provider 时，依赖 TypeScript 构造器类型元数据解析，不额外使用 `@Dependencies()` 或 `@Inject()`
- 作为构造器注入 token 的 class 必须使用运行时 import，不得改成 `import type`；Biome 已对 `apps/server/src/**/*.ts` 关闭 `useImportType`，普通业务类型仍应主动使用 `import type`
- 注入 Symbol、字符串或其他自定义 token 时，必须在对应构造器参数上使用 `@Inject(TOKEN)`；TypeScript interface 或 type 不得直接作为运行时注入 token
- 构造器注入字段默认声明为 `private readonly`；可选依赖也优先通过构造器组合 `@Optional()` 与 `@Inject(TOKEN)` 显式声明

## 安全与日志

- 数据库连接字符串、JWT secret、第三方密钥不得提交到仓库
- 禁止使用 `console.log`、`console.warn`、`console.error`
- 必须使用结构化 logger
- token、session、密码等敏感信息不得写入日志
- 不得记录密码、token、银行卡号、完整身份证号等敏感信息
- 不在响应中暴露密码、token、内部异常栈或数据库细节

## 测试要求

- 新增 controller、service、repository 必须有对应测试
- service 测试覆盖业务规则、权限边界和异常路径
- repository 测试覆盖关键查询条件和数据映射
- API E2E 测试必须覆盖成功、校验失败、未认证和无权限场景
- Fastify E2E 测试使用 `app.inject`
- 测试不得依赖真实外部服务
- 修复 bug 必须先补充能复现问题的测试

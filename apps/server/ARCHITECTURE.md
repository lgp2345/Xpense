# apps/server/ARCHITECTURE.md

## 服务定位

后端服务负责为移动端和 WEB 后台提供统一 API。
它是系统的业务边界、权限边界、事务边界和数据访问入口。

账户、分类、交易、预算、统计、用户配置等业务规则应优先在服务端落地。
客户端只负责展示、交互和必要的轻量校验。

## 技术栈

- NestJS
- Fastify
- Drizzle ORM
- PostgreSQL
- TypeScript

## 目录结构

- `src/main.ts`：应用启动和全局中间件配置
- `src/app.module.ts`：根模块
- `src/modules`：按业务域组织的 NestJS modules
- `src/common`：通用 pipe、filter、guard、decorator、interceptor
- `src/config`：配置加载和校验
- `src/db`：Drizzle schema、连接、migration、seed 和数据库入口
- `src/logger`：结构化日志适配
- `src/test`：测试工具、fixture 和 mock

业务模块内部推荐结构：

- `*.module.ts`：模块声明
- `*.controller.ts`：HTTP 接口层
- `*.service.ts`：业务逻辑层
- `*.repository.ts`：数据库访问层
- `dto/*.dto.ts`：请求 DTO
- `entities` 或 `types`：模块内类型

## 分层边界

- 使用 module、controller、service、repository 分层。
- controller 只处理 HTTP 入参、出参和状态码，不承载业务逻辑。
- service 负责业务规则、权限边界和事务编排。
- repository 负责 Drizzle 查询，不向 controller 暴露数据库细节。
- 全局启用请求校验 pipe。
- 异常通过 NestJS exception/filter 体系处理，不直接返回临时错误对象。
- 依赖注入优先使用 provider token，避免跨模块直接 new 实例。
- 事务边界应放在 service 层统一编排。
- repository 不应自行隐藏复杂业务事务。

## Fastify 集成

- NestJS 通过 `@nestjs/platform-fastify` 使用 Fastify adapter。
- 启动逻辑显式使用 `NestFastifyApplication`。
- E2E 测试使用 Fastify 的 `app.inject`。
- Fastify plugin 集中注册，避免分散在业务模块中。
- 不直接依赖 Express 专属 middleware 或 request/response API。

## 数据库与一致性

- 数据库 schema、连接、migration、seed 统一放在 `src/db`。
- 所有数据库访问通过 repository 或明确的数据访问层。
- 查询保持类型安全，避免拼接原始 SQL 字符串。
- 需要原始 SQL 时必须封装、参数化，并说明原因。
- migration 必须和 schema 变更一起提交。
- 涉及多表写入、余额变更、交易分类变更、预算扣减等操作必须使用事务。
- 幂等接口必须有明确的幂等 key 或唯一约束。
- 金额字段不得使用浮点数，优先使用整数最小货币单位或 decimal 字符串策略。

## API 设计

- API 同时服务移动端和 WEB 端，接口语义必须稳定。
- 路由使用清晰的资源命名，例如 `/transactions`、`/accounts`、`/categories`。
- 请求 DTO 和响应类型必须显式定义。
- 分页、排序、筛选参数必须统一命名和行为。
- 列表接口默认分页，禁止无上限返回大列表。
- 错误响应必须结构稳定，便于客户端统一处理。
- 不在响应中暴露密码、token、内部异常栈或数据库细节。

## 认证与权限

- 认证逻辑统一放在 guard 或 auth 模块。
- 业务接口不得绕过认证和用户作用域校验。
- 查询、更新、删除用户数据时必须限定当前用户范围。
- 管理员或后台专属权限必须显式建模，不使用隐式布尔判断散落在业务代码中。

## 配置与可观测性

- 配置集中放在 `src/config`。
- 新增环境变量必须同步更新根目录或服务端 `.env.example`。
- 启动时应校验必需环境变量。
- 客户端可见配置和服务端私密配置必须分离。
- 数据库连接字符串、JWT secret、第三方密钥不得提交到仓库。
- 日志应包含 request id 或可追踪上下文。
- 错误日志应记录错误类型、业务场景和必要上下文。
- 不得记录密码、token、银行卡号、完整身份证号等敏感信息。
- 慢查询、关键写操作和认证失败应有可追踪日志。

## 测试架构

- 新增 controller、service、repository 必须有对应测试。
- service 测试覆盖业务规则、权限边界和异常路径。
- repository 测试覆盖关键查询条件和数据映射。
- API E2E 测试覆盖成功、校验失败、未认证和无权限场景。
- Fastify E2E 测试使用 `app.inject`。
- 测试不得依赖真实外部服务。

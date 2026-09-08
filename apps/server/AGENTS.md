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
- migration 必须与 schema 变更在同一变更集中交付；Git 提交仍遵循根目录审批规则
- 业务接口不得绕过认证和用户作用域校验

## NestJS 技能规范

- 编写、评审或重构 NestJS module、controller、service、repository、guard、pipe、filter、interceptor 和后台任务时，必须使用 `$nestjs-best-practices` 进行约束检查
- 项目 `AGENTS.md`、本文件和同目录 `ARCHITECTURE.md` 的现有边界优先于通用技能；当前项目固定使用 NestJS 11、Fastify、Drizzle ORM 和 `nestjs-zod`
- 业务能力按 feature module 组织；module 只导出其他模块真实需要的 provider，禁止重复注册 provider 或通过全局模块隐藏依赖关系
- 禁止以 `forwardRef()` 作为默认方式掩盖循环依赖；发现循环关系时优先调整职责、提取稳定边界或通过明确的业务事件解耦
- controller 只承担协议适配；service 负责业务规则、权限和事务编排；repository 负责查询与数据映射，不得形成跨层调用或万能 service
- 禁止 service locator 模式；除框架适配、动态插件等明确基础设施场景外，不使用 `ModuleRef.get()` 在运行时查找业务依赖
- 自定义接口依赖使用集中定义的 Symbol 或字符串 token，并通过 `@Inject(TOKEN)` 注入；provider scope 必须显式评估，默认保持 singleton，不为方便访问请求对象切换为 request scope
- 输入校验继续使用项目既有的 Zod DTO 与全局校验 pipe；`$nestjs-best-practices` 中的 `class-validator` 示例不构成引入新校验体系的要求
- 认证使用 guard，授权必须在 guard 或明确的权限策略层完成；controller 内零散的角色布尔判断不得替代统一权限模型
- 领域错误应在稳定边界转换为 NestJS exception，并由统一 filter 生成结构化错误响应；不得吞掉异步错误、重复记录同一错误或把内部异常直接暴露给客户端
- 多表写入和权限敏感写操作由 service 统一控制事务；repository 不得私自开启与业务流程不一致的事务，也不得在事务外发送依赖提交结果的事件
- 列表查询必须分页并避免 N+1；只选择业务需要的字段。引入缓存时必须同时定义 key、作用域、失效条件和用户隔离，不能缓存敏感响应或用缓存掩盖慢查询
- 外部服务和消息系统通过明确接口及注入 token 隔离，测试中使用 mock 或 fake；只有确需跨事务异步处理、重试或削峰时才引入事件或队列
- 应用持有数据库连接、定时器、队列消费者或长连接时，必须实现对应生命周期清理，并通过 NestJS shutdown hooks 支持优雅关闭
- 新增限流、缓存、队列或健康检查依赖仍须按项目规则先确认；不得仅因为技能推荐而扩大基础设施范围
- 测试继续使用 Nest testing utilities；Fastify E2E 使用 `app.inject`，覆盖校验、认证、授权、异常映射和关键事务路径

## 依赖注入

- controller、service、repository、guard 等 Nest provider 必须优先使用构造器注入，不使用属性注入或静态属性保存依赖
- 注入普通 class provider 时，依赖 TypeScript 构造器类型元数据解析，不额外使用 `@Dependencies()` 或 `@Inject()`
- 作为构造器注入 token 的 class 必须使用运行时 import，不得改成 `import type`；Biome 已对 `apps/server/src/**/*.ts` 关闭 `useImportType`，普通业务类型仍应主动使用 `import type`
- 注入 Symbol、字符串或其他自定义 token 时，必须在对应构造器参数上使用 `@Inject(TOKEN)`；TypeScript interface 或 type 不得直接作为运行时注入 token
- 构造器注入字段默认声明为 `private readonly`；可选依赖也优先通过构造器组合 `@Optional()` 与 `@Inject(TOKEN)` 显式声明

## 安全与日志

- 继承根目录的日志与敏感信息规则；此外不得记录完整身份证号，也不得在响应中暴露内部异常栈或数据库细节

## 测试要求

- 新增或实质修改 controller、service、repository 时必须有对应测试；service 覆盖业务规则、权限边界和异常路径，repository 覆盖关键查询条件和数据映射
- API E2E 测试必须覆盖成功、校验失败、未认证和无权限场景

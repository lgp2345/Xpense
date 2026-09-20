# apps/server/AGENTS.md

## 范围与技能

- 本文件适用于后端服务，继承根目录 `AGENTS.md`；遵守同目录 `ARCHITECTURE.md` 的分层、数据库、API、认证、事务和配置边界。
- 编写、评审或重构 NestJS provider、module、controller 或后台任务时，使用 `$nestjs-best-practices`。通用实践由技能提供，技术栈和版本以架构文档及实际依赖为准。
- 技能不得引入新的校验体系、平台适配或基础设施；新增限流、缓存、队列、健康检查等依赖遵循根目录授权规则。

## 实现约束

- module 只导出实际需要的 provider，不重复注册或通过全局模块隐藏依赖；不得以 `forwardRef()` 掩盖循环依赖。
- 禁止通过 `ModuleRef.get()` 查找业务依赖；框架适配、动态插件等明确基础设施场景可例外。
- 输入使用手写 Zod schema；DTO 与运行时 schema 绑定遵循架构文档。校验失败统一返回 HTTP 400、`VALIDATION_FAILED` 和中文 `参数校验失败`，不得暴露内部校验细节。
- 新增或修改 DTO、复杂 schema 转换和校验基础设施时，用中文 JSDoc 说明业务输入或转换目的。
- 权限敏感写操作由 service 控制事务；不得在事务外发送依赖提交结果的事件。
- 避免 N+1，仅查询需要的字段；缓存须定义 key、作用域、失效条件和用户隔离，不缓存敏感响应或用缓存掩盖慢查询。
- 外部服务和消息系统通过接口及注入 token 隔离；仅在跨事务异步处理、重试或削峰确有需要时引入事件或队列。
- 应用持有的连接、定时器和消费者须通过生命周期清理及 shutdown hooks 支持优雅关闭。
- 不吞掉异步错误或重复记录同一错误；敏感信息、异常响应和日志遵守根规范及服务端架构文档。
- schema 与 migration 在同一变更集中交付；生成 migration 不代表获准执行 migration 或 Git 提交。

## 依赖注入

- provider 使用构造器注入，字段默认 `private readonly`；不使用属性注入或静态属性保存依赖。
- 普通 class provider 依赖构造器类型元数据，不额外使用 `@Dependencies()` 或 `@Inject()`；作为 token 的 class 必须运行时 import，普通业务类型使用 `import type`。
- 自定义 token 集中定义，使用 Symbol 或字符串并通过 `@Inject(TOKEN)` 注入；interface/type 不得作为运行时 token，可选依赖显式使用 `@Optional()`。
- provider 默认 singleton；变更 scope 须评估影响，不为获取请求对象切换为 request scope。

## 测试要求

- 新增或实质修改 controller、service、repository 时须有对应测试；service 覆盖业务、权限和异常路径，repository 覆盖关键查询条件与映射。
- 使用 Nest testing utilities；E2E 按架构文档使用 `app.inject`，覆盖成功、校验失败、未认证、无权限、异常映射及关键事务路径。

# NestJS 12 迁移验证记录

## 阶段 1：迁移前基线

- 日期：2026-09-12
- 分支：`feature/bookkeeping`
- Node.js：`v26.8.2`
- NestJS：核心包 `11.1.27`，CLI `11.0.24`
- 服务端基线：类型检查、Biome、1020 项通过且 2 项跳过、TypeScript 构建均成功。
- 根级基线：测试、lint、类型检查均成功；Web 测试存在既有 React `act(...)` 警告，不影响退出状态。
- 新增审计查询契约覆盖：分页与数值转换、日期范围转换、非法日期、页码下限、分页大小上限。
- 说明：现有 `nestjs-zod` 校验错误会返回具体英文错误文本；迁移阶段按照实施方案统一为中文 `参数校验失败`。

后续阶段将在此文件追加目标环境、命令结果、阶段提交 SHA 和剩余风险。

## 阶段 2：Node.js 26.8.2

- npm 发布元数据确认 Node.js `26.8.2` 存在，本地 `node --version` 输出 `v26.8.2`。
- 根 package 声明和 `.node-version` 使用精确版本 `26.8.2`。
- server 与 web Dockerfile 使用 `node:26.8.2-alpine`。
- Docker Hub 官方标签列表确认 `node:26.8.2-alpine` 存在；本机 Docker registry 元数据请求连续超时，镜像拉取及两份镜像构建未能完成，留待最终阶段重试。
- `pnpm install --frozen-lockfile` 成功，pnpm 保持 `10.30.2`；本机 Argon2 哈希与验证冒烟成功。
- 服务端 check、lint、1025 项通过且 2 项跳过、build 成功；根级 check、lint、test 成功。Web 测试仍输出既有 React `act(...)` 警告。

## 阶段 3：NestJS 12 与原生 Zod 校验

- `@nestjs/common`、`@nestjs/core`、`@nestjs/platform-fastify`、`@nestjs/testing` 升级到 `12.0.1`，`@nestjs/cli` 升级到 `12.0.0`。
- 删除 `nestjs-zod`，全局使用 NestJS 12 的 `StandardSchemaValidationPipe`；失败响应固定为 `{ code: "VALIDATION_FAILED", message: "参数校验失败" }`。
- 将 65 个 DTO class 改为 `z.output<typeof schema>`，并为每个业务输入类型保留 JSDoc。
- 将 64 个 `@Body()` / `@Query()` 入口改为显式 schema 绑定，保留 Zod 默认值、强制转换与 transform 输出。
- 完整测试暴露 3 个少一位的 UUID 测试夹具；修正为合法 UUID 后，原有续租业务层 404 契约恢复。
- 服务端 check、lint、1027 项通过且 2 项跳过、build 成功；`git diff --check` 成功。

## 阶段 4：HTTP 与启动兼容性

- 新增 5 项 Fastify HTTP 回归，覆盖非法 JSON、统一 404、带凭据 CORS 预检、Cookie、request id 和原型相关特殊字段。
- 原型相关字段由 Fastify 在控制器前拒绝为结构化 400，保留框架安全防护。
- 新增 3 项权限同步测试，通过 Nest TestingModule 初始化验证生命周期调用、重复同步输入一致以及失败日志参数格式；测试不连接真实数据库。
- 开发 watch 在隔离的不可连接数据库地址下成功完成编译、依赖注入、路由注册和监听；权限同步失败按既有行为记录警告，未阻止启动。
- 首次编译后启动发现 `@xpense/shared` 仍导出 TypeScript 源入口；增加失败测试后将运行时导出指向 `dist/index.js`，生产启动随后成功完成 ESM 加载、依赖注入、路由注册和监听。
- Argon2 哈希与验证冒烟成功。
- 服务端 check、lint、1036 项通过且 2 项跳过、build 成功；根级 check、lint、test 成功，Web 仍只有既有 React `act(...)` 与受控状态警告；`git diff --check` 成功。

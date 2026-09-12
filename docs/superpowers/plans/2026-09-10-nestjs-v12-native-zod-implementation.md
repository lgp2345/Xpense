# NestJS 12 与原生 Zod 校验迁移实施方案

> 执行要求：使用 `superpowers:executing-plans` 在当前任务中逐阶段实施。每阶段完成验证后，使用中文提交信息提交该阶段改动。默认串行执行。

**目标：** 将服务端迁移到 NestJS 12，统一 Node.js 为 26.8.2，使用原生 Standard Schema 校验替代 nestjs-zod，保持现有业务和 API 契约。

**架构：** 保留手写 Zod 业务 schema，DTO 改为 schema 输出类型，Controller 显式绑定运行时 schema，通过 APP_PIPE 注册原生校验器。继续使用现有响应拦截器、异常过滤器和 service/repository 分层。

**技术栈：** Node.js 26.8.2、NestJS 12、Fastify、Zod 4、Drizzle ORM、TypeScript、Vitest、pnpm 10.30.2。

**方案依据：** 本任务中已确认的迁移方向，以及用户追加的 Node.js 26.8.2、阶段中文 commit、JSDoc 备注要求。

## 一、执行约束

- [ ] 执行前读取根目录及服务端 AGENTS.md、ARCHITECTURE.md，并检查新增子目录规则。
- [ ] 保留已有未提交改动，记录本次文件范围；只暂存属于当前阶段的文件或补丁。
- [ ] 当前文档交付不启动代码迁移；后续执行本方案时，阶段提交已经获得用户授权，无需逐次重复询问。
- [ ] 不推送远端、不创建 PR、不合并；这些操作不属于本方案。
- [ ] 不使用 `git reset --hard`、`git checkout --`、`git restore` 回滚工作区。
- [ ] Node.js 精确使用 26.8.2，不使用 `26`、`latest` 或其他浮动版本替代。
- [ ] 核心 Nest 包目标为 12.0.1，CLI 目标为 12.0.0；安装前核实包版本及兼容声明。目标不可用时报告，不擅自改用其他主版本。
- [ ] 保持 Drizzle、Zod、TypeScript、Vitest、Biome、pnpm 的当前直接依赖版本；只接受本次升级必需的传递依赖变化。
- [ ] 不引入 drizzle-zod 或 drizzle-orm/zod，不从数据库表生成 API schema。
- [ ] 不修改数据库结构、migration、业务 API 路径、金额与时间规则、权限边界。
- [ ] 不启用新的响应 schema 序列化，不重写现有业务 service/repository。
- [ ] 修改和新增代码中的说明性备注使用中文 JSDoc；解释业务意图、输入输出和边界，不为每行代码添加复述性注释。
- [ ] 每阶段通过对应验证和 `git diff --check` 后再提交；提交记录只包含完成的工作。
- [ ] 测试不依赖真实外部服务；运行冒烟需要数据库时使用独立临时数据库，不连接用户现有数据。

## 二、关键技术决策

### 2.1 DTO 与 schema

保留现有 `*.dto.ts` 路径、schema 名称及业务规则。删除 `createZodDto` 包装，导出校验后数据类型：

```ts
/** 登录参数校验后的数据；验证码和设备信息由业务层处理。 */
export type LoginDto = z.output<typeof loginSchema>;
```

使用 `z.output` 表达经过默认值填充、coerce 和 transform 后的数据。类型导入使用 `import type`；用于构造器注入的 Service class 继续使用运行时导入。

### 2.2 Controller 参数

```ts
import { loginSchema, type LoginDto } from "./dto/login.dto.js";

// 下行为参数接入形式，实施时位于现有方法签名内。
@Body({ schema: loginSchema }) dto: LoginDto
```

上面的说明行只用于方案示意；实际源代码新增备注统一使用 JSDoc。查询参数使用 `@Query({ schema: listAuditLogsSchema })`。

原生 pipe 不会从 TypeScript 类型自动推导 schema。必须覆盖全部现有 DTO 参数，不给当前未校验的普通路径参数顺带增加限制。

### 2.3 全局校验与错误契约

新增 `apps/server/src/common/validation/create-validation-pipe.ts`，由 AppModule 和测试共用同一配置入口：

```ts
import { BadRequestException, StandardSchemaValidationPipe } from "@nestjs/common";

import { apiErrorCodes } from "../errors/api-error.js";

/**
 * 创建全局请求校验器，保留 schema 转换结果和既有错误契约。
 * 校验细节不进入客户端响应，统一由异常过滤器封装。
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: () =>
      new BadRequestException({
        code: apiErrorCodes.validationFailed,
        message: "参数校验失败",
      }),
  });
}
```

AppModule 使用 `{ provide: APP_PIPE, useFactory: createValidationPipe }`。不在 main.ts 或测试启动入口重复注册。错误响应继续为 HTTP 400 和 `{ code: "VALIDATION_FAILED", message: "参数校验失败", data: null }`。

### 2.4 JSDoc 范围

- DTO 类型：说明其为校验后的业务输入，复杂转换说明输入输出差异。
- 复杂 schema：说明菜单联合类型、未知字段策略、日期与分页转换等边界。
- 校验工厂：说明统一异常映射及 `transform: true` 的必要性。
- 新增测试 helper：说明 mock/fake 的边界和不连接真实数据库的约束。
- 不批量给未修改代码补注释；不重复描述显而易见的类型信息。
- JSON、Dockerfile 等不支持 JSDoc 的文件不插入 JSDoc；相关原因写入 Markdown 文档。

## 三、阶段 1：基线与契约测试

**交付：** 能在 Nest 11 上通过的迁移前行为测试，以及基线结果记录。

**文件范围：**

- `apps/server/src/modules/auth/auth.e2e.test.ts`
- `apps/server/src/modules/iam/iam.e2e.test.ts`
- 新增 `apps/server/src/modules/audit/audit.e2e.test.ts`
- `apps/server/src/test/create-test-app.ts`，仅按审计测试需要扩展 fake
- 新增 `docs/superpowers/plans/2026-09-10-nestjs-v12-validation-results.md`

- [ ] 记录 Git 状态、现有 Node 版本和锁文件中实际依赖版本。
- [ ] 运行当前服务端 check、lint、test、build，记录通过、失败及原因。
- [ ] 盘点现有测试；已有有效断言直接复用，不重复创建同义测试。
- [ ] 对审计查询补充：默认分页、字符串数字转换、合法日期转换、非法日期、页码下限、pageSize 上限。
- [ ] 对认证补充：登录非法字段、刷新空 body、Cookie 刷新及客户端差异。
- [ ] 对 IAM 补充：strict 拒绝额外字段、普通 object 剔除额外字段、菜单各联合分支及非法输入不改变状态。
- [ ] 测试使用有效认证上下文触发参数校验，避免因 Guard 提前拒绝而误判校验覆盖。
- [ ] 检查 schema 的 trim、default、optional、nullable、union 和 transform 行为均有代表性覆盖。
- [ ] 添加必要 JSDoc，记录基线结果。

**验证：** `pnpm --filter @xpense/server check`、`lint`、`test`、`build`，以及根级 `pnpm test`、`pnpm lint`、`pnpm check` 和 `git diff --check`。

**验收：** 新增契约测试在当前 Nest 11 上通过。若发现既有行为缺陷，记录并区分，不以修改断言掩盖问题，不在迁移中静默改变业务。

**中文提交：** `test: 补充 NestJS 升级前的接口契约测试`

## 四、阶段 2：统一 Node.js 26.8.2

**交付：** 本地版本声明、容器构建及开发文档统一使用精确版本。

**文件范围：**

- 根 `package.json`：`engines.node` 设置为 `26.8.2`
- 根 `.node-version`：内容为 `26.8.2`；若已有版本管理文件，统一处理，避免冲突声明
- `infra/compose/Dockerfile.server`
- `infra/compose/Dockerfile.web`
- `docs/local-development.md`
- 验证结果记录文档

- [ ] 核实 Node 26.8.2 发布文件及 `node:26.8.2-alpine` 镜像可用；不可用时停止依赖该产物的步骤并报告，不替换为浮动 tag。
- [ ] 使用明确选择的 Node 26.8.2 环境执行后续检查，不修改用户系统默认版本。
- [ ] 两份 Dockerfile 改为 `FROM node:26.8.2-alpine AS base`。
- [ ] Web 镜像安装整个 workspace，因此也同步运行环境。
- [ ] 保留 pnpm 10.30.2；执行 frozen-lockfile 安装确认现有依赖可用。
- [ ] 验证 argon2 等原生依赖在目标镜像与实际架构中安装、构建和调用成功。
- [ ] 文档增加 Node 版本选择、检查方式，以及开发环境切换步骤。

**验证：** `node --version` 必须输出 `v26.8.2`；运行服务端 check、lint、test、build，构建两份容器镜像；根级 test、lint、check 及 `git diff --check` 通过。

**验收：** Nest 11 基线在 Node 26.8.2 上仍通过，便于将运行时问题与框架迁移问题分开。

**中文提交：** `chore: 统一 Node.js 版本为 26.8.2`

## 五、阶段 3：原子切换 NestJS 12 与原生校验

**交付：** 完整可编译、可测试的 Nest 12 校验接入。依赖、DTO、Controller 和 pipe 同阶段完成，不提交漏校验的中间版本。

**依赖文件：** `apps/server/package.json`、`pnpm-lock.yaml`。

**DTO 与 Controller：** 实施前复查发现当前分支已扩展到 auth、audit、organizations、iam、bookkeeping、rental 六个业务域，共 65 个 DTO 类型和 64 个 Body/Query 参数绑定。因此迁移覆盖 `apps/server/src/modules/*/dto/*.dto.ts` 及所有使用这些 DTO 的 controller，不沿用最初盘点的 17 个文件和 16 个入口。

**其他文件：**

- `apps/server/src/app.module.ts`
- 新增 `apps/server/src/common/validation/create-validation-pipe.ts`
- 新增 `apps/server/src/common/validation/create-validation-pipe.test.ts`
- `apps/server/src/common/filters/all-exceptions.filter.test.ts`
- `apps/server/src/dev-runtime.test.ts`
- 验证结果记录文档

- [ ] 先增加原生 pipe 的失败测试，验证正确输入转换及错误契约；首次失败应来自原生接口尚不可用或尚未接入。
- [ ] 将 common、core、platform-fastify、testing 更新到 12.0.1，CLI 更新到 12.0.0，移除 nestjs-zod。
- [ ] 使用 pnpm 更新锁文件，检查没有无关直接依赖升级及未解决 peer 冲突。
- [ ] 按第二节模式转换全部 DTO，保留 schema 原文和 DTO 类型名称。
- [ ] 全部 64 处 DTO Body/Query 参数显式绑定 schema；实施时重新搜索确认数量没有随用户改动变化。
- [ ] 实现校验工厂并通过 APP_PIPE 注册。
- [ ] 新测试调用 `createValidationPipe().transform(value, { type: "body", schema })`，断言返回解析后的值；非法输入断言 HTTP 400 和既有 code/message。
- [ ] 异常过滤器测试从实际工厂产生的异常验证完整响应，不只手工构造固定错误对象。
- [ ] 删除测试中的 ZodValidationException 依赖，保留原有其他业务异常断言。
- [ ] 更新 dev-runtime 测试对 CLI 11 的限定，保留 watch 管道要求。
- [ ] 搜索 DTO 是否存在运行时使用，如 new、instanceof、静态 schema；发现时按用途迁移，不能直接改成 type 后遗漏调用点。
- [ ] 添加第二节规定的中文 JSDoc。

**验证：** 原生 pipe 单测、认证/IAM/审计 E2E、服务端 check、lint、test、build；根级 test、lint、check 和 `git diff --check`。

**验收：** 无 nestjs-zod/createZodDto/ZodValidationException 源码引用，全部契约测试通过，生产与 E2E 使用相同全局校验配置。

**中文提交：** `refactor: 升级 NestJS 12 并接入原生 Zod 校验`

## 六、阶段 4：HTTP 与启动兼容性验证

**交付：** 对框架行为变化的回归覆盖和必要的最小兼容修正。

**文件范围：**

- 新增 `apps/server/src/http-compatibility.e2e.test.ts`
- 新增 `apps/server/src/modules/iam/permission-sync.service.test.ts`
- 按实际失败修改 `apps/server/src/common/filters/all-exceptions.filter.ts`
- 按实际失败修改 HTTP 配置、测试启动 helper 或权限同步代码，不预设必须重构
- 验证结果记录文档

- [ ] 使用 Fastify inject 验证非法 JSON、404、CORS 预检、Cookie、request id 及统一错误格式。
- [ ] 对比阶段 1 基线，避免 HTTP 解析异常误变成 500。
- [ ] 补充原型相关特殊字段的测试，记录原生 pipe 清理行为；不关闭框架防护。
- [ ] 权限同步使用数据库 fake 验证初始化期间调用、幂等输入及失败时的既有行为，不连接真实数据库。
- [ ] 对涉及生命周期调用顺序的测试使用 Nest TestingModule 初始化，不能只直接调用 hook 就声称验证过框架顺序。
- [ ] 验证权限同步的“字符串 + 对象”日志在 v12 下的输出；若确有格式依赖，再做最小调整并补 JSDoc。
- [ ] 运行开发 watch 和编译后启动，验证 Service 构造器注入和 ESM 加载。
- [ ] 使用隔离环境执行 Argon2 哈希/验证冒烟；普通自动化测试仍使用既有 mock。
- [ ] 确有缺陷时先增加失败测试，再修改代码，不顺便治理循环依赖或数据库生命周期。

**验证：** 新增回归测试、服务端全部检查、根级 test/lint/check、开发与生产启动、`git diff --check`。

**验收：** 错误和成功响应符合基线；明确记录安全性清理等框架差异及影响，不将未执行的启动检查描述为通过。

**中文提交：** `test: 完善 NestJS 12 的 HTTP 与启动兼容性验证`

如该阶段存在实际修复，提交信息改为 `fix: 修复 NestJS 12 升级后的兼容性问题`，正文用中文列出修复和测试范围。

## 七、阶段 5：规范、全量验收与交付

**文件范围：**

- `apps/server/AGENTS.md`
- `apps/server/ARCHITECTURE.md`
- `docs/local-development.md`
- 本方案及验证结果记录文档

- [ ] 将固定 NestJS 11 与 nestjs-zod 的旧约定更新为 NestJS 12 和原生校验。
- [ ] 沉淀本次已确认的 DTO/schema、显式参数绑定、统一异常及中文 JSDoc 约定。
- [ ] 明确 Node.js 26.8.2 和阶段中文提交要求的适用范围；阶段提交要求只用于本次迁移，不擅自扩展为全项目永久规则。
- [ ] 在 Node 26.8.2 下执行全量 `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm build`。
- [ ] 使用更新后的锁文件验证 frozen-lockfile 安装，并再次构建最终两份镜像。
- [ ] 不执行根 `pnpm dev` 作为无副作用检查；它会触发数据库准备。
- [ ] 扫描本次新增日志和敏感内容，不增加 console.log/warn/error，不输出真实凭据。
- [ ] 审查 diff，确认没有数据库、无关依赖或前端业务改动。
- [ ] 在验证记录中填写实际命令、结果、环境、未执行项及原因、阶段 commit SHA。
- [ ] 最终交付说明修改文件、测试结果、剩余风险及值得后续独立处理的问题。

**验收：** 全量检查通过；环境、接口与数据契约满足本方案；无法运行的镜像或冒烟检查被明确列为剩余风险，不能宣称完整验收通过。

**中文提交：** `docs: 更新 NestJS 12 原生校验与运行环境规范`

## 八、阶段提交规程

1. 先完成该阶段实现和局部检查，再执行项目规定的提交前 `pnpm test`、`pnpm lint`、`pnpm check`。
2. 执行 `git diff --check`，审查 diff 和文件范围。
3. 只暂存当前阶段文件；若同一文件包含用户改动，按补丁区分，不使用无范围的 `git add .`。
   当前 `.gitignore` 忽略整个 `docs/`。需要提交本方案、验证记录或已修改的开发文档时，仅对这些明确文件使用 `git add -f <具体文件路径>`；不整体取消 docs 忽略规则，不批量纳入其他文档。
4. 使用本方案对应的中文 Conventional Commit 标题，正文用中文说明修改原因和验证结果。
5. 提交后确认提交内容和工作区状态，记录 SHA，不自动推送。
6. 验证失败时先修复本阶段引入的问题；既有失败单独报告，不弱化测试或绕过检查提交。

提交正文通过临时文件传递，避免转义问题。格式为：

```text
refactor: 升级 NestJS 12 并接入原生 Zod 校验

保留现有业务 schema，将 DTO 改为校验后的输出类型。
为 Controller 显式绑定 schema，并统一校验错误响应。

验证：填写本阶段实际执行并通过的检查。
```

## 九、风险与回退

| 风险 | 控制方式 |
| --- | --- |
| Node 26.8.2 原生依赖或镜像架构兼容 | 阶段 2 先验证安装、构建和 Argon2 调用 |
| DTO 类型存在但忘记绑定 schema | 逐项检查现有 64 处参数，并用非法输入 E2E 证明会拒绝 |
| coerce/default/transform 结果丢失 | 显式 transform: true，DTO 使用 z.output，测试进入业务层的数据 |
| 原生异常或 Fastify 解析错误改变响应 | 统一异常工厂，HTTP 层对照基线验证 |
| Nest 生命周期和 ESM 工具链差异 | TestingModule 初始化、开发 watch、生产启动分别验证 |
| 权限同步触碰真实数据 | fake 测试及独立临时数据库，禁止使用用户现有数据库冒烟 |
| 阶段拆分产生不可用提交 | Nest 依赖与全部校验接入在阶段 3 原子提交 |

未上线时，保留阶段提交用于定位，不在共享工作区自动回退。确需撤销已提交迁移时，明确范围后通过反向提交撤销本次相关 commit，不能覆盖用户后续修改。部署回退使用上一版已验证的应用镜像及对应锁文件；本方案没有数据库结构变化，无需数据库回滚。

## 十、文档依据

- [NestJS 12 迁移指南](https://docs.nestjs.com/migration-guide)
- [NestJS 12.0.1 原生校验实现](https://github.com/nestjs/nest/blob/v12.0.1/packages/common/pipes/standard-schema-validation.pipe.ts)
- [NestJS 原生 Zod 示例](https://github.com/nestjs/nest/tree/v12.0.1/sample/35-zod-validation)
- [Drizzle Zod 集成文档](https://orm.drizzle.team/docs/zod)

Node.js 26.8.2 为用户指定的目标；本方案的实际执行结果、阶段提交和未完成项记录在同目录 `2026-09-10-nestjs-v12-validation-results.md`。

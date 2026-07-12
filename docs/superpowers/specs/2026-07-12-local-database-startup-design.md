# 本地 PostgreSQL 与双模式启动设计

## 背景

Xpense 当前已有 `server`、`web` 的 Docker Compose 配置，但没有 PostgreSQL 服务、数据库初始化编排或可提交的本地环境变量模板。`apps/server` 启动时要求有效的 `DATABASE_URL` 和 `JWT_ACCESS_SECRET`，Drizzle migration 与 RBAC seed 目前需要开发者分别执行。

本设计只处理本地开发环境。测试、staging 和 production 的实际部署与配置暂不确定，也不在本次实现范围内。

## 目标

- PostgreSQL 始终由 Docker Compose 启动。
- 同时支持宿主机应用模式和全 Compose 模式。
- PostgreSQL 健康后自动执行 migration 和幂等 RBAC seed。
- migration 或 seed 失败时禁止启动 server。
- 两种模式共享同一套本地配置和同一份 PostgreSQL 数据。
- 本地配置集中在被 Git 忽略的根 `.env`，仓库只提交 `.env.example`。
- 不让应用代码依赖本地 `.env` 文件路径，为未来环境变量注入保留边界。

## 非目标

- 不实现 CI 临时数据库。
- 不部署长期 staging 环境。
- 不设计或提交 `.env.dev`、`.env.test`、`.env.prod`。
- 不实现 production 数据库、密钥管理或云平台部署。
- 不自动删除宿主机 PostgreSQL 数据目录。

## 启动架构

Compose 作为数据库准备流程的唯一编排入口，服务依赖链为：

```text
postgres (healthy)
  -> db-prepare (migration + RBAC seed, completed successfully)
    -> server (ready)
      -> web
```

各单元职责：

- `postgres`：运行官方 `postgres:18` 镜像，提供本地 PostgreSQL，并通过 `pg_isready` 暴露健康状态。
- `db-prepare`：复用 server 镜像和代码，调用 `apps/server` 的 `db:prepare` 脚本，依次执行 Drizzle migration 和 RBAC seed，成功后退出。
- `server`：只在 `db-prepare` 成功后启动，通过 `/ready` 暴露数据库就绪状态。
- `web`：只在 server 就绪后启动。

`db:prepare` 是数据库初始化的唯一组合入口，内部顺序固定为：

```text
db:migrate -> db:seed:rbac
```

RBAC seed 必须保持幂等，允许每次本地启动重复执行。

## 本地启动模式

### 混合模式

根命令 `pnpm dev`：

1. 使用根 `.env` 调用 Compose 的一次性 `db-prepare` 服务。
2. Compose 自动创建或启动 `postgres`，并等待其健康。
3. migration 和 RBAC seed 成功后，`db-prepare` 退出。
4. 使用 `dotenv-cli` 将根 `.env` 注入宿主机进程。
5. 执行 `turbo dev`，在宿主机启动 `apps/server` 和 `apps/web`。

按 `Ctrl+C` 只结束宿主机 server 和 web，PostgreSQL 容器继续运行。

### 全 Compose 模式

根命令 `pnpm dev:compose` 使用 `compose.yaml` 与 `compose.dev.yaml` 启动完整依赖链。server 和 web 在容器中运行并保留当前源码挂载与热更新能力。

### 停止模式

根命令 `pnpm dev:down` 停止并删除本地容器和网络，不删除 PostgreSQL 数据目录。

不提供 `pnpm dev:reset`。如果需要重建数据库，开发者必须先执行 `pnpm dev:down`，再手动清理 `.env` 中 `POSTGRES_DATA_DIR` 指向的目录。项目脚本不得执行目录删除。

两种模式使用相同 Compose 项目名 `xpense`。切换模式前应执行 `pnpm dev:down`，避免宿主机与容器同时占用 `4000` 和 `5173` 端口。

## 本地配置

根 `.env` 是唯一的本地真实配置源，并已被 `.gitignore` 忽略。根 `.env.example` 提供安全模板，不包含真实密码或密钥。

核心变量：

```dotenv
POSTGRES_USER=xpense
POSTGRES_PASSWORD=local_xpense_password
POSTGRES_DB=xpense
POSTGRES_PORT=5432
POSTGRES_DATA_DIR=/absolute/path/to/postgres/18/data

# 宿主机 server 使用
DATABASE_URL=postgresql://xpense:local_xpense_password@localhost:5432/xpense

# Compose 内 server、migration、seed 使用
COMPOSE_DATABASE_URL=postgresql://xpense:local_xpense_password@postgres:5432/xpense

JWT_ACCESS_SECRET=replace-with-a-local-secret-at-least-32-characters
PORT=4000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:4000
```

开发者本机 `.env` 中使用：

```dotenv
POSTGRES_DATA_DIR=/Users/liuguoping/postgres/18/data
```

PostgreSQL 18 容器将该宿主机目录绑定到 `/var/lib/postgresql`。官方镜像默认 `PGDATA` 为 `/var/lib/postgresql/18/docker`，因此实际数据库集群文件位于宿主机的 `/Users/liuguoping/postgres/18/data/18/docker`。

配置消费边界：

- `postgres` 读取 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 和 `POSTGRES_PORT`。
- 宿主机 server 读取 `DATABASE_URL`，通过 `localhost` 访问 PostgreSQL。
- Compose 内的 `server` 和 `db-prepare` 将 `COMPOSE_DATABASE_URL` 映射为进程内的 `DATABASE_URL`，通过服务名 `postgres` 访问数据库。
- 宿主机 web 读取 `VITE_API_BASE_URL`。
- Compose 命令显式传入根 `.env`，不依赖调用目录的隐式 env 查找。
- `apps/server/src/config/env.schema.ts` 继续作为 server 配置的最终校验入口。
- 可选 bootstrap 管理员变量只在 `.env.example` 中以注释示例呈现，不能赋空字符串。

未来 staging 和 production 只需要注入标准 `DATABASE_URL` 及其他运行环境变量，不依赖 `COMPOSE_DATABASE_URL` 或本地 env 文件。

## 健康与就绪检查

现有 `/health` 保持进程存活语义，不访问数据库。

新增 `/ready`：

- 由 `src/db` 内独立的 database readiness service 执行轻量 `SELECT 1`。
- 数据库可用时返回稳定的成功响应。
- 数据库不可用时返回 HTTP `503`。
- 错误响应和日志不得暴露连接串、密码或底层数据库错误细节。
- controller 不直接调用 Drizzle，由 service 层封装数据库检查。

共享 API 路由与响应类型同步增加 readiness 定义。Compose 的 server 健康检查改为调用 `/ready`，使 web 只有在 server 与数据库都可用时才启动。

## 失败行为

- `.env` 不存在时，本地启动立即失败并提示先从 `.env.example` 创建配置。
- Compose 使用必需变量校验，缺少数据库参数或 `POSTGRES_DATA_DIR` 时拒绝启动。
- PostgreSQL 在健康检查超时后标记为 unhealthy，`db-prepare` 不运行。
- migration 或 seed 返回非零状态时，`db-prepare` 失败，server 和 web 不启动。
- 混合模式中，`db-prepare` 失败后不执行 `turbo dev`。
- `/ready` 数据库检查失败时返回 `503`，不改变 `/health` 的进程存活结果。
- 端口冲突直接由 Docker 或应用启动命令报告，不自动停止其他进程。
- `pnpm dev:down` 不清理 bind mount 数据。

## 安全边界

- `.env`、`.env.local` 和 `.env.*.local` 保持忽略。
- `.env.example` 只包含本地示例值和占位符。
- Compose 文件、源码和设计文档不得包含真实数据库密码、JWT secret 或 bootstrap 管理员密码。
- PostgreSQL 只映射本地开发端口，不把本地配置当作生产配置复用。
- readiness 错误不得回传数据库主机、账号或 SQL 错误。

## 验证与验收

自动验证：

- database readiness service 单元测试覆盖数据库成功和异常。
- `/ready` API 测试覆盖成功与 `503`，`/health` 原有行为保持不变。
- `docker compose config` 验证 env 插值、bind mount 和依赖条件。
- `pnpm check`、`pnpm test`、`pnpm lint` 和 `git diff --check` 通过。

本地集成验收：

1. 手动清理 PostgreSQL 数据目录后执行 `pnpm dev`，确认 PostgreSQL、migration、seed、宿主机 server 和 web 按顺序启动。
2. 再次执行相同流程，确认 migration 和 RBAC seed 幂等。
3. 执行 `pnpm dev:down` 后重新启动，确认数据仍存在。
4. 执行 `pnpm dev:compose`，确认完整 Compose 链路和源码热更新可用。
5. 暂停或停止 PostgreSQL，确认 `/health` 仍表达进程存活，`/ready` 返回 `503`。
6. 使用缺失变量的 env 配置，确认启动在应用监听端口前失败。

普通单元测试继续使用 mock，不依赖 Docker PostgreSQL；Docker 数据库只用于显式的本地集成验收。

## 文档交付

实现时同步补充本地启动说明，包括：

- 从 `.env.example` 创建 `.env`。
- 创建或授权 `POSTGRES_DATA_DIR`。
- 两种启动命令及切换方式。
- `pnpm dev:down` 的数据保留语义。
- 手动清理数据库目录前必须先停止 Compose 服务。

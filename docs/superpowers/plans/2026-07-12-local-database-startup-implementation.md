# Local PostgreSQL Dual-Mode Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为本地开发提供“Compose PostgreSQL + 宿主机应用”和“全 Compose”两种启动模式，并在 server 启动前自动完成 migration、RBAC seed 与数据库就绪检查。

**Architecture:** Docker Compose 是 PostgreSQL、migration 和 seed 的唯一编排入口。混合模式通过一次性 `db-prepare` Compose 服务准备数据库后，在宿主机用 `dotenv-cli` 注入根 `.env` 并运行 Turbo；全 Compose 模式按 `postgres -> db-prepare -> server -> web` 的依赖链启动。

**Tech Stack:** Docker Compose v2、PostgreSQL 18、NestJS 11、Fastify、Drizzle ORM 1.0 RC、postgres.js、Zod、Vitest、pnpm 10、Turborepo、dotenv-cli 11.0.0。

## Global Constraints

- 本计划只实现本地环境，不增加 CI、staging 或 production 配置。
- PostgreSQL 固定使用官方 `postgres:18` 镜像。
- 宿主机数据源固定由本地 `.env` 的 `POSTGRES_DATA_DIR=/Users/liuguoping/postgres/18/data` 指定，并绑定到容器 `/var/lib/postgresql`。
- 不新增 `dev:reset`，不编写任何删除宿主机数据库目录的代码或命令。
- 根 `.env` 是唯一的本地真实配置源且不得提交；只提交 `.env.example`。
- 不创建 `.env.dev`、`.env.test` 或 `.env.prod`。
- 初始化顺序固定为 `PostgreSQL healthy -> migration -> RBAC seed -> server ready -> web`。
- migration 或 seed 失败时 server 不得启动。
- `/health` 保持进程存活语义；`/ready` 执行数据库检查，失败返回 HTTP 503。
- 普通单元测试使用 mock，不依赖真实 PostgreSQL。
- 禁止新增 `console.log`、`console.warn` 或 `console.error`。
- 不修改数据库 schema、migration SQL、API 既有响应或权限边界。
- 每个任务只提交其列出的文件，不暂存或修改其他 agent/用户改动。

---

### Task 1: Add the shared readiness contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/foundation.test.ts`

**Interfaces:**
- Produces: `API_ROUTES.ready` with value `"/ready"`.
- Produces: `ReadinessResponseSchema` and `ReadinessResponse` with exact success shape `{ ok: true; service: "server"; database: "ready" }`.
- Consumes: existing shared `zod` dependency and foundation contract conventions.

- [ ] **Step 1: Write the failing shared-contract test**

Update `packages/shared/src/foundation.test.ts` to import and validate the new route and response schema:

```ts
import { describe, expect, it } from "vitest";

import {
  API_ROUTES,
  APP_NAME,
  HelloResponseSchema,
  ReadinessResponseSchema,
  makeHelloMessage,
} from "./index";

describe("foundation shared contract", () => {
  it("keeps app identity and API routes in one shared package", () => {
    expect(APP_NAME).toBe("Xpense");
    expect(API_ROUTES.health).toBe("/health");
    expect(API_ROUTES.ready).toBe("/ready");
    expect(API_ROUTES.hello).toBe("/foundation/hello");
  });

  it("defines the database readiness response", () => {
    const response = ReadinessResponseSchema.parse({
      ok: true,
      service: "server",
      database: "ready",
    });

    expect(response).toEqual({
      ok: true,
      service: "server",
      database: "ready",
    });
  });

  it("builds the hello response message from the shared app name", () => {
    const response = HelloResponseSchema.parse({
      appName: APP_NAME,
      message: makeHelloMessage(),
    });

    expect(response).toEqual({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm --filter @xpense/shared exec vitest run src/foundation.test.ts
```

Expected: FAIL because `API_ROUTES.ready` and `ReadinessResponseSchema` do not exist.

- [ ] **Step 3: Implement the shared contract**

Add the readiness route beside the existing health route in `packages/shared/src/index.ts`:

```ts
export const API_ROUTES = {
  health: "/health",
  ready: "/ready",
  hello: "/foundation/hello",
} as const;
```

Add the readiness schema and type immediately after `HealthResponse`:

```ts
export const ReadinessResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("server"),
  database: z.literal("ready"),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
```

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
pnpm --filter @xpense/shared exec vitest run src/foundation.test.ts
pnpm --filter @xpense/shared check
pnpm --filter @xpense/shared build
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the shared contract**

```bash
git add packages/shared/src/index.ts packages/shared/src/foundation.test.ts
git commit -m "feat: 添加数据库就绪共享契约"
```

---

### Task 2: Implement database readiness in the server

**Files:**
- Create: `apps/server/src/db/database-readiness.service.ts`
- Create: `apps/server/src/db/database-readiness.service.test.ts`
- Modify: `apps/server/src/db/db.module.ts`
- Modify: `apps/server/src/foundation/foundation.service.ts`
- Modify: `apps/server/src/foundation/foundation.controller.ts`
- Modify: `apps/server/src/foundation/foundation.controller.test.ts`

**Interfaces:**
- Consumes: `ReadinessResponse` and `API_ROUTES.ready` from Task 1.
- Produces: injectable `DatabaseReadinessService` with `check(): Promise<void>`.
- Produces: `GET /ready`, returning `{ ok: true, service: "server", database: "ready" }` or HTTP 503.
- Preserves: existing `GET /health` response and behavior.

- [ ] **Step 1: Write the failing database-readiness unit test**

Create `apps/server/src/db/database-readiness.service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { AppDb } from "./db.module.js";
import { DatabaseReadinessService } from "./database-readiness.service.js";

describe("DatabaseReadinessService", () => {
  it("executes a lightweight database query", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const service = new DatabaseReadinessService({ execute } as unknown as AppDb);

    await expect(service.check()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("propagates database failures to the readiness boundary", async () => {
    const error = new Error("database unavailable");
    const execute = vi.fn().mockRejectedValue(error);
    const service = new DatabaseReadinessService({ execute } as unknown as AppDb);

    await expect(service.check()).rejects.toBe(error);
  });
});
```

- [ ] **Step 2: Extend the API test with success and failure cases**

In `apps/server/src/foundation/foundation.controller.test.ts`:

1. Add `vi` to the Vitest import.
2. Import `DB` from `../db/db.tokens.js`.
3. Add a module-level mock:

```ts
const execute = vi.fn();
```

4. In `beforeEach`, reset it before building the module:

```ts
execute.mockReset().mockResolvedValue([]);
```

5. Override the DB provider before `.compile()`:

```ts
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(DB)
  .useValue({ execute })
  .compile();
```

6. Add the readiness tests after the existing health test:

```ts
it("returns database readiness when the query succeeds", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/ready",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    ok: true,
    service: "server",
    database: "ready",
  });
  expect(execute).toHaveBeenCalledOnce();
});

it("returns 503 without leaking database details", async () => {
  execute.mockRejectedValueOnce(new Error("connection refused for postgresql://secret"));

  const response = await app.inject({
    method: "GET",
    url: "/ready",
  });

  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({
    message: "Service is not ready",
    error: "Service Unavailable",
    statusCode: 503,
  });
  expect(response.body).not.toContain("connection refused");
  expect(response.body).not.toContain("postgresql://secret");
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
pnpm --filter @xpense/server exec vitest run src/db/database-readiness.service.test.ts src/foundation/foundation.controller.test.ts
```

Expected: FAIL because `DatabaseReadinessService` and `GET /ready` are not implemented.

- [ ] **Step 4: Implement the database readiness service**

Create `apps/server/src/db/database-readiness.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { AppDb } from "./db.module.js";
import { DB } from "./db.tokens.js";

@Injectable()
export class DatabaseReadinessService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async check(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
```

- [ ] **Step 5: Register and export the readiness service**

Update `apps/server/src/db/db.module.ts`:

```ts
import { DatabaseReadinessService } from "./database-readiness.service.js";
```

Add `DatabaseReadinessService` to `providers` after the DB factory provider, and export it:

```ts
providers: [
  {
    provide: DB,
    inject: [ServerConfigService],
    useFactory: (config: ServerConfigService) => {
      const client = postgres(config.env.DATABASE_URL);

      return drizzle({ client });
    },
  },
  DatabaseReadinessService,
],
exports: [DB, DatabaseReadinessService],
```

- [ ] **Step 6: Implement the readiness response boundary**

Update `apps/server/src/foundation/foundation.service.ts` imports:

```ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  APP_NAME,
  type HealthResponse,
  type HelloResponse,
  type ReadinessResponse,
  makeHelloMessage,
} from "@xpense/shared";

import { DatabaseReadinessService } from "../db/database-readiness.service.js";
```

Add constructor injection and the method below, preserving `getHealth()` and `getHello()`:

```ts
constructor(private readonly databaseReadinessService: DatabaseReadinessService) {}

async getReadiness(): Promise<ReadinessResponse> {
  try {
    await this.databaseReadinessService.check();
  } catch {
    throw new ServiceUnavailableException("Service is not ready");
  }

  return {
    ok: true,
    service: "server",
    database: "ready",
  };
}
```

Update `apps/server/src/foundation/foundation.controller.ts` to import `ReadinessResponse` and add:

```ts
@Get(API_ROUTES.ready)
getReadiness(): Promise<ReadinessResponse> {
  return this.foundationService.getReadiness();
}
```

- [ ] **Step 7: Run focused tests and server checks**

Run:

```bash
pnpm --filter @xpense/server exec vitest run src/db/database-readiness.service.test.ts src/foundation/foundation.controller.test.ts
pnpm --filter @xpense/server check
pnpm --filter @xpense/server lint
```

Expected: all commands PASS. The focused test run should report 6 tests total: 2 readiness service tests and 4 foundation API tests.

- [ ] **Step 8: Commit server readiness**

```bash
git add apps/server/src/db/database-readiness.service.ts apps/server/src/db/database-readiness.service.test.ts apps/server/src/db/db.module.ts apps/server/src/foundation/foundation.service.ts apps/server/src/foundation/foundation.controller.ts apps/server/src/foundation/foundation.controller.test.ts
git commit -m "feat: 添加数据库就绪检查"
```

---

### Task 3: Add the local env contract and database preparation command

**Files:**
- Create: `.env.example`
- Create locally but never commit: `.env`
- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: root `.env.example` and ignored root `.env` with the same variable names.
- Produces: `@xpense/server` script `db:prepare`, executing migration before RBAC seed.
- Produces: root dev dependency `dotenv-cli@11.0.0`; Task 4 will consume its `dotenv -e .env -- <command>` CLI.

- [ ] **Step 1: Install the exact local env CLI dependency**

Run:

```bash
pnpm add --save-dev --workspace-root dotenv-cli@11.0.0
```

Expected: root `package.json` gains `dotenv-cli: "11.0.0"` and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the server database preparation script**

In `apps/server/package.json`, add this script immediately after `db:migrate`:

```json
"db:prepare": "pnpm db:migrate && pnpm db:seed:rbac",
```

The existing `db:migrate` and `db:seed:rbac` scripts remain unchanged.

- [ ] **Step 3: Create the tracked local env template**

Create `.env.example`:

```dotenv
POSTGRES_USER=xpense
POSTGRES_PASSWORD=local_xpense_password
POSTGRES_DB=xpense
POSTGRES_PORT=5432
POSTGRES_DATA_DIR=/Users/your-name/postgres/18/data

# Used by apps/server when it runs on the host.
DATABASE_URL=postgresql://xpense:local_xpense_password@localhost:5432/xpense

# Mapped to DATABASE_URL for server-side processes inside Compose.
COMPOSE_DATABASE_URL=postgresql://xpense:local_xpense_password@postgres:5432/xpense

JWT_ACCESS_SECRET=local-development-jwt-secret-change-before-nonlocal-use
PORT=4000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:4000

# Optional bootstrap values: either define all three or leave all three unset.
# BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@example.com
# BOOTSTRAP_SUPER_ADMIN_PASSWORD=local-bootstrap-password
# BOOTSTRAP_ORGANIZATION_NAME=Xpense Local
```

- [ ] **Step 4: Create the ignored local env file for this workstation**

Create root `.env` with exact local values:

```dotenv
POSTGRES_USER=xpense
POSTGRES_PASSWORD=local_xpense_password
POSTGRES_DB=xpense
POSTGRES_PORT=5432
POSTGRES_DATA_DIR=/Users/liuguoping/postgres/18/data
DATABASE_URL=postgresql://xpense:local_xpense_password@localhost:5432/xpense
COMPOSE_DATABASE_URL=postgresql://xpense:local_xpense_password@postgres:5432/xpense
JWT_ACCESS_SECRET=local-development-jwt-secret-change-before-nonlocal-use
PORT=4000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:4000
```

Do not add `.env` to Git.

- [ ] **Step 5: Verify env loading and ignore behavior**

Run:

```bash
git check-ignore -q .env
pnpm exec dotenv -e .env -- node -e 'if (process.env.POSTGRES_DATA_DIR !== "/Users/liuguoping/postgres/18/data") process.exit(1)'
pnpm --filter @xpense/server check
git status --short
```

Expected:

- `git check-ignore` exits 0.
- The dotenv command exits 0 with no output.
- Server check passes.
- `.env` is absent from `git status`; only tracked Task 3 files appear.

- [ ] **Step 6: Commit the env contract and preparation command**

```bash
git add .env.example package.json apps/server/package.json pnpm-lock.yaml
git commit -m "chore: 添加本地数据库环境契约"
```

---

### Task 4: Add Compose orchestration and root startup commands

**Files:**
- Modify: `infra/compose/compose.yaml`
- Modify: `infra/compose/compose.dev.yaml`
- Modify: `package.json`

**Interfaces:**
- Consumes: `db:prepare` and root `.env` from Task 3.
- Produces: Compose services `postgres` and `db-prepare`.
- Produces: `pnpm dev`, `pnpm dev:compose`, and `pnpm dev:down` with the approved semantics.
- Preserves: existing server/web dev volumes, ports, and hot-reload commands.

- [ ] **Step 1: Replace the base Compose service graph**

Replace `infra/compose/compose.yaml` with:

```yaml
name: xpense

x-server-runtime: &server-runtime
  image: xpense-server:local
  build:
    context: ../..
    dockerfile: infra/compose/Dockerfile.server
  env_file:
    - ../../.env
  environment:
    DATABASE_URL: ${COMPOSE_DATABASE_URL:?COMPOSE_DATABASE_URL is required}
    PORT: "${PORT:-4000}"
    WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost:5173}

services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER is required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      POSTGRES_DB: ${POSTGRES_DB:?POSTGRES_DB is required}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - type: bind
        source: ${POSTGRES_DATA_DIR:?POSTGRES_DATA_DIR is required}
        target: /var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\""]
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 5s

  db-prepare:
    <<: *server-runtime
    command: pnpm --filter @xpense/server db:prepare
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  server:
    <<: *server-runtime
    ports:
      - "${PORT:-4000}:${PORT:-4000}"
    depends_on:
      db-prepare:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- \"http://127.0.0.1:$${PORT}/ready\""]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 5s

  web:
    build:
      context: ../..
      dockerfile: infra/compose/Dockerfile.web
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:4000}
    environment:
      VITE_API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:4000}
    ports:
      - "5173:5173"
    depends_on:
      server:
        condition: service_healthy
```

- [ ] **Step 2: Preserve development commands and source mounts**

Replace `infra/compose/compose.dev.yaml` with:

```yaml
services:
  db-prepare:
    environment:
      NODE_ENV: development
    volumes:
      - ../../apps/server/src:/app/apps/server/src
      - ../../packages/shared/src:/app/packages/shared/src

  server:
    command: pnpm --filter @xpense/server dev
    environment:
      NODE_ENV: development
    volumes:
      - ../../apps/server/src:/app/apps/server/src
      - ../../packages/shared/src:/app/packages/shared/src

  web:
    command: pnpm --filter @xpense/web dev
    environment:
      NODE_ENV: development
      VITE_API_BASE_URL: ${VITE_API_BASE_URL:-http://localhost:4000}
    volumes:
      - ../../apps/web/src:/app/apps/web/src
      - ../../apps/web/index.html:/app/apps/web/index.html
      - ../../apps/web/vite.config.ts:/app/apps/web/vite.config.ts
      - ../../packages/shared/src:/app/packages/shared/src
```

- [ ] **Step 3: Replace root startup scripts with dual-mode commands**

In root `package.json`, replace the existing `dev` script and add the two companion scripts:

```json
"dev": "docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml run --rm --build db-prepare && dotenv -e .env -- turbo dev",
"dev:compose": "docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml up --build",
"dev:down": "docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml down --remove-orphans",
```

Do not add a `dev:reset` script.

- [ ] **Step 4: Create the host bind-mount directory**

Run outside the repository sandbox with user approval:

```bash
mkdir -p /Users/liuguoping/postgres/18/data
```

Expected: directory exists and no repository file changes.

- [ ] **Step 5: Validate the merged Compose model**

Run:

```bash
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml config --quiet
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml config --services
```

Expected:

- First command exits 0.
- Services are exactly `postgres`, `db-prepare`, `server`, and `web`.
- Rendered `postgres` bind source is `/Users/liuguoping/postgres/18/data` and target is `/var/lib/postgresql`.
- Rendered server and db-prepare `DATABASE_URL` host is `postgres`, not `localhost`.

- [ ] **Step 6: Verify missing env fails before startup**

Run:

```bash
docker compose --env-file /dev/null -f infra/compose/compose.yaml config --quiet
```

Expected: FAIL with a required-variable message such as `COMPOSE_DATABASE_URL is required` or `POSTGRES_USER is required`. No containers are created.

- [ ] **Step 7: Run static repository checks**

Run:

```bash
pnpm check
pnpm lint
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 8: Commit Compose orchestration**

```bash
git add infra/compose/compose.yaml infra/compose/compose.dev.yaml package.json
git commit -m "feat: 添加本地数据库启动编排"
```

---

### Task 5: Document and verify both local startup modes

**Files:**
- Create: `docs/local-development.md`

**Interfaces:**
- Consumes: all commands and env variables from Tasks 3 and 4.
- Produces: developer-facing setup, start, stop, switch-mode, persistence, and manual-reset instructions.
- Verifies: full Compose mode, repeated preparation idempotency, bind-mount persistence, hybrid mode, and readiness behavior.

- [ ] **Step 1: Write the local development guide**

Create `docs/local-development.md`:

```markdown
# 本地开发环境

## 前置条件

- Node.js 与 pnpm 版本满足根 `package.json` 要求。
- Docker Desktop 已启动，并支持 Docker Compose v2。
- 本地端口 `5432`、`4000`、`5173` 未被占用。

## 初始化配置

1. 将根 `.env.example` 复制为根 `.env`。
2. 将 `POSTGRES_DATA_DIR` 设置为本机绝对路径。当前工作站使用 `/Users/liuguoping/postgres/18/data`。
3. 创建该目录并确认 Docker Desktop 可以访问 `/Users/liuguoping`。
4. 本地 `.env` 不得提交到 Git。

PostgreSQL 18 将宿主机 `POSTGRES_DATA_DIR` 绑定到容器 `/var/lib/postgresql`，实际集群文件位于宿主机的 `POSTGRES_DATA_DIR/18/docker`。

## 混合模式（默认）

```bash
pnpm dev
```

该命令通过 Compose 启动 PostgreSQL，等待健康后执行 migration 与 RBAC seed，然后在宿主机启动 server 和 web。按 `Ctrl+C` 只停止宿主机应用，PostgreSQL 继续运行。

## 全 Compose 模式

```bash
pnpm dev:compose
```

该命令按 PostgreSQL、数据库准备、server、web 的顺序启动全部容器。按 `Ctrl+C` 停止前台 Compose 服务，但数据库文件仍保留在宿主机目录。

## 停止与切换模式

```bash
pnpm dev:down
```

切换混合模式和全 Compose 模式前先执行该命令，避免 `4000` 和 `5173` 端口冲突。该命令不会删除 `POSTGRES_DATA_DIR`。

## 手动重建数据库

项目不提供自动 reset 命令。需要重建数据库时：

1. 执行 `pnpm dev:down`。
2. 确认 PostgreSQL 容器已经停止。
3. 手动清理 `.env` 中 `POSTGRES_DATA_DIR` 指向的目录。
4. 再次运行任一启动命令，migration 和 RBAC seed 会自动重建数据库。

不要在 PostgreSQL 容器运行期间删除数据目录。

## 健康检查

- `GET http://localhost:4000/health`：只表示 server 进程存活。
- `GET http://localhost:4000/ready`：检查 server 是否可以访问 PostgreSQL；数据库不可用时返回 HTTP 503。
```

- [ ] **Step 2: Start the complete Compose stack in detached verification mode**

Run:

```bash
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml up --build --detach --wait
```

Expected: command exits 0; `postgres` and `server` are healthy, `db-prepare` exited 0, and `web` is running.

- [ ] **Step 3: Verify HTTP health and readiness**

Run:

```bash
curl --fail --silent http://localhost:4000/health
curl --fail --silent http://localhost:4000/ready
curl --fail --silent http://localhost:5173
```

Expected:

- `/health` returns `{"ok":true,"service":"server"}`.
- `/ready` returns `{"ok":true,"service":"server","database":"ready"}`.
- Web request exits 0 and returns HTML.

- [ ] **Step 4: Verify migration and RBAC seed results**

Run:

```bash
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml exec -T postgres psql -U xpense -d xpense -tAc "select count(*) from permissions;"
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml exec -T postgres psql -U xpense -d xpense -tAc "select count(*) from roles where organization_id is null;"
```

Expected: first command prints `18`; second command prints `4`.

- [ ] **Step 5: Verify database preparation is idempotent**

Run:

```bash
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml run --rm db-prepare
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml exec -T postgres psql -U xpense -d xpense -tAc "select count(*) from permissions;"
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml exec -T postgres psql -U xpense -d xpense -tAc "select count(*) from roles where organization_id is null;"
```

Expected: db-prepare exits 0; counts remain `18` and `4`.

- [ ] **Step 6: Verify bind-mount persistence after shutdown**

Run:

```bash
pnpm dev:down
test -f /Users/liuguoping/postgres/18/data/18/docker/PG_VERSION
```

Expected: both commands exit 0. The database cluster remains on the host.

- [ ] **Step 7: Verify the default hybrid startup mode**

Start `pnpm dev` in a PTY and wait for Turbo to report server and web dev processes running. In another terminal, run:

```bash
curl --fail --silent http://localhost:4000/ready
curl --fail --silent http://localhost:5173
```

Expected: readiness returns the exact success JSON and web returns HTML. Send `Ctrl+C` to the `pnpm dev` PTY, then run:

```bash
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml ps postgres
pnpm dev:down
```

Expected: PostgreSQL is still running before `dev:down`; `dev:down` then removes local containers and network without deleting host data.

- [ ] **Step 8: Run the final repository verification**

Run:

```bash
pnpm check
pnpm test
pnpm lint
pnpm build
git diff --check
rg -n "console\\.(log|warn|error)" apps/server/src
```

Expected:

- check, test, lint, build, and diff check PASS.
- The final `rg` command returns no matches and exits 1 because no forbidden console call exists.

- [ ] **Step 9: Commit the local development guide**

```bash
git add docs/local-development.md
git commit -m "docs: 添加本地双模式启动说明"
```

---

## Final Branch Verification

After all task commits:

```bash
git status --short
git log --oneline -8
pnpm check
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected:

- Worktree is clean except for the intentionally ignored local `.env`.
- The five implementation commits are present after this plan commit and the two approved design commits.
- All repository checks pass.
- No staging, production, CI, reset command, database schema, or migration SQL changes are present.

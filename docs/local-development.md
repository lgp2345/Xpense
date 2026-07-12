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

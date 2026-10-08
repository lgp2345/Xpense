# 本地开发环境

## 前置条件

- Node.js 固定使用 `26.8.2`，pnpm 固定使用 `10.30.2`，版本以根 `package.json` 和 `.node-version` 为准。
- Docker Desktop 已启动，并支持 Docker Compose v2。
- 本地端口 `5432`、`4000`、`5173` 未被占用。

进入项目后先确认运行时版本：

```bash
node --version
pnpm --version
```

Node.js 应输出 `v26.8.2`。支持 `.node-version` 的版本管理工具可直接读取项目声明；切换版本不会修改系统默认 Node.js。

生产方式本地启动前先运行根级 `pnpm build`。该构建会先生成 `@xpense/shared` 的 `dist` 入口，再生成并启动服务端 ESM 产物。

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

## 本地账期出账切换

只在已确认的本项目本地数据库执行，根 `.env` 由现有 dotenv-cli 在进程内加载，禁止输出连接配置。

1. 演练：`pnpm exec turbo run db:reset-rental-billing --filter=@xpense/server -- --organization-id <组织ID>`。可追加 `--contract-id <合同ID>`；默认只列明表、数量及依赖。
2. 核对范围与现有用户许可后，同一命令追加 `--apply`。用户、组织、房产、空间、租户、合同和无关记账交易保留。旧收费设置、入住底数及相关账务被清理，需重新登记。
3. migration 必须另外取得执行许可；随后 `pnpm exec turbo run db:migrate --filter=@xpense/server` 和现有权限种子脚本更新本地 schema 与权限。
4. 新库从历史 migration 链顺序到达账期模型；旧库只在相关旧账务全部清理后切换。保留旧月账务的组织不能直接套用新枚举，工具不会清空全库绕过限制。
5. 若发现范围外或余额交易外键依赖，工具拒绝 apply；须先通过已有业务撤销及余额更新能力处理，不能裸删记账交易。

任务8的浏览器样例与自动化隔离 schema 分开；样例留供检查，测试 helper 只清理本次 schema。

样例演练：`pnpm exec turbo run db:seed-rental-period-billing --filter=@xpense/server -- --organization-id <组织ID> --actor-user-id <已有成员ID>`。默认只查询本地范围和 schema，列出场景。清理、获准迁移及权限种子完成后追加 `--apply`。通过业务服务创建 `账期验收-` 前缀房产、空间、租户和合同；稳定外部编号与步骤键支持重复执行，不创建用户或密码。

输出包含合同与结算页面入口及业务 ID，样例保留供检查。重置时逐个使用输出合同 ID 限定清理，不清空组织或数据库。退租场景在结算页填写水表终值 `3700`、电表 `50`、实际结束日期及固定费退款 `-20.00` 元；普通账单水表为 `3500 → 3600 → 3680`，管理费 `100.00` 元/期。接续前的历史费用假定线下已结清。

样例任务依赖本包 `build`，运行 `node dist/db/seed-local-rental-period-billing.js`，保留 Nest 构造器注入元数据；不要直接用 tsx 加载样例的 Nest 业务源。恢复中断样例时日期以已保存合同和服务端账期上下文为准，不按重跑当天重写原合同边界。

现有组织的权限种子不会重置菜单。如果结算入口返回「路由不存在」，核对该组织是否缺少 `RentalSettlement` 隐藏菜单；按现有菜单管理流程在租赁账单下补齐，权限仍为 `rental_settlements:read`，确认按钮仍为 `rental_settlements:confirm`。不要重置整棵菜单树。

本次实施、验证边界及保留样例入口见 [账期出账验收记录](superpowers/reports/2026-10-08-rental-period-billing.md)。

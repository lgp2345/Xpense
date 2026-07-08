# RBAC 权限与多端登录设计

## 背景

Xpense 是个人记账系统，包括移动端、WEB 后台和 API 服务。后端服务是业务边界、权限边界、事务边界和数据访问入口。WEB 后台和移动端只通过服务端 API 访问业务数据，不直接依赖数据库或服务端内部实现。

当前服务端仍处于早期 NestJS + Fastify 外壳阶段，适合先沉淀认证、组织、RBAC、审计和多端会话的边界，再进入实现。

## 已确认边界

- 权限粒度以接口级权限为最终裁判，页面和按钮权限由接口权限派生。
- 需要 `super_admin` 机制，但它只绕过 RBAC permission check，不绕过认证、组织成员关系、组织上下文或审计日志。
- `refreshToken` 落库，只存 hash，支持会话管理、撤销和轮换。
- 第一版需要审计日志，只记录关键安全与 IAM 管理操作。
- 第一版涉及组织维度：用户属于组织，角色在组织内生效。
- 后台管理员和普通记账用户共用 `users` 账号体系。
- 角色采用内置基础角色 + 组织内自定义角色。
- 同一用户在同一组织内只允许一个角色。
- 第一版只做组织级数据范围，不做本人、部门或指定资源范围权限。
- 允许同一账号多端同时在线。
- 切换组织只影响当前 session，不影响其他端。
- 第一版不做可信设备或设备绑定。

## 整体架构

RBAC 模块放在服务端，作为认证之后、业务 service 之前的统一权限边界。前端只消费后端返回的当前用户、当前组织和权限集合，用于控制路由入口、菜单和按钮显隐；真正的权限判断全部在服务端 guard/service 层完成。

请求链路：

```text
request
 -> AuthGuard 解析 accessToken，得到 userId / sessionId / organizationId
 -> 校验 session、用户状态和组织上下文
 -> RbacGuard 校验 user 是否是当前组织 active member
 -> 若 user.isSuperAdmin，跳过 permission check
 -> 否则校验 membership.role.permissions 是否包含接口所需 permission
 -> controller
 -> service/repository 始终使用 authContext.organizationId 约束业务数据
```

这里保留两层边界：

- guard 负责判断当前用户能否访问目标接口。
- service/repository 负责保证只能操作当前组织的数据。

## 后端模块拆分

### `auth`

负责认证与会话：

- 登录。
- accessToken 签发。
- refreshToken hash 校验、轮换和过期控制。
- 当前 session 退出。
- 指定 session 撤销。
- 全部 session 撤销。

`auth` 只回答“你是谁、session 是否有效”，不承载角色和权限管理。

### `organizations`

负责组织和组织成员上下文：

- 组织基础信息。
- 用户组织列表。
- 组织成员关系。
- 当前 session 的组织切换。

组织上下文只来自 accessToken 中的 `organizationId`。IAM 和业务接口不从 URL、header 或 body 接收 `organizationId`。

### `iam`

负责身份访问管理：

- 权限字典。
- 系统角色。
- 组织自定义角色。
- 角色权限绑定。
- 成员角色管理。
- `RequirePermission` decorator。
- `RbacGuard` 和 `AccessService`。

`iam` 只回答“当前用户在当前组织能不能做这个动作”。

### `audit`

负责审计日志写入和查询基础能力。第一版服务认证与 IAM 管理事件，不做全量业务操作日志。

### `common`

提供跨模块基础能力：

- `AuthContext` 类型。
- 当前用户、当前 session、当前组织上下文 decorator。
- 统一异常结构。
- guard 共享工具。

业务模块不得自行解析 token。

## 数据模型

### `users`

统一账号表。后台管理员和普通记账用户共用。

关键字段：

- `id`
- `email` 或 `phone`
- `passwordHash`
- `status`
- `isSuperAdmin`
- `createdAt`
- `updatedAt`

`isSuperAdmin` 只影响 RBAC permission check，不影响认证、组织成员校验、组织上下文或审计。

### `organizations`

组织表，是第一版权限与业务数据隔离的上界。

关键字段：

- `id`
- `name`
- `status`
- `createdByUserId`
- `createdAt`
- `updatedAt`

第一版不做部门和多级租户结构。

### `organization_memberships`

用户在组织内的成员关系。

关键字段：

- `id`
- `organizationId`
- `userId`
- `roleId`
- `status`
- `joinedAt`
- `createdAt`
- `updatedAt`

约束：

- `organizationId + userId` 唯一。
- 同一用户在同一组织内只允许一个角色。
- 只有 active member 可以访问当前组织接口。

### `roles`

角色表。

关键字段：

- `id`
- `organizationId nullable`
- `key`
- `name`
- `description`
- `isSystem`
- `isEditable`
- `createdAt`
- `updatedAt`

规则：

- 内置基础角色使用 `organizationId = null`。
- 组织自定义角色绑定具体 `organizationId`。
- 不可编辑系统角色不能被修改或删除。

### `permissions`

权限字典表。

关键字段：

- `id`
- `key`
- `name`
- `resource`
- `action`
- `description`

权限字典作为稳定配置存在。代码中同时导出同名常量，避免字符串散落和拼写错误。

### `role_permissions`

角色与权限关联表。系统角色和组织自定义角色都通过它绑定权限。

### `refresh_sessions`

多端登录和 refreshToken 的服务端状态源。

关键字段：

- `id`
- `userId`
- `currentOrganizationId nullable`
- `clientType`
- `deviceIdHash nullable`
- `deviceName nullable`
- `refreshTokenHash`
- `status`
- `expiresAt`
- `rotatedAt`
- `revokedAt`
- `lastUsedAt`
- `userAgent nullable`
- `ipHash nullable`
- `createdAt`
- `updatedAt`

规则：

- 每次登录创建一条 refresh session。
- refreshToken 明文只交给客户端，服务端只存 hash。
- refresh 时轮换 refreshToken，旧 token 失效。
- 当前组织属于 session 维度，不属于账号全局维度。
- 切换组织只更新当前 session 的 `currentOrganizationId`，不影响其他端。

### `audit_logs`

审计日志表。

关键字段：

- `id`
- `organizationId nullable`
- `actorUserId nullable`
- `action`
- `targetType`
- `targetId nullable`
- `result`
- `metadata`
- `requestId`
- `createdAt`

不得记录密码、token、refreshToken hash、完整 IP 或敏感业务内容。

## 权限命名规范

权限 key 采用 `resource.action` 格式，全小写，用点分隔。

示例：

```text
members.read
members.create
members.update
members.disable
members.enable
roles.read
roles.create
roles.update
roles.delete
roles.permissions.update
permissions.read
sessions.read
sessions.revoke
audit_logs.read
transactions.read
transactions.create
transactions.update
transactions.delete
```

规则：

- `resource` 使用复数业务资源名。
- `action` 使用稳定动词，例如 `read`、`create`、`update`、`delete`、`disable`、`enable`、`revoke`。
- 不把 HTTP 方法写进权限名。
- 不使用 `GET_MEMBERS` 这类接口耦合命名。
- 页面和按钮权限由接口权限派生，不单独建立 `page.*` 或 `button.*` 权限。
- 权限 key 一旦发布尽量不改名；需要废弃时保留迁移策略。

## API 设计

### 认证接口

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET /auth/sessions
POST /auth/sessions/:id/revoke
POST /auth/sessions/revoke-all
```

登录成功后创建独立 refresh session，返回短期 accessToken 和一次性 refreshToken。

accessToken 包含：

- `userId`
- `sessionId`
- `organizationId`

accessToken 不作为长期登录状态源。refresh session 才是多端登录的真实状态源。

### 当前用户接口

```text
GET /user
GET /user/organizations
POST /user/current-organization
```

`GET /user` 返回当前 session 的当前组织权限上下文：

```text
user
organization
role
permissions
session
```

`POST /user/current-organization` 流程：

```text
校验目标组织存在
 -> 校验当前 user 是目标组织 active member
 -> 更新当前 refresh_session.currentOrganizationId
 -> 为当前 session 签发新的 accessToken
 -> 不影响其他 sessions
```

### IAM 管理接口

IAM 接口全部默认当前组织作用域，组织上下文只来自 accessToken。

```text
GET /members
POST /members
PATCH /members/:memberId

GET /roles
POST /roles
PATCH /roles/:roleId
DELETE /roles/:roleId

GET /permissions
```

所有 service/repository 查询必须始终使用 `authContext.organizationId` 作为组织条件，不信任客户端传入组织 ID。

每个接口用 decorator 声明所需权限：

```ts
@RequirePermission("members.read")
@RequirePermission("roles.update")
```

## 多端登录策略

允许同一账号多端同时在线。

客户端类型：

```text
web_pc
web_mobile
app_ios
app_android
```

规则：

- 每次登录创建独立 `refresh_session`。
- 一个端或一个设备对应一个 session。
- 退出当前端只撤销当前 session。
- 退出全部端撤销当前用户全部 active sessions。
- 管理员撤销某设备时撤销指定 session。
- 禁用用户时撤销该用户所有 active sessions。
- 禁用组织成员时撤销该用户在该组织上下文下的相关 sessions，或让下一次请求和 refresh 失败；第一版优先直接撤销 `currentOrganizationId = 该组织` 的 sessions。
- 不做可信设备。
- 不做设备绑定。
- 不限制同一 `clientType` 同时在线数量。

App 端可以传 `deviceId` 和 `deviceName`，服务端只保存 `deviceIdHash`。Web 端可记录 `userAgent` 和 `ipHash` 用于展示和风险排查。

## 前端接入方式

WEB 后台从 `GET /user` 获取当前权限上下文：

```ts
{
  user: { id, name, email, isSuperAdmin },
  organization: { id, name },
  role: { id, key, name },
  permissions: ["transactions.read", "roles.update"],
  session: { id, clientType }
}
```

前端封装轻量权限判断能力：

```ts
can("roles.update")
canAny(["roles.update", "roles.delete"])
canAll(["roles.read", "roles.update"])
```

接入位置：

- 路由层：没有页面所需权限时，不展示入口；直接访问时显示无权限页面。
- 菜单层：按权限隐藏菜单项。
- 按钮层：按权限隐藏或禁用操作按钮；危险操作仍需二次确认。
- API 层：`401` 清理登录态并回到登录页，`403` 显示无权限反馈。

前端权限判断只用于体验裁剪，不能替代后端 guard。

`isSuperAdmin` 用户前端可以显示当前组织全部功能入口，但后端仍然执行认证、active membership、当前组织上下文和审计。

## 错误处理

错误响应保持稳定，不暴露内部细节。

```text
401 UNAUTHENTICATED
- accessToken 缺失、过期或签名无效
- refreshToken 缺失、过期、hash 不匹配或 session 已撤销

403 FORBIDDEN
- 当前用户不是当前组织 active member
- 当前角色缺少接口所需 permission
- 当前组织被禁用
- 尝试操作系统内置且不可编辑角色

409 CONFLICT
- 成员已存在
- 角色 key 在当前组织内重复
- 删除仍被成员使用的角色

422 VALIDATION_FAILED
- DTO 校验失败
```

管理类接口可以明确返回 `403`。业务数据接口如果资源不属于当前组织，优先按 `404` 处理，避免暴露其他组织资源是否存在。

## 审计日志

第一版记录关键安全与 IAM 管理事件：

```text
auth.login.succeeded
auth.login.failed
auth.refresh.succeeded
auth.refresh.failed
auth.logout.succeeded
auth.session.revoked
auth.sessions.revokedAll

organization.switched

member.created
member.role.changed
member.disabled
member.enabled

role.created
role.updated
role.deleted
role.permissions.changed
```

审计 metadata 可以记录角色变更前后、权限 key 变更集合等必要上下文，但不得记录密码、token、refreshToken hash、完整 IP 或敏感业务内容。

审计写入策略：

- 权限、成员、角色变更的审计失败应阻断返回成功。
- 认证成功或失败的审计失败不阻断登录流程，但必须记录结构化服务端错误。

## 测试策略

### 后端单元测试

`auth service`：

- 登录成功和失败。
- refreshToken hash 校验。
- refreshToken 轮换。
- revoked session 不能刷新。
- expired session 不能刷新。
- logout/revoke 后 session 失效。
- 多端登录创建独立 session。
- 组织切换只影响当前 session。

`rbac guard / access service`：

- 无 token 返回 `401`。
- 非组织成员返回 `403`。
- inactive member 返回 `403`。
- 普通角色缺少 permission 返回 `403`。
- 普通角色拥有 permission 放行。
- `super_admin` active member 跳过 permission check。
- `super_admin` 非成员仍然不能访问当前组织。

### 后端 E2E 测试

- 成员列表、新增、禁用、启用、改角色。
- 角色创建、编辑、删除。
- 修改角色权限。
- 删除被成员使用的角色返回 `409`。
- 不可编辑系统角色不能被修改。
- 所有管理变更写入审计日志。
- 切换组织后 accessToken 中 organizationId 生效。
- IAM 接口不接受 URL/header/body 中的 organizationId。

### 前端测试

- `/user` 返回不同 permissions 时菜单和按钮显隐正确。
- 无权限访问受保护路由时显示无权限状态。
- 切换组织后重新拉取用户上下文并刷新权限。
- API 返回 `401` 和 `403` 时有统一处理。

## 落地顺序

1. 建立认证与会话：`users`、`refresh_sessions`、login、refresh、logout。
2. 建立组织与成员：`organizations`、`organization_memberships`，让 accessToken 带 `organizationId`。
3. 建立权限字典和角色：`permissions`、`roles`、`role_permissions`，seed 内置角色和权限。
4. 接入 `AuthGuard`、`RbacGuard`、`RequirePermission`。
5. 实现 `/user`、组织切换、成员管理和角色管理接口。
6. 接入审计日志。
7. 接入前端权限裁剪。

数据库 schema 变更必须和 migration 一起提交。新增 controller、service、repository 必须有对应测试。

## 本次明确不做

- 不做部门维度、岗位维度、租户树或多级组织。
- 不做数据范围权限，例如“仅本人创建”“部门数据”“指定账本数据范围”。
- 不做页面权限或按钮权限的独立配置表。
- 不做多角色叠加。
- 不做临时授权、审批流或权限过期时间。
- 不做策略引擎或 ABAC。
- 不做平台级跨组织管理接口；如未来需要，单独设计 `/platform/...`。
- 不做全量业务审计日志。
- 不做 refreshToken 明文落库。
- 不做绕过组织成员关系的 `super_admin`。
- 不做可信设备。
- 不做设备绑定。
- 不限制同一账号多端同时在线。

## 进入实现计划前的参数决策

以下参数不改变本设计的模块边界和权限模型，但会影响具体实现和测试用例。进入实现计划前需要单独确认：

- accessToken 和 refreshToken 的具体过期时间。
- Web 端 refreshToken 存储策略：HTTP-only cookie 或客户端安全存储方案。
- App 端安全存储方案。
- 初始系统角色和权限集合。
- 首个组织和首个 `super_admin` 的初始化方式。

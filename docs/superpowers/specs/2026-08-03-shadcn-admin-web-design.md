# Xpense Web 采用 shadcn-admin 设计说明

## 1. 背景与目标

Xpense Web 当前采用 HeroUI、Phosphor Icons、冷雾玻璃材质和超大圆角设计。该视觉方向不再继续维护，本次在 `rbac-permission-system-web-design` 分支上重建 Web 设计层。

新的设计以 `satnaing/shadcn-admin` 为基线，固定参考提交为 `e16c87f213a5ba5e45964e9b67c792105ec74d26`。上游代码仅作为源码和视觉参考，不作为运行时依赖、Git subtree 或独立应用嵌入 Xpense。

本次目标：

- 使用 shadcn-admin 的 New York / Slate 视觉语言替换旧冷雾玻璃设计。
- 使用项目自有的 shadcn/ui 组件源码替换 HeroUI。
- 建立统一的受保护后台壳层、响应式侧栏、主题切换和全局命令面板。
- 保留现有认证、组织、RBAC、API、路由 URL 和服务端数据结构。
- 使用 TanStack Form + Zod 重建三个提交表单。
- 删除旧财务仪表盘，使用中文化的 shadcn-admin 示例仪表盘替代首页。
- 删除不再适用的旧 UI 测试，并针对新结构建立新的行为测试。

## 2. 非目标

本次不实施：

- 不迁移到上游的文件路由和生成式 route tree。
- 不引入 Clerk、TanStack Query、TanStack Table 或 React Hook Form。
- 不复制任务、聊天、应用、设置、帮助中心、注册、找回密码和 OTP 示例页面。
- 不实现 RTL。
- 不实现跨成员、角色、交易或账户的业务数据搜索。
- 不新增服务端接口，不改变 API 路径、响应结构、权限定义、金额策略或时间策略。
- 不把原财务仪表盘迁移到隐藏路由；旧财务仪表盘及其样式直接删除。
- 不实现原模板中无行为的 Download 按钮、Reports 标签或 Notifications 标签。

## 3. 上游采用与许可

只选择性移植当前产品需要的布局、组件和交互模式，不复制完整仓库。直接改编的上游源码需要保留其 MIT 许可声明，并在 Web 应用的第三方声明中记录项目名、仓库地址、固定提交和 MIT License。Xpense 自有业务代码继续遵循本仓库许可。

## 4. 技术架构

保留现有技术基础：

- React 19
- TypeScript 6
- Vite 8
- TanStack Router
- Zustand
- Tailwind CSS 4
- Vitest + Testing Library

新增或直接声明的 Web 依赖：

- `@tanstack/react-form`
- `zod`，使用 workspace catalog 的 Zod 4
- `lucide-react`
- `recharts`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `tw-animate-css`
- `cmdk`
- `sonner`
- `@radix-ui/react-alert-dialog`
- `@radix-ui/react-avatar`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-collapsible`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-label`
- `@radix-ui/react-popover`
- `@radix-ui/react-scroll-area`
- `@radix-ui/react-select`
- `@radix-ui/react-separator`
- `@radix-ui/react-slot`
- `@radix-ui/react-tabs`
- `@radix-ui/react-tooltip`

迁移完成并确认没有引用后，移除 `@heroui/react`、`@heroui/styles` 和 `@phosphor-icons/react`。依赖变化必须通过 pnpm 更新 workspace lockfile。

## 5. 组件所有权与目录边界

`apps/web/src/components/ui` 保存项目自有的 shadcn/ui 基础组件源码。首批组件为：

- Button
- Input
- Select
- Checkbox
- Dialog
- AlertDialog
- Table
- Tabs
- DropdownMenu
- Tooltip
- Avatar
- Badge
- Skeleton
- Sheet
- Command
- ScrollArea
- Separator
- Sonner

`apps/web/src/components/layout` 保存后台壳层组件，包括受保护布局、应用侧栏、导航分组、顶部栏、用户菜单和组织切换入口。

`apps/web/src/context` 保存主题、侧栏和命令面板的局部 UI 状态。业务数据、认证状态和组织权限继续由现有 service 与 auth store 管理，不迁入 UI context。

业务页面与 workflow 继续位于现有 `src/features`、`src/pages` 和 `src/services` 边界内。组件不得直接拼装 fetch 请求。

## 6. 视觉设计系统

视觉采用 shadcn-admin 的 New York / Slate 基线：

- 中性黑白灰为主，不沿用旧青绿色画布、玻璃模糊和装饰渐变。
- `0.625rem` 为基础圆角，通过 `sm`、`md`、`lg`、`xl` 派生，不保留旧 `16px`、`24px`、`32px` 强制圆角体系。
- 使用细边框、轻阴影和紧凑信息密度。
- 使用 Lucide 图标，并保持同一页面线宽一致。
- 金额和统计数字启用 tabular figures。
- 只有收入、支出、成功、警告和错误使用业务语义色。
- 所有交互提供 hover、pressed、disabled 和可见 focus 状态。
- 不使用死链接、无处理逻辑的按钮或仅用于模板展示的配置控件。

主题支持 `light`、`dark` 和 `system` 三种模式。首次访问使用 `system`，用户选择持久化到浏览器本地存储。主题状态不写入 Zustand 业务 store，也不调用服务端。

## 7. 路由与受保护后台壳层

保留现有程序式 TanStack Router 和全部 URL：

- `/login`
- `/`
- `/members`
- `/roles`
- `/sessions`
- `/audit-logs`
- `/forbidden`
- `/foundation`

登录页位于受保护壳层之外。首页、成员、角色、会话和审计日志位于统一受保护壳层内。`/foundation` 保持最低限度兼容但不进入产品导航。

导航分为：

- 概览：仪表盘
- 访问控制：成员、角色
- 安全：会话、审计日志

侧栏桌面端支持展开和收起；移动端使用 Sheet 抽屉，关闭后不占页面空间。侧栏顶部使用现有组织数据实现 Team Switcher 形态，底部展示当前用户并提供退出入口。

路由守卫是最终安全边界。侧栏和命令面板根据当前权限隐藏入口，但不能代替路由守卫。超级管理员继续获得现有完整权限集合。

## 8. 顶部栏与全局命令面板

顶部栏包含：

- 侧栏触发器
- 全局搜索入口
- 主题切换
- 用户菜单

不复制上游 Config Drawer。

用户通过 `Ctrl+K` 或 `Cmd+K` 打开命令面板。首期命令来源为 Xpense 路由与明确的本地快捷操作，并按权限过滤。选择命令后关闭面板并使用 TanStack Router 导航。当前实现不创建未使用的异步搜索抽象；未来业务数据搜索作为独立功能接入时，再扩展命令数据提供边界。

## 9. 登录页

桌面端采用反向双栏布局：

- 左侧展示 Xpense 后台设计图和一行简短说明。
- 右侧显示品牌、登录说明和表单。
- 左侧展示区域独立封装，后续可以替换图片或内容而不影响表单。

移动端隐藏左侧展示区域，只显示单栏登录表单。登录页继续支持安全 redirect、浏览器自动填充、提交中状态、字段错误和认证错误。

该布局本轮按已确认方向实现，不继续进行视觉精修；后续优化不阻塞本次迁移。

## 10. 仪表盘

首页使用 shadcn-admin 原版仪表盘结构，不保留旧财务仪表盘模块：

- 页面标题和单一有效主操作区域；本轮不提供 Download 按钮。
- `概览` 与 `分析` 两个可用标签。
- 四个指标卡。
- Overview 柱状图。
- Recent Sales 列表。
- 上游 Analytics 区域的中文化版本。

内容采用中文和人民币固定模拟数据。四个指标维持上游含义：总收入、订阅数、销售额和当前活跃数。Recent Sales 使用固定中文姓名、邮箱和人民币金额。图表数据在模块常量中定义，不在 render 或模块初始化期间调用 `Math.random()`。

Reports、Notifications 等禁用标签不进入产品。仪表盘模拟内容不调用服务端 API，也不伪装成真实 Xpense 财务数据。

## 11. 业务管理页面

成员、角色、会话和审计日志使用统一页面骨架：标题、说明、主要操作、筛选区、数据表、分页、加载态、空态和错误态。

- 成员页保留新增、修改角色、启用和禁用能力。
- 角色页保留创建、编辑、删除和权限矩阵能力。
- 会话页保留撤销单个会话和撤销其他会话能力。
- 审计日志保留 URL 驱动的筛选和分页。

删除、禁用、撤销等高风险操作使用 AlertDialog。成功反馈使用短 Toast；失败时保留当前页面和用户输入，并显示可理解错误。不得在错误消息中暴露内部响应、token 或用户隐私。

## 12. TanStack Form + Zod

以下三个提交表单统一迁移：

1. 登录表单
2. 新增成员表单
3. 新增/编辑角色表单，包括权限矩阵字段

不引入 React Hook Form 和 `@hookform/resolvers`。shadcn/ui 只提供 Input、Select、Checkbox、Label 和错误展示等视觉控件。

每个表单使用对应 Zod schema 作为唯一客户端校验来源：

- 登录：邮箱必须存在且格式有效，密码不能为空；提交前裁剪邮箱空白。
- 成员：用户 ID 必须是有效 UUID，角色 ID 必填；提交前裁剪用户 ID。
- 角色：创建时角色标识必填并转换为 slug，角色名称必填，说明裁剪空白，权限键保持现有 `PermissionKey[]` 类型；编辑不可编辑角色时禁止提交受保护字段。

TanStack Form 管理值、触碰状态、字段错误、提交状态和重置。只有 API 成功后弹窗才关闭并重置。API 失败属于表单级错误，不伪装成字段校验错误。

审计日志筛选不是提交表单，继续直接由路由 search 参数驱动。筛选变化时清除页码，空值不进入 URL。

## 13. 状态与错误处理

- 登录成功继续通过现有 web session 写入认证状态并执行安全跳转。
- 组织切换继续调用现有 API；成功后更新组织和权限，失败时保留原组织。
- 主题、侧栏和命令面板是局部 UI 状态，不进入业务 store。
- 加载使用与目标布局匹配的 Skeleton，不使用阻塞整页的通用 spinner。
- 空数据展示明确说明和可执行下一步；无权限状态不泄漏受保护数据。
- 请求失败提供页面级、表单级或 Toast 反馈，层级取决于操作范围。
- 删除、禁用和撤销操作必须先确认；当前会话被撤销后继续清理认证状态并跳转登录页。

## 14. 测试迁移策略

旧 UI 测试绑定 HeroUI、旧 DOM 和旧工作区结构，直接删除：

- `apps/web/src/features/audit/audit-logs-page.test.tsx`
- `apps/web/src/features/dashboard/components/workspace-shell.test.tsx`
- `apps/web/src/features/members/members-page.test.tsx`
- `apps/web/src/features/roles/permission-matrix.test.tsx`
- `apps/web/src/features/roles/roles-page.test.tsx`
- `apps/web/src/features/sessions/sessions-page.test.tsx`
- `apps/web/src/features/user/organization-switcher.test.tsx`
- `apps/web/src/features/user/user-header.test.tsx`
- `apps/web/src/pages/dashboard-page.test.tsx`
- `apps/web/src/pages/forbidden-page.test.tsx`
- `apps/web/src/pages/foundation-page.test.tsx`
- `apps/web/src/pages/login-page.test.tsx`

新测试围绕新组件和用户行为重新建立，不复用旧选择器或 HeroUI 交互假设。新覆盖包括：

- 主题的浅色、深色、跟随系统和持久化。
- 桌面侧栏、移动抽屉和键盘操作。
- 命令面板快捷键、权限过滤和导航。
- 登录、成员、角色表单的 Zod 校验、成功和 API 失败。
- 角色权限矩阵与不可编辑角色边界。
- 成员禁用、角色删除、会话撤销等确认流程。
- 审计筛选 URL 恢复和分页重置。
- 仪表盘固定数据、概览/分析标签切换和无随机渲染。
- 新登录页桌面与移动语义结构。

以下业务与基础设施测试保留，必要时只更新壳层或导入适配：

- `apps/web/src/hooks/use-permission.test.ts`
- `apps/web/src/lib/env.test.ts`
- `apps/web/src/routes/app-router.test.tsx`
- `apps/web/src/routes/protected-route.test.tsx`
- `apps/web/src/routes/router.test.tsx`
- `apps/web/src/routes/safe-redirect.test.ts`
- `apps/web/src/services/api-client.test.ts`
- `apps/web/src/services/auth-api.test.ts`
- `apps/web/src/services/foundation-api.test.ts`
- `apps/web/src/services/iam-api.test.ts`
- `apps/web/src/services/web-session.test.ts`
- `apps/web/src/stores/auth-store.test.ts`

删除旧 UI 测试不能降低业务断言；对应业务行为必须由新测试重新覆盖后才算迁移完成。

## 15. 文档变更

重写 `apps/web/DESIGN.md`，删除冷雾玻璃、超大圆角、Urbanist 和旧图标规范，改为本文定义的 shadcn-admin 基线。

更新 `apps/web/ARCHITECTURE.md` 与 `apps/web/AGENTS.md`：

- shadcn/ui 成为唯一主要 UI 组件策略。
- 移除 HeroUI 优先规则。
- TanStack Form + Zod 成为提交表单标准。
- Tailwind CSS 4 继续负责布局和局部样式；复杂联动仍可使用 CSS Modules。
- 保留 React 19、Vite SPA、服务边界和性能约束。

稳定约定只写入 Web 范围文档，不改变移动端或服务端规则。

## 16. 验收与验证

必须完成：

- Web 目标测试通过。
- Web TypeScript 检查通过。
- Web lint 通过。
- Web Vite 构建通过。
- 根据影响面补跑全仓 `test`、`lint` 和 `check`。
- `git diff --check` 无空白错误。
- 没有新增 `console.log`、`console.warn` 或 `console.error`。
- 没有真实密钥、token、密码或连接串。
- HeroUI 和 Phosphor 的源码引用及依赖均已移除。
- 亮色、暗色、桌面侧栏和移动抽屉均可操作。
- 权限导航与路由守卫保持一致，无越权入口或数据泄漏。
- 登录、成员和角色表单的成功、失败与校验错误均有测试。
- 所有按钮和菜单项具有真实行为或明确禁用原因，不存在死控件。

## 17. 已知边界

- 首页在本阶段展示明确的模拟 SaaS 指标，不代表真实财务数据。
- 登录页左侧设计展示区本轮只达到可用和风格一致，后续可以独立优化。
- 全局搜索首期只处理导航与本地命令，不查询业务数据。
- 不验证 RTL。

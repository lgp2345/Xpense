# Xpense shadcn-admin Web Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 shadcn-admin 的 New York / Slate 设计系统重建 Xpense Web，在保留现有认证、RBAC、API 和 URL 语义的前提下，交付响应式后台壳层、亮暗主题、权限化命令面板、中文示例仪表盘，以及 TanStack Form + Zod 表单。

**Architecture:** `satnaing/shadcn-admin@e16c87f213a5ba5e45964e9b67c792105ec74d26` 只作为固定源码参考；基础组件源码归 Xpense 的 `src/components/ui` 所有。程序式 TanStack Router 增加 pathless 受保护父路由承载后台壳层，现有 service、Zustand auth store 和权限守卫继续作为业务与安全边界。

**Tech Stack:** React 19、TypeScript 6、Vite 8、TanStack Router、TanStack Form 1、Zod 4、Zustand 5、Tailwind CSS 4、Radix UI、Recharts 3、Vitest 4、Testing Library。

## Global Constraints

- 固定参考上游提交 `e16c87f213a5ba5e45964e9b67c792105ec74d26`；不从浮动 `main` 复制代码。
- 保留 `/login`、`/`、`/members`、`/roles`、`/sessions`、`/audit-logs`、`/forbidden`、`/foundation`。
- 不改变 API、共享 DTO、权限键、金额策略、时间策略或服务端代码。
- shadcn/ui 是唯一主要 UI 组件策略；迁移结束后不保留 HeroUI 与 Phosphor 引用。
- 提交表单只使用 TanStack Form + Zod；不安装 React Hook Form 或 `@hookform/resolvers`。
- 审计筛选继续由 TanStack Router search 参数管理。
- 首期命令面板只搜索有权限的页面与本地命令，不查询业务数据。
- 首页明确展示固定模拟数据，不调用业务 API，不使用 `Math.random()`。
- 不实现 Clerk、TanStack Query、TanStack Table、RTL、任务、聊天、应用或设置示例页。
- 每次依赖安装、删除文件、暂存或提交前均按项目规则取得用户确认；计划中的 Commit 步骤不是预授权。
- 不修改、格式化或回滚任务范围之外的用户改动。
- 直接改编上游源码时保留 MIT 许可声明，并记录固定提交。

## File Structure

### Foundation and providers

- `apps/web/components.json`：shadcn CLI 元数据，固定 `new-york`、`slate`、Tailwind CSS 4 和 Lucide。
- `apps/web/src/lib/utils.ts`：只导出 `cn(...inputs: ClassValue[]): string`。
- `apps/web/src/styles/theme.css`：New York / Slate 的 light、dark、sidebar 和 chart OKLCH tokens。
- `apps/web/src/context/theme-provider.tsx`：`light | dark | system` 状态、系统主题监听和本地持久化。
- `apps/web/src/context/search-provider.tsx`：命令面板开关状态和 `Cmd/Ctrl+K` 监听。
- `apps/web/src/components/app-providers.tsx`：组合 Theme、Tooltip、Search 和 Sonner。
- `apps/web/src/components/ui/*.tsx`：项目自有 shadcn/ui 基础组件。

### Layout and routing

- `apps/web/src/components/layout/navigation.ts`：静态导航定义和权限过滤纯函数。
- `apps/web/src/components/layout/authenticated-layout.tsx`：受保护后台壳层。
- `apps/web/src/components/layout/app-sidebar.tsx`：响应式侧栏与组织入口。
- `apps/web/src/components/layout/header.tsx`：顶部栏。
- `apps/web/src/components/layout/nav-group.tsx`：导航分组。
- `apps/web/src/components/layout/nav-user.tsx`：用户信息与退出。
- `apps/web/src/components/layout/team-switcher.tsx`：组织选择和切换反馈。
- `apps/web/src/components/command-menu.tsx`：权限化命令面板。
- `apps/web/src/routes/router.tsx`：pathless 受保护父路由、现有路由守卫和业务页面装配。

### Feature files

- `apps/web/src/features/auth/login-schema.ts`、`login-form.tsx`、`login-showcase.tsx`：登录 schema、表单和左侧展示区。
- `apps/web/src/features/dashboard/*`：中文固定模拟数据、概览图表、近期销售和分析内容。
- `apps/web/src/features/members/member-form-schema.ts`：成员表单 schema。
- `apps/web/src/features/roles/role-form-schema.ts`：角色表单 schema 与 slug 规范化。
- 现有成员、角色、会话、审计 feature 文件保留业务职责，替换展示组件和交互实现。

### Tests

- 新测试以 `theme-provider.test.tsx`、`authenticated-layout.test.tsx`、`command-menu.test.tsx`、`login-workflow.test.tsx`、`dashboard.test.tsx`、`members-workflow.test.tsx`、`roles-workflow.test.tsx`、`sessions-workflow.test.tsx`、`audit-log-workflow.test.tsx` 为主。
- 设计说明列出的 12 个旧 UI 测试删除；12 个业务与基础设施测试保留并按新壳层更新。

---

### Task 1: Install the shadcn foundation and theme runtime

**Files:**

- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/styles/theme.css`
- Create: `apps/web/src/context/theme-provider.tsx`
- Create: `apps/web/src/context/theme-provider.test.tsx`
- Create: `apps/web/src/components/app-providers.tsx`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/skeleton.tsx`
- Create: `apps/web/src/components/ui/tooltip.tsx`
- Create: `apps/web/src/components/ui/sonner.tsx`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/test/setup.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `cn(...inputs: ClassValue[]): string`.
- Produces: `type Theme = "dark" | "light" | "system"`.
- Produces: `useTheme(): { theme: Theme; setTheme(theme: Theme): void }`.
- Produces: `<AppProviders>{children}</AppProviders>` for the application root.

- [ ] **Step 1: Write the failing theme behavior test**

```tsx
it("applies and persists the selected theme", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider defaultTheme="system" storageKey="xpense-ui-theme">
      <ThemeProbe />
    </ThemeProvider>,
  );

  await user.click(screen.getByRole("button", { name: "使用深色主题" }));

  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("xpense-ui-theme")).toBe("dark");
});
```

`ThemeProbe` 在测试文件内调用 `useTheme()` 并渲染设置深色主题的按钮。再增加一个测试：`system` 模式根据 `matchMedia("(prefers-color-scheme: dark)")` 添加或移除 `dark` class，并在 unmount 时移除监听器。

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `pnpm --filter @xpense/web exec vitest run src/context/theme-provider.test.tsx`

Expected: FAIL because `theme-provider.tsx` does not exist.

- [ ] **Step 3: Add exact dependency declarations and install them**

Add these production dependencies to `apps/web/package.json`:

```json
{
  "@radix-ui/react-alert-dialog": "^1.1.15",
  "@radix-ui/react-avatar": "^1.1.11",
  "@radix-ui/react-checkbox": "^1.3.3",
  "@radix-ui/react-collapsible": "^1.1.12",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-label": "^2.1.8",
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-scroll-area": "^1.2.10",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.8",
  "@radix-ui/react-slot": "^1.2.4",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-tooltip": "^1.2.8",
  "@tanstack/react-form": "^1.11.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "cmdk": "1.1.1",
  "lucide-react": "^1.8.0",
  "recharts": "^3.8.1",
  "sonner": "^2.0.7",
  "tailwind-merge": "^3.5.0",
  "tw-animate-css": "^1.4.0",
  "zod": "catalog:"
}
```

Run: `pnpm install`

Expected: `pnpm-lock.yaml` updates without peer dependency errors.

- [ ] **Step 4: Configure aliases and shadcn metadata**

Add `baseUrl: "."` and `paths: { "@/*": ["./src/*"] }` to `apps/web/tsconfig.json`. Add `resolve.alias["@"] = fileURLToPath(new URL("./src", import.meta.url))` to Vite. Create `components.json` with:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 5: Implement theme tokens, provider, base primitives, and app providers**

Port `src/styles/theme.css`, `button.tsx`, `input.tsx`, `label.tsx`, `skeleton.tsx`, `tooltip.tsx`, and `sonner.tsx` from the fixed upstream commit. Remove RTL-only code and preserve exported names. Implement the provider contract:

```ts
export type Theme = "dark" | "light" | "system";

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};
```

`ThemeProvider` reads `xpense-ui-theme`, subscribes to system color changes only in `system` mode, and updates `document.documentElement.classList`. `AppProviders` nests ThemeProvider, TooltipProvider, the search provider added in Task 2, and Toaster; until Task 2 it may omit SearchProvider without an unused stub.

- [ ] **Step 6: Replace global visual tokens without deleting feature styles yet**

`styles.css` must import Tailwind, `tw-animate-css`, and `./styles/theme.css`; add the upstream base rules for background, foreground, scrollbar, pointer cursor, and 16px mobile inputs. Remove old global glass tokens only after all feature CSS is removed in Task 8. Wrap `<AppRouter />` with `<AppProviders>` in `main.tsx`.

- [ ] **Step 7: Run focused and foundation validation**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/context/theme-provider.test.tsx src/lib/env.test.ts
pnpm --filter @xpense/web check
```

Expected: all selected tests pass and TypeScript reports no errors.

- [ ] **Step 8: Request approval and commit the foundation**

```bash
git add apps/web/components.json apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/src/lib apps/web/src/styles apps/web/src/styles.css apps/web/src/context apps/web/src/components/app-providers.tsx apps/web/src/components/ui apps/web/src/main.tsx apps/web/src/test/setup.ts pnpm-lock.yaml
git commit -m "feat: 建立shadcn界面基础"
```

### Task 2: Build the protected application shell and permission-aware command menu

**Files:**

- Create: `apps/web/src/context/search-provider.tsx`
- Create: `apps/web/src/components/layout/navigation.ts`
- Create: `apps/web/src/components/layout/navigation.test.ts`
- Create: `apps/web/src/components/layout/authenticated-layout.tsx`
- Create: `apps/web/src/components/layout/authenticated-layout.test.tsx`
- Create: `apps/web/src/components/layout/app-sidebar.tsx`
- Create: `apps/web/src/components/layout/header.tsx`
- Create: `apps/web/src/components/layout/nav-group.tsx`
- Create: `apps/web/src/components/layout/nav-user.tsx`
- Create: `apps/web/src/components/layout/team-switcher.tsx`
- Create: `apps/web/src/components/command-menu.tsx`
- Create: `apps/web/src/components/command-menu.test.tsx`
- Create: `apps/web/src/hooks/use-mobile.ts`
- Create: remaining layout UI primitives under `apps/web/src/components/ui/`
- Modify: `apps/web/src/components/app-providers.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/web/src/routes/app-router.test.tsx`
- Modify: `apps/web/src/routes/router.test.tsx`
- Delete: `apps/web/src/features/dashboard/components/workspace-shell.test.tsx`
- Delete: `apps/web/src/features/user/organization-switcher.test.tsx`
- Delete: `apps/web/src/features/user/user-header.test.tsx`

**Interfaces:**

- Produces:

```ts
export type NavigationItem = {
  title: string;
  to: "/" | "/members" | "/roles" | "/sessions" | "/audit-logs";
  icon: LucideIcon;
  permission?: PermissionKey;
};

export function getNavigationGroups(input: {
  isSuperAdmin: boolean;
  permissions: PermissionKey[];
}): NavigationGroup[];
```

- Produces: `AuthenticatedLayout({ session }: { session: WebSessionDependency }): JSX.Element` with `<Outlet />`.
- Consumes: existing `switchWebOrganization`, `logoutWebSession`, auth store and route guards.

- [ ] **Step 1: Replace the three obsolete shell tests with failing behavior tests**

Delete the old shell/user tests listed above. Add tests that assert:

```tsx
expect(getNavigationGroups({ permissions: ["members.read"], isSuperAdmin: false }))
  .toEqual([
    expect.objectContaining({ title: "概览" }),
    expect.objectContaining({
      title: "访问控制",
      items: [expect.objectContaining({ title: "成员", to: "/members" })],
    }),
  ]);
```

Also render the shell with a fake session and assert the current organization, current email, visible permitted links, sidebar trigger, theme trigger, and search trigger. The command test dispatches `keydown` with `metaKey: true, key: "k"`, asserts the dialog opens, and verifies forbidden routes are absent.

- [ ] **Step 2: Run the new tests and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/components/layout/navigation.test.ts src/components/layout/authenticated-layout.test.tsx src/components/command-menu.test.tsx`

Expected: FAIL because navigation and shell modules do not exist.

- [ ] **Step 3: Port the exact UI primitives needed by the shell**

Port from the fixed upstream commit: avatar, badge, collapsible, command, dialog, dropdown-menu, scroll-area, select, separator, sheet, sidebar. Keep LTR behavior only. Preserve `data-sidebar`, `data-state`, keyboard focus, and Sheet mobile behavior. Do not port ConfigDrawer, direction provider, font provider, app title variants, or layout customization modes.

- [ ] **Step 4: Implement navigation and search providers**

The navigation groups are exactly:

```ts
[
  { title: "概览", items: [{ title: "仪表盘", to: "/", icon: LayoutDashboard }] },
  {
    title: "访问控制",
    items: [
      { title: "成员", to: "/members", icon: Users, permission: "members.read" },
      { title: "角色", to: "/roles", icon: ShieldCheck, permission: "roles.read" },
    ],
  },
  {
    title: "安全",
    items: [
      { title: "会话", to: "/sessions", icon: MonitorSmartphone, permission: "sessions.read" },
      { title: "审计日志", to: "/audit-logs", icon: ScrollText, permission: "audit_logs.read" },
    ],
  },
]
```

`SearchProvider` owns `{ open, setOpen }`, registers one `keydown` listener, ignores editable targets, and removes the listener on unmount.

- [ ] **Step 5: Implement the shell against existing session services**

`TeamSwitcher` loads organizations once per current organization ID, includes the current organization if the list omits it, disables duplicate switches, calls `switchWebOrganization`, and shows `切换组织失败，请稍后重试。` without clearing the current organization. `NavUser` calls `logoutWebSession`; the store clears immediately as today, and failure shows `退出登录失败，请稍后重试。`.

The command menu renders only `getNavigationGroups()` results plus three theme commands. It uses TanStack Router navigation, closes before navigating, and contains no business-data provider interface.

- [ ] **Step 6: Nest protected routes under a pathless shell route**

In `router.tsx`, create `authenticatedRoute` with parent `rootRoute`, `id: "_authenticated"`, `beforeLoad: requireRouteAccess`, and `component: AuthenticatedRoutePage`. Make `/`, `/members`, `/roles`, `/sessions`, and `/audit-logs` children of it. Keep each permission-specific `beforeLoad`. Keep `/login`, `/forbidden`, and `/foundation` as root children. `AuthenticatedRoutePage` reads `session` from route context and renders `<AuthenticatedLayout session={session} />`.

- [ ] **Step 7: Run shell, router, session, and permission tests**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/components/layout src/components/command-menu.test.tsx src/routes/app-router.test.tsx src/routes/router.test.tsx src/routes/protected-route.test.tsx src/services/web-session.test.ts src/hooks/use-permission.test.ts
pnpm --filter @xpense/web check
```

Expected: all tests pass; existing redirect and RBAC assertions remain present.

- [ ] **Step 8: Request approval and commit the application shell**

```bash
git add apps/web/src/components apps/web/src/context apps/web/src/hooks/use-mobile.ts apps/web/src/routes
git commit -m "feat: 建立权限化后台布局"
```

### Task 3: Rebuild login with TanStack Form and the reversed split layout

**Files:**

- Create: `apps/web/src/features/auth/login-schema.ts`
- Create: `apps/web/src/features/auth/login-form.tsx`
- Create: `apps/web/src/features/auth/login-showcase.tsx`
- Create: `apps/web/src/features/auth/login-workflow.test.tsx`
- Modify: `apps/web/src/pages/login-page.tsx`
- Modify: `apps/web/src/pages/login-page.module.css`
- Delete: `apps/web/src/pages/login-page.test.tsx`

**Interfaces:**

- Produces:

```ts
export const loginSchema: z.ZodType<LoginFormValues>;
export type LoginFormValues = { email: string; password: string };
```

- Consumes: `loginWebSession`, `WebLoginError`, `getSafeRedirectPath`, and `LoginPageProps` behavior.

- [ ] **Step 1: Delete the obsolete test and write the new failing workflow test**

Cover three behaviors:

```tsx
it("shows Zod field errors without calling the API", async () => {
  const session = createLoginTestSession();
  render(<LoginPage session={session} />);
  await userEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(await screen.findByText("请输入邮箱地址")).toBeVisible();
  expect(screen.getByText("请输入密码")).toBeVisible();
  expect(session.authApi.login).not.toHaveBeenCalled();
});
```

Add invalid credentials and successful safe redirect tests. The success test enters an email with surrounding spaces and asserts the API receives the trimmed address.

- [ ] **Step 2: Run the workflow test and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/features/auth/login-workflow.test.tsx`

Expected: FAIL because the old form does not use the new schema and file structure.

- [ ] **Step 3: Implement the schema and TanStack Form**

```ts
export const loginSchema = z.object({
  email: z.string().trim().min(1, "请输入邮箱地址").email("请输入有效的邮箱地址"),
  password: z.string().min(1, "请输入密码"),
});
```

Create `useForm({ defaultValues, validators: { onSubmit: loginSchema }, onSubmit })`. Render shadcn Input and Label controls through `form.Field`; render the first touched field error below its control. Use `form.Subscribe` to disable the submit button when submitting. Map invalid credentials to `邮箱或密码不正确，请重试`, all other failures to `服务暂时不可用，请稍后重试`.

- [ ] **Step 4: Implement the responsive reversed split page**

Desktop uses `grid-template-columns: minmax(0, 1.15fr) minmax(26rem, 0.85fr)`: left showcase, right form. Below the large breakpoint, hide `LoginShowcase` and center a single-column form. Use semantic `<main>`, `<aside aria-label="产品预览">`, and `<section aria-labelledby="login-title">`. The left panel uses a local CSS dashboard composition; it must not fetch data or embed a remote image.

- [ ] **Step 5: Run login and auth boundary tests**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/features/auth/login-workflow.test.tsx src/services/web-session.test.ts src/routes/safe-redirect.test.ts src/routes/app-router.test.tsx
pnpm --filter @xpense/web check
```

Expected: all tests pass.

- [ ] **Step 6: Request approval and commit the login migration**

```bash
git add apps/web/src/features/auth apps/web/src/pages/login-page.tsx apps/web/src/pages/login-page.module.css apps/web/src/pages/login-page.test.tsx
git commit -m "feat: 重建后台登录体验"
```

### Task 4: Replace the financial dashboard with the translated upstream demo

**Files:**

- Create: `apps/web/src/features/dashboard/dashboard.tsx`
- Create: `apps/web/src/features/dashboard/dashboard.test.tsx`
- Create: `apps/web/src/features/dashboard/dashboard-data.ts`
- Create: `apps/web/src/features/dashboard/overview-chart.tsx`
- Create: `apps/web/src/features/dashboard/recent-sales.tsx`
- Create: `apps/web/src/features/dashboard/analytics.tsx`
- Modify: `apps/web/src/pages/dashboard-page.tsx`
- Delete: `apps/web/src/pages/dashboard-page.test.tsx`
- Delete: `apps/web/src/pages/dashboard-page.module.css`
- Delete: `apps/web/src/features/dashboard/components/dashboard-details.tsx`
- Delete: `apps/web/src/features/dashboard/components/dashboard-details.module.css`
- Delete: `apps/web/src/features/dashboard/components/module-tray.tsx`
- Delete: `apps/web/src/features/dashboard/components/module-tray.module.css`
- Delete: `apps/web/src/features/dashboard/components/trend-overview.tsx`
- Delete: `apps/web/src/features/dashboard/components/trend-overview.module.css`
- Delete: `apps/web/src/features/dashboard/components/workspace-shell.tsx`
- Delete: `apps/web/src/features/dashboard/components/workspace-shell.module.css`

**Interfaces:**

- Produces: `<Dashboard />` with no props and no service dependency.
- Produces immutable exported test data: `overviewData`, `recentSales`, `analyticsData`.

- [ ] **Step 1: Delete the old dashboard test and add the new failing test**

```tsx
it("renders translated fixed dashboard data and switches tabs", async () => {
  render(<Dashboard />);
  expect(screen.getByText("总收入")).toBeVisible();
  expect(screen.getByText("¥45,231.89")).toBeVisible();
  expect(screen.getByText("近期销售")).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "分析" }));
  expect(screen.getByRole("heading", { name: "访问趋势" })).toBeVisible();
});
```

Add an assertion that two renders expose identical chart data and that no Download, Reports, or Notifications control exists.

- [ ] **Step 2: Run the dashboard test and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/features/dashboard/dashboard.test.tsx`

Expected: FAIL because the new Dashboard module does not exist.

- [ ] **Step 3: Define fixed translated data**

Use these metrics and overview totals:

```ts
export const dashboardMetrics = [
  { label: "总收入", value: "¥45,231.89", change: "较上月 +20.1%" },
  { label: "订阅数", value: "+2,350", change: "较上月 +180.1%" },
  { label: "销售额", value: "¥12,234", change: "较上月 +19.0%" },
  { label: "当前活跃", value: "+573", change: "过去一小时 +201" },
] as const;

export const overviewData = [2400, 1398, 9800, 3908, 4800, 3800, 4300, 5200, 4100, 6100, 5400, 7200]
  .map((total, index) => ({ month: `${index + 1}月`, total }));
```

Define five recent sales with fixed Chinese names, distinct emails, and non-round RMB amounts. Define analytics data as fixed arrays in the same module.

- [ ] **Step 4: Port and translate the upstream dashboard composition**

Use Card, Tabs and Recharts. Preserve the upstream four-card grid and `lg:grid-cols-7` chart/list split. Replace inline SVGs with Lucide icons. Configure Recharts with `ResponsiveContainer`, accessible labels, no animation under reduced motion, and stable keys. `DashboardPage` becomes a thin wrapper returning `<Dashboard />`; session controls now live in the shell.

- [ ] **Step 5: Run dashboard, router, check, and build**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/features/dashboard/dashboard.test.tsx src/routes/router.test.tsx
pnpm --filter @xpense/web check
pnpm --filter @xpense/web build
```

Expected: all commands pass and the production bundle contains no random render warning.

- [ ] **Step 6: Request approval and commit the dashboard replacement**

```bash
git add apps/web/src/features/dashboard apps/web/src/pages/dashboard-page.tsx apps/web/src/pages/dashboard-page.test.tsx apps/web/src/pages/dashboard-page.module.css
git commit -m "feat: 替换后台仪表盘设计"
```

### Task 5: Rebuild members management and the member TanStack Form

**Files:**

- Create: `apps/web/src/features/members/member-form-schema.ts`
- Create: `apps/web/src/features/members/members-workflow.test.tsx`
- Modify: `apps/web/src/features/members/member-form-dialog.tsx`
- Modify: `apps/web/src/features/members/member-table.tsx`
- Modify: `apps/web/src/features/members/member-actions.tsx`
- Modify: `apps/web/src/features/members/members-page.tsx`
- Delete: `apps/web/src/features/members/members-page.test.tsx`

**Interfaces:**

- Produces:

```ts
export const memberFormSchema: z.ZodType<MemberFormValues>;
export type MemberFormValues = { userId: string; roleId: string };
```

- Preserves: `MemberFormDialogProps.onSubmit(input): Promise<void>` and existing `IamApi` calls.

- [ ] **Step 1: Delete the old page test and add failing workflow tests**

Cover load success, load failure, empty state, permission-hidden create action, UUID/role validation, successful create, API failure keeping the dialog open, role update, disable confirmation, and enable action. Example:

```tsx
await user.click(screen.getByRole("button", { name: "新增成员" }));
await user.type(screen.getByLabelText("用户 ID"), "not-a-uuid");
await user.click(screen.getByRole("button", { name: "添加成员" }));
expect(await screen.findByText("请输入有效的 UUID")).toBeVisible();
expect(api.addMember).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the workflow test and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/features/members/members-workflow.test.tsx`

Expected: FAIL against the removed old test structure and missing schema.

- [ ] **Step 3: Implement the member schema and dialog**

```ts
export const memberFormSchema = z.object({
  userId: z.string().trim().min(1, "请输入用户 ID").uuid("请输入有效的 UUID"),
  roleId: z.string().min(1, "请选择角色"),
});
```

Use TanStack Form `form.Field` for both controls and `form.Subscribe` for submit state. Use controlled shadcn Dialog. Only call `form.reset()` and close after `onSubmit` resolves. On rejection, display `添加成员失败，请稍后重试。` in `role="alert"` and preserve values.

- [ ] **Step 4: Rebuild the page, table, and destructive actions**

Use the shared header/page spacing from the shell, shadcn Table for data, Select for role changes, AlertDialog for disable, and Sonner success notifications. Do not move API calls out of `members-page.tsx`. Keep all existing permission checks and prevent unavailable actions from rendering.

- [ ] **Step 5: Run members, IAM service, permission, and type tests**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/features/members/members-workflow.test.tsx src/services/iam-api.test.ts src/hooks/use-permission.test.ts
pnpm --filter @xpense/web check
```

Expected: all tests pass.

- [ ] **Step 6: Request approval and commit members management**

```bash
git add apps/web/src/features/members
git commit -m "feat: 重建成员管理界面"
```

### Task 6: Rebuild roles management and permission editing with TanStack Form

**Files:**

- Create: `apps/web/src/features/roles/role-form-schema.ts`
- Create: `apps/web/src/features/roles/roles-workflow.test.tsx`
- Modify: `apps/web/src/features/roles/role-editor-dialog.tsx`
- Modify: `apps/web/src/features/roles/permission-matrix.tsx`
- Modify: `apps/web/src/features/roles/role-table.tsx`
- Modify: `apps/web/src/features/roles/roles-page.tsx`
- Delete: `apps/web/src/features/roles/permission-matrix.test.tsx`
- Delete: `apps/web/src/features/roles/roles-page.test.tsx`

**Interfaces:**

- Produces:

```ts
export type RoleFormValues = {
  key: string;
  name: string;
  description: string;
  permissionKeys: PermissionKey[];
};

export function toRoleSlug(value: string): string;
export function createRoleFormSchema(isEditing: boolean): z.ZodType<RoleFormValues>;
```

- Preserves: `RoleEditorInput`, protected-role edit restrictions and current `RolesPage` API behavior.

- [ ] **Step 1: Delete obsolete tests and add failing role workflow tests**

Cover create validation, slug normalization, permission selection, create failure preserving values, successful edit, protected role readonly behavior, permission-update boundary, and delete confirmation. Include:

```tsx
await user.type(screen.getByLabelText("角色标识"), "  Book Keeper  ");
await user.type(screen.getByLabelText("角色名称"), "记账员");
await user.click(screen.getByRole("checkbox", { name: /成员读取/ }));
await user.click(screen.getByRole("button", { name: "创建角色" }));
expect(api.createRole).toHaveBeenCalledWith(expect.objectContaining({
  key: "book-keeper",
  name: "记账员",
  permissionKeys: ["members.read"],
}));
```

- [ ] **Step 2: Run the role workflow test and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/features/roles/roles-workflow.test.tsx`

Expected: FAIL because the new schema and shadcn dialog do not exist.

- [ ] **Step 3: Implement schema, normalization, and form state**

`toRoleSlug` keeps the current lowercase ASCII slug behavior. The create schema requires a non-empty normalized key; the edit schema permits the readonly existing key. Both require trimmed name and normalize description. Bind permissionKeys as a TanStack Form field and update it immutably from PermissionMatrix.

- [ ] **Step 4: Rebuild role UI with shadcn components**

Use Dialog, Input, Checkbox, Table and AlertDialog. Render permission resources as fieldsets with visible labels. Protected roles keep key, name and permissions readonly according to existing flags. API failure renders `新增角色失败，请稍后重试。` or `更新角色失败，请稍后重试。` without closing.

- [ ] **Step 5: Run roles, shared types, IAM, and type tests**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/features/roles/roles-workflow.test.tsx src/services/iam-api.test.ts
pnpm --filter @xpense/web check
```

Expected: all tests pass and PermissionKey assignments remain type-safe.

- [ ] **Step 6: Request approval and commit role management**

```bash
git add apps/web/src/features/roles
git commit -m "feat: 重建角色权限界面"
```

### Task 7: Rebuild sessions, audit logs, forbidden, and foundation pages

**Files:**

- Create: `apps/web/src/features/sessions/sessions-workflow.test.tsx`
- Create: `apps/web/src/features/audit/audit-log-workflow.test.tsx`
- Modify: `apps/web/src/features/sessions/session-table.tsx`
- Modify: `apps/web/src/features/sessions/sessions-page.tsx`
- Modify: `apps/web/src/features/audit/audit-log-filters.tsx`
- Modify: `apps/web/src/features/audit/audit-log-table.tsx`
- Modify: `apps/web/src/features/audit/audit-logs-page.tsx`
- Modify: `apps/web/src/pages/forbidden-page.tsx`
- Modify: `apps/web/src/pages/forbidden-page.module.css`
- Modify: `apps/web/src/pages/foundation-page.tsx`
- Delete: `apps/web/src/features/sessions/sessions-page.test.tsx`
- Delete: `apps/web/src/features/audit/audit-logs-page.test.tsx`
- Delete: `apps/web/src/pages/forbidden-page.test.tsx`
- Delete: `apps/web/src/pages/foundation-page.test.tsx`

**Interfaces:**

- Preserves: `SessionsPageProps.onCurrentSessionRevoked`, `AuditLogSearch`, `onSearchChange(nextSearch)`, and current service contracts.
- Produces no new global state.

- [ ] **Step 1: Delete obsolete tests and add failing session workflow tests**

Test load, empty, failure, revoke permission visibility, revoke-other confirmation, and current-session revoke callback. Assert API failure leaves the row visible and shows an error.

- [ ] **Step 2: Add failing audit workflow tests**

Test no-permission state, load success, empty and failure states, field changes preserving other search values, clearing empty values, pagination, and page reset:

```tsx
await user.type(screen.getByLabelText("操作"), "member.updated");
expect(onSearchChange).toHaveBeenLastCalledWith(expect.objectContaining({
  action: "member.updated",
  page: undefined,
}));
```

- [ ] **Step 3: Run the two workflow suites and verify failure**

Run: `pnpm --filter @xpense/web exec vitest run src/features/sessions/sessions-workflow.test.tsx src/features/audit/audit-log-workflow.test.tsx`

Expected: FAIL after old UI tests are removed and before new shadcn views exist.

- [ ] **Step 4: Rebuild sessions and audit views**

Use shared Card/Table/Skeleton/AlertDialog/Button/Input components. Keep audit inputs controlled by `search`; do not instantiate TanStack Form. Keep the current session visually marked. Only the existing route callback clears auth and navigates after current-session revocation.

- [ ] **Step 5: Restyle forbidden and foundation without adding product navigation**

Forbidden uses a centered shadcn card with `返回仪表盘`; Foundation keeps its API smoke behavior, uses base tokens, and remains absent from navigation and command search. No replacement component tests are required because router and `foundation-api.test.ts` retain the meaningful boundary coverage.

- [ ] **Step 6: Run sessions, audit, route, and service tests**

Run:

```bash
pnpm --filter @xpense/web exec vitest run src/features/sessions/sessions-workflow.test.tsx src/features/audit/audit-log-workflow.test.tsx src/routes/app-router.test.tsx src/routes/router.test.tsx src/services/auth-api.test.ts src/services/iam-api.test.ts src/services/foundation-api.test.ts
pnpm --filter @xpense/web check
```

Expected: all tests pass.

- [ ] **Step 7: Request approval and commit the remaining page migrations**

```bash
git add apps/web/src/features/sessions apps/web/src/features/audit apps/web/src/pages/forbidden-page.tsx apps/web/src/pages/forbidden-page.module.css apps/web/src/pages/forbidden-page.test.tsx apps/web/src/pages/foundation-page.tsx apps/web/src/pages/foundation-page.test.tsx
git commit -m "feat: 统一安全与审计页面设计"
```

### Task 8: Remove the old design system, update rules, and complete verification

**Files:**

- Create: `apps/web/THIRD_PARTY_NOTICES.md`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/DESIGN.md`
- Modify: `apps/web/ARCHITECTURE.md`
- Modify: `apps/web/AGENTS.md`
- Delete: `apps/web/src/features/user/organization-switcher.tsx`
- Delete: `apps/web/src/features/user/organization-switcher.module.css`
- Delete: `apps/web/src/features/user/user-header.tsx`
- Delete: `apps/web/src/features/user/user-header.module.css`
- Delete: every unused legacy dashboard CSS Module confirmed by `rg`

**Interfaces:**

- Consumes all migrated UI and tests.
- Produces a Web package with zero HeroUI and Phosphor references.

- [ ] **Step 1: Prove the old design dependencies are unused**

Run:

```bash
rg -n "@heroui|@phosphor-icons|--xp-radius|--color-canvas|backdrop-filter" apps/web/src apps/web/package.json
rg -n "workspace-shell|dashboard-details|module-tray|trend-overview|features/user" apps/web/src
```

Expected: only legacy files scheduled for deletion or global token declarations remain. Stop and migrate any active reference before continuing.

- [ ] **Step 2: Delete legacy files and remove dependencies**

Delete the listed user and legacy CSS files. Remove `@heroui/react`, `@heroui/styles`, and `@phosphor-icons/react` from `apps/web/package.json`. Run `pnpm install` to update the lockfile. Remove old global glass tokens and fallback rules from `styles.css`.

- [ ] **Step 3: Write third-party attribution**

`apps/web/THIRD_PARTY_NOTICES.md` must state:

```md
# Third-party notices

Portions of the Xpense Web interface are adapted from shadcn-admin:
https://github.com/satnaing/shadcn-admin

Reference commit: e16c87f213a5ba5e45964e9b67c792105ec74d26
Copyright (c) satnaing
Licensed under the MIT License. The upstream MIT license text follows.
```

Append the complete upstream MIT license text from the fixed commit.

- [ ] **Step 4: Rewrite Web design and architecture rules**

`DESIGN.md` must define New York / Slate tokens, `0.625rem` radius, light/dark/system, compact density, semantic colors, Lucide, accessible states, responsive sidebar, and no dead controls. Remove all cold-fog, glass, Urbanist, Phosphor and fixed 16/24/32px radius rules.

`ARCHITECTURE.md` must name shadcn/ui as the primary UI strategy and TanStack Form + Zod as the submission-form strategy. `AGENTS.md` must remove HeroUI precedence and old radius hard rules while keeping Tailwind/CSS Modules, React 19 and service boundaries.

- [ ] **Step 5: Run the complete Web verification suite**

Run:

```bash
pnpm --filter @xpense/web test
pnpm --filter @xpense/web lint
pnpm --filter @xpense/web check
pnpm --filter @xpense/web build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 6: Run repository-level regression checks**

Run:

```bash
pnpm test
pnpm lint
pnpm check
```

Expected: every command exits 0. If an unrelated pre-existing failure occurs, record its exact command and output without weakening assertions.

- [ ] **Step 7: Run safety and dependency scans**

Run:

```bash
rg -n "console\.(log|warn|error)" apps/web/src
rg -n "@heroui|@phosphor-icons" apps/web pnpm-lock.yaml
rg -n "password\s*=|token\s*=|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" apps/web --glob '!*.test.*'
```

Expected: no new console calls, no HeroUI/Phosphor references, and no credential material.

- [ ] **Step 8: Perform the final manual acceptance pass**

Start `pnpm --filter @xpense/web dev` and verify at desktop and mobile widths:

- login is left showcase/right form on desktop and form-only on mobile;
- light, dark, and system themes persist;
- sidebar collapses on desktop and opens as a Sheet on mobile;
- navigation and `Cmd/Ctrl+K` omit unauthorized routes;
- dashboard tabs, charts, and fixed data render without dead controls;
- member, role, session, and audit workflows show loading, empty, success, error, and confirmation states;
- current-session revocation returns to login;
- keyboard focus is visible and no text overflows.

- [ ] **Step 9: Request approval and commit cleanup and documentation**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "refactor: 完成Web设计系统迁移"
```

## Final Review Gate

Before reporting completion, compare the implementation with every section of `docs/superpowers/specs/2026-08-03-shadcn-admin-web-design.md`. Report modified and deleted files, every verification command and result, remaining risks, dashboard mock-data status, login showcase follow-up, and whether any stable convention should be added beyond the already updated Web documents.

# apps/web/ARCHITECTURE.md

## 页面定位

WEB 端是个人记账系统的后台管理界面。
它优先服务高频录入、查询、筛选、统计和配置类操作。

界面应保持清晰、克制、信息密度合理，避免营销页式布局。

## 技术栈

- React 19
- TypeScript
- Vite 8
- TanStack Router
- TanStack Form + Zod（表单与校验）
- Zustand
- Tailwind CSS 4
- shadcn/ui（New York 风格，Slate 基底）与 Radix 原语
- lucide-react（图标）
- recharts（数据可视化）
- date-fns / react-day-picker（日期处理与日期选择器）

## 目录结构

- `src/routes`：TanStack Router 路由
- `src/pages`：页面级组件
- `src/features`：按业务功能组织的模块
- `src/components`：通用 UI 组件
- `src/components/ui`：shadcn/ui 组件
- `src/stores`：Zustand store
- `src/services`：API 请求与外部服务封装
- `src/hooks`：通用 React hooks
- `src/lib`：通用工具、配置和适配器
- `src/types`：WEB 端类型定义
- `src/test`：测试工具、mock 和 setup

## 路由与页面边界

- 路由定义放在 `src/routes`。
- 页面级数据边界应与路由保持一致。
- 路由参数和 search 参数必须有类型约束。
- 需要登录态的页面通过统一的路由守卫或布局入口处理。
- 不在普通组件中硬编码 URL 字符串，优先使用路由工具生成导航。
- 筛选条件应能从 URL search 参数恢复，便于分享和刷新。

## 状态管理边界

- Zustand 只管理跨页面、跨组件或需要持久化的客户端状态。
- 服务端数据、列表查询和详情数据不得默认塞进 Zustand。
- store 文件保持小而聚焦，按业务域拆分。
- store action 应表达业务意图，不暴露随意 set state 的接口。
- 持久化状态必须明确 key、版本和迁移策略。

## UI 组件策略

- shadcn/ui 是主要 UI 组件库，遵循 New York 风格与 `DESIGN.md` 规范。
- 组件基于 Radix 原语与 Tailwind CSS 4 Token，样式值统一读取 `src/styles/theme.css`。
- 表单统一使用 TanStack Form + Zod schema 校验。
- 图标统一使用 lucide-react，不引入其他图标库。
- TailwindCSS 用于布局、间距和定制样式；复杂组件局部样式确有必要时使用同目录 `*.module.css`。
- 不重复封装已有稳定组件，除非能统一业务语义或减少明显重复。
- 表格、筛选、表单、弹窗、日期范围、金额输入等高频控件应优先沉淀为可复用组件。

### 样式架构

- WEB 样式统一采用 Tailwind CSS 4 + 全局 CSS Variables（shadcn Token）。
- `src/styles.css` 只负责 Tailwind 与主题导入、Reset、基础元素规则和全局降级策略，
  不新增页面或业务组件专属类名。
- 简单、元素局部的布局、间距、尺寸、对齐和可访问性工具优先直接使用 Tailwind。
- 复杂网格、SVG、伪元素、组件状态和跨元素响应式联动确有必要时，
  可使用与组件同目录的 `*.module.css`；当前项目已无业务 CSS Module，新样式优先用 Tailwind 表达。
- CSS Module 类名使用 camelCase，并通过默认导入 `styles` 引用；主题值读取 CSS Variables。
- CSS Modules 使用现代 CSS nesting，不引入 Sass、Less 或 Stylus。
- CSS Module 中确需使用 Tailwind 指令时先通过 `@reference` 引用全局样式入口；
  `@apply` 只用于语义稳定、至少重复三次且能明显提升可读性的短组合。
- 不使用 `@apply` 包装复杂组件，不创建含义宽泛的全局业务样式或共享样式文件。

## 样式与体验

- 后台页面优先保证扫描、录入、筛选和批量操作效率。
- 不做营销式 hero、大面积装饰背景或低信息密度卡片堆叠。
- 页面文本不得遮挡、溢出或依赖视口宽度缩放。
- 颜色使用应服务状态表达：收入/成功、支出、警告、错误使用语义色，图表使用 chart Token。
- 移动端至少保证主要查询和录入流程可用。

## API 与数据展示

- API 请求统一放在 `src/services`。
- 组件不得直接拼接 fetch 请求细节。
- 错误处理、鉴权头、响应解析应统一封装。
- 请求失败时必须给用户可理解的反馈。
- 表单字段必须有明确校验规则和错误提示。
- 金额输入必须避免浮点精度问题。
- 日期、时区、货币和分类展示必须保持一致。
- 删除、批量操作和不可逆操作必须有确认反馈。

# Xpense Web Design System

## 1. 文档定位

本文件定义 WEB 后台界面的设计规范，是组件外观、布局与体验调整的唯一依据。
它以 shadcn/ui New York 风格与 Slate 色板为基础，服务于个人记账后台的高频查询、录入、筛选和配置场景。
实现与规范冲突时，先修正实现；规范需要演进时，先更新本文件再改代码。

## 2. 设计基调

- 信息密度高、扫描与录入效率优先，不做营销页式表达。
- 不使用冷雾色板、玻璃拟态、大面积渐变或装饰性背景。
- 每个可见控件都必须真实可用：没有行为的按钮、标签页和链接一律不渲染。
- 键盘可达与可见焦点是硬性要求，不因美观牺牲可访问性。

## 3. 主题与设计 Token

- 主题支持 light / dark / system（跟随系统），全部 Token 定义在 `src/styles/theme.css`。
- 基底采用 shadcn New York 风格与 Slate 色板（oklch）。
- 统一圆角 Token：基础半径 `--radius: 0.625rem`，组件按 shadcn 层级使用 radius-sm / md / lg / xl。
  不再使用 16px / 24px / 32px 等固定超大圆角规则。
- 语义色 Token：background、foreground、card、popover、primary、secondary、muted、accent、
  destructive、border、input、ring，以及 sidebar 系列和 chart-1..5。
- 数据可视化只使用 chart Token（`--chart-1..5`）或语义色，不直接引用旧的业务色名。
- 状态表达使用语义色：成功/收入、支出、警告、错误各自有明确 Token，不做含糊的混色。

## 4. 字体与排版

- 字体优先使用 `--font-inter` / `--font-manrope` Token，中文回退 PingFang SC、
  Microsoft YaHei、Noto Sans SC 与系统 sans-serif；不引入 Urbanist。
- 金额、统计与表格数字使用 `tabular-nums`，保证数字对齐。
- 字号层级：页面标题 text-2xl 加粗；卡片标题 text-sm / text-base 且 font-medium / font-semibold；
  正文 text-sm；辅助说明 text-xs 且 text-muted-foreground。
- 行高保持可读性，长文本不截断隐藏关键信息（表格单元格可 truncate + title）。

## 5. 布局

- 后台框架：桌面为可折叠侧栏 + 顶部栏 + 内容区；移动端侧栏收进 Sheet。
- 内容区统一留白节奏（p-4 / sm:p-6 / lg:p-8），卡片之间 gap-4。
- 登录页：桌面（lg 及以上）左侧产品展示、右侧表单，两栏按
  `minmax(0, 1.15fr) minmax(26rem, 0.85fr)` 划分；移动端只显示表单。
- 表格页统一为 筛选区 + 表格 + 分页；筛选条件可从 URL search 参数恢复。

## 6. 组件规范

- 组件基于 shadcn/ui（New York）与 Radix 原语，样式值统一读取 `theme.css` Token。
- 图标统一使用 lucide-react，不引入 Phosphor 等其他图标库。
- 高频控件优先复用 `src/components/ui` 与业务组件，不重复封装已有稳定组件。
- 日期输入必须使用日期选择器（输入框 + 日历弹层）：显示 `yyyy/MM/dd`，
  搜索参数保持 `yyyy-MM-dd`；键盘可输入，非法输入不生效，失焦还原。
- 表单统一 TanStack Form + Zod schema 校验，错误提示就近显示在字段下方。
- 表格、筛选、表单、弹窗、日期范围、金额输入等控件沉淀为可复用组件。

## 7. 状态与可访问性

- 页面与列表必须覆盖加载、空、成功、错误、确认五种状态，反馈文案可理解且不泄露敏感信息。
- 焦点可见：所有可交互元素使用 focus-visible ring（ring-ring/50 + border-ring）。
- 键盘导航：Tab 顺序符合阅读顺序，弹层/对话框支持 Esc 关闭；命令面板支持 Cmd/Ctrl+K。
- 对比度：正文至少 4.5:1；禁用控件 opacity-50 + cursor 默认，不承担唯一信息表达。
- 动效克制并尊重 `prefers-reduced-motion`。

## 8. 响应式

- 桌面（lg+）：完整侧栏、多列表格、图表并排。
- 平板（md）：侧栏折叠为图标；表格保持可用。
- 移动（<md）：侧栏为 Sheet；表格允许横向滚动或降级；输入控件 16px 字号防缩放。
- 页面文本不得遮挡、溢出或依赖视口宽度缩放。

## 9. 禁止模式

- 冷雾色板、玻璃拟态、Urbanist 字体、Phosphor 图标、16/24/32px 固定超大圆角。
- 营销式 hero、大面积装饰背景、低信息密度卡片堆叠。
- 无行为的死控件（下载/报表/通知等无动作按钮）。
- 未经确认引入新的第三方 UI 库或样式框架。

## 10. 页面设计检查清单

- 深色/浅色/跟随系统三种主题下均无对比度与溢出问题。
- 登录页桌面两栏、移动端单栏，表单可完成登录闭环。
- 侧栏桌面可折叠、移动端 Sheet 可用，导航按权限过滤。
- 仪表盘标签页、图表与固定数据可交互且无死控件。
- 成员、角色、会话、审计各流程覆盖加载/空/成功/错误/确认状态。
- 当前会话吊销后回到登录页；键盘焦点可见；文本无溢出。

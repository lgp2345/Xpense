# Dashboard Frosted Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Xpense Dashboard 从接近白色实体卡片的效果调整为冷雾青白、可感知透光的分层磨砂玻璃界面。

**Architecture:** 保留现有 React 组件与页面结构，在全局语义 Token 和 Dashboard CSS 中建立统一内容卡片玻璃、结构面板玻璃和控件玻璃。通过画布环境色、透明叠层、背景模糊和染色阴影形成材质，并提供关闭透明效果时的实色降级。

**Tech Stack:** React 19、Vite 8、Tailwind CSS 4、HeroUI 3、原生 CSS。

## Global Constraints

- 不修改路由、静态数据、文案、组件结构和交互语义。
- 主容器圆角固定为 32px，普通卡片固定为 24px，次级控件固定为 16px。
- 玻璃效果必须保持正文和金额可读，并提供 `prefers-reduced-transparency` 降级。
- 环境色只使用现有冷雾青、薄荷和冷蓝色板，不增加新品牌色。
- 基线提交为 `05ad228`，本轮效果改动在用户确认前不创建第二次提交。

---

### Task 1: 建立玻璃材质 Token 与环境透光层

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/dashboard/styles/dashboard-layout.css`

**Interfaces:**
- Consumes: 现有 `--color-canvas-*`、圆角和阴影 Token。
- Produces: `--glass-surface-*`、`--glass-shadow-*` 和 `--glass-filter-*`。

- [x] **Step 1:** 在 `:root` 增加浮层、面板、控件三种玻璃表面 Token。
- [x] **Step 2:** 在工作区背景加入低饱和薄荷与冷蓝径向环境色，使透明卡片背后存在可折射内容。
- [x] **Step 3:** 为浏览器不支持或用户减少透明效果的场景增加稳定实色表面。

### Task 2: 统一 Dashboard 卡片材质

**Files:**
- Modify: `apps/web/src/features/dashboard/styles/dashboard-components.css`
- Modify: `apps/web/src/features/dashboard/styles/dashboard-details.css`

**Interfaces:**
- Consumes: Task 1 的玻璃 Token。
- Produces: 顶部模块、主分析画布、图表浮层、资产栏和明细面板的一致玻璃层次。

- [x] **Step 1:** 将模块卡、添加块和预览卡调整为无边框浮层玻璃，使用单一冷白透明表面、背景模糊、饱和与内高光。
- [x] **Step 2:** 将主分析画布与明细面板统一为 `24%` 冷白、无边框、无顶部高光的内容卡片玻璃。
- [x] **Step 3:** 将筛选器、圆形菜单和资产栏调整为次级玻璃控件，保持文字对比和焦点状态。

### Task 3: 视觉验收与规范沉淀

**Files:**
- Modify: `apps/web/DESIGN.md`

**Interfaces:**
- Consumes: 浏览器中的实际计算样式、桌面端和移动端截图。
- Produces: 可复用的玻璃材质层级、参数边界、使用范围和降级规则。

- [x] **Step 1:** 在 1304px 桌面视口核对标记卡片的透光、边缘、高光与层次。
- [x] **Step 2:** 在 390px 移动视口验证无页面级横向溢出、无文字对比退化。
- [x] **Step 3:** 更新 `DESIGN.md` 的透明效果章节，记录三层玻璃规则和禁止项。
- [x] **Step 4:** 运行 `pnpm --filter @xpense/web test`、`lint`、`check`、`build` 和 `git diff --check`。

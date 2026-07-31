# apps/web/AGENTS.md

## 适用范围

本文件专用于个人记账系统的 WEB 后台页面。
这里的规则继承根目录 `AGENTS.md`，并补充 WEB 端专属约束。
WEB 端架构、技术栈、目录边界和页面定位详见同目录 `ARCHITECTURE.md`。

## WEB 实现规则

- 必须遵循同目录 `ARCHITECTURE.md` 的路由、状态管理、组件策略、API 和数据展示边界
- 必须使用新的 JSX Transform
- 禁止使用已废弃 API：`ReactDOM.render`、`ReactDOM.hydrate`、`findDOMNode`、string refs
- 函数组件默认值使用 ES 默认参数，不使用 `defaultProps`
- 使用 TypeScript 表达 props 类型，不使用 `propTypes`
- refs 使用 callback ref 或 `useRef`，避免隐式行为
- 测试优先使用 Testing Library，不使用 `react-test-renderer/shallow`
- 禁止无明确必要性地新增全局页面或业务组件样式；复杂组件样式必须使用同目录 `*.module.css`
- 简单布局、间距、尺寸和对齐优先使用 Tailwind；复杂视觉、组合选择器和响应式联动使用 CSS Modules
- CSS Module 中不得默认使用 `@apply`；仅当短工具类组合语义稳定、至少重复三次且能明显提升可读性时使用，并先通过 `@reference` 引入全局 Tailwind 上下文
- 未经架构方案确认，不得引入 Sass、Less、Stylus、CSS-in-JS 或新的样式框架

## React 技能规范

- 编写、评审或重构 React 组件、页面、hook、状态管理和数据请求代码时，必须使用 `$vercel-react-best-practices` 进行约束检查
- 项目 `AGENTS.md`、本文件和同目录 `ARCHITECTURE.md` 的既有架构边界优先于通用技能；当前项目是 React 19 + Vite SPA，不直接套用 Next.js、RSC、Server Actions、`next/dynamic` 或服务端缓存规则
- 异步操作应尽早启动、尽晚等待；互不依赖的请求使用 `Promise.all` 并行，存在依赖关系时只串行必要部分，避免组件树和路由加载形成请求瀑布
- API 请求仍统一放在 `src/services`；不得为了并行请求把鉴权、错误解析或 fetch 细节重新移入组件
- 默认直接从具体模块导入，避免为了便利新增大范围 barrel 导出；体积较大的可选功能按交互时机懒加载，但新增依赖或拆包方案仍须先确认
- 不使用 Effect 同步可在 render 阶段计算的派生状态；用户交互产生的逻辑优先放在事件处理器，Effect 只负责与 React 外部系统同步
- Effect 依赖优先使用稳定的原始值，并提供完整清理；全局事件监听必须去重，滚动和触摸监听在不调用 `preventDefault` 时使用 passive 选项
- 依赖旧状态更新时使用函数式 `setState`；高频且不影响渲染的瞬时值使用 ref，不把指针位置、滚动进度或动画帧写入 React state
- 非紧急且可能阻塞输入的界面更新使用 `startTransition` 或 `useTransition`；加载状态必须继续遵循本文件的可理解反馈要求
- 昂贵计算、稳定子树或已确认的重渲染热点才使用 `useMemo`、`useCallback` 或 `memo`；简单表达式和未经验证的组件不得机械添加记忆化
- 长列表和重型可选组件应评估 `content-visibility`、虚拟化或懒加载；采用哪种方案取决于真实数据规模，不提前引入复杂度
- 性能优化不得改变业务语义、可访问性或测试覆盖；交付时说明针对请求瀑布、包体积和重渲染所做的检查，以及未验证的性能风险

## UI 与交互硬规则

- 样式设计、视觉风格、布局和组件外观调整必须参考同目录 `DESIGN.md`
- 不做营销式 hero、大面积装饰背景或低信息密度卡片堆叠
- 遵循 `DESIGN.md` 的统一超大圆角 Token：主分析面板 `32px`，普通卡片 `24px`，输入框与次级控件 `16px`，胶囊控件 `9999px`，圆形图标按钮使用 `50%`；表格行、分隔区域等非容器元素不额外添加圆角
- 页面文本不得遮挡、溢出或依赖视口宽度缩放
- 移动端至少保证主要查询和录入流程可用
- 删除、批量操作和不可逆操作必须有确认反馈

## API 与安全

- 组件不得直接拼接 fetch 请求细节
- 请求失败时必须给用户可理解的反馈
- 不得在日志或错误提示中暴露敏感数据

## 测试要求

- 新增页面、store、service、hook 必须有对应测试
- 关键表单流程必须覆盖成功、失败和校验错误场景
- 路由参数和 search 参数解析需要测试
- 复杂金额、日期、分类统计逻辑必须有单元测试
- 组件测试优先验证用户行为，不验证实现细节

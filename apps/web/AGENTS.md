# apps/web/AGENTS.md

## 适用范围

本文件专用于个人记账系统的 WEB 后台页面。
这里的规则继承根目录 `AGENTS.md`，并补充 WEB 端专属约束。

## 技术栈

- React 19
- TypeScript
- Vite 8
- TanStack Router
- Zustand
- TailwindCSS
- HeroUI
- shadcn/ui

## 页面定位

WEB 端是个人记账系统的后台管理界面，优先服务高频录入、查询、筛选、统计和配置类操作。
界面应保持清晰、克制、信息密度合理，避免营销页式布局。

## 目录约定

推荐目录结构：

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

## React 19 规则

- 必须使用新的 JSX Transform
- 禁止使用已废弃 API：`ReactDOM.render`、`ReactDOM.hydrate`、`findDOMNode`、string refs
- 函数组件默认值使用 ES 默认参数，不使用 `defaultProps`
- 使用 TypeScript 表达 props 类型，不使用 `propTypes`
- refs 使用 callback ref 或 `useRef`，避免隐式行为
- 测试优先使用 Testing Library，不使用 `react-test-renderer/shallow`

## TanStack Router 规则

- 路由定义放在 `src/routes`
- 页面级数据边界应与路由保持一致
- 路由参数、search 参数必须有类型约束
- 需要登录态的页面必须通过统一的路由守卫或布局入口处理
- 不在普通组件中硬编码 URL 字符串，优先使用路由工具生成导航

## 状态管理

- Zustand 只管理跨页面、跨组件或需要持久化的客户端状态
- 服务端数据、列表查询和详情数据不得默认塞进 Zustand
- store 文件必须保持小而聚焦，按业务域拆分
- store action 应表达业务意图，不暴露随意 set state 的接口
- 持久化状态必须明确 key、版本和迁移策略

## UI 组件规则

- HeroUI 作为主要业务 UI 组件库
- shadcn/ui 作为补充，只在 HeroUI 不满足需求或需要更细粒度组合时使用
- TailwindCSS 用于布局、间距和少量定制样式
- 不重复封装已有稳定组件，除非能统一业务语义或减少明显重复
- 表格、筛选、表单、弹窗、日期范围、金额输入等高频控件应优先沉淀为可复用组件

## 样式与体验

- 后台页面优先保证扫描、录入、筛选和批量操作效率
- 不做营销式 hero、大面积装饰背景或低信息密度卡片堆叠
- 卡片圆角不超过 8px，除非组件库默认样式要求
- 页面文本不得遮挡、溢出或依赖视口宽度缩放
- 颜色使用应服务状态表达，如收入、支出、警告、成功、错误
- 移动端至少保证主要查询和录入流程可用

## 表单与数据

- 表单字段必须有明确校验规则和错误提示
- 金额输入必须避免浮点精度问题
- 日期、时区、货币和分类展示必须保持一致
- 筛选条件应能从 URL search 参数恢复，便于分享和刷新
- 删除、批量操作和不可逆操作必须有确认反馈

## API 访问

- API 请求统一放在 `src/services`
- 组件不得直接拼接 fetch 请求细节
- 错误处理、鉴权头、响应解析应统一封装
- 请求失败时必须给用户可理解的反馈
- 不得在日志或错误提示中暴露敏感数据

## 测试要求

- 新增页面、store、service、hook 必须有对应测试
- 关键表单流程必须覆盖成功、失败和校验错误场景
- 路由参数和 search 参数解析需要测试
- 复杂金额、日期、分类统计逻辑必须有单元测试
- 组件测试优先验证用户行为，不验证实现细节

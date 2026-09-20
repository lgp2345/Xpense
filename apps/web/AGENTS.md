# apps/web/AGENTS.md

## 范围与技能

- 本文件适用于 WEB 后台，继承根目录 `AGENTS.md`；遵守同目录 `ARCHITECTURE.md` 的路由、状态、组件、样式和 API 边界。
- 编写、评审或重构 React 组件、页面、hook、状态或请求代码时，使用 `$vercel-react-best-practices`；通用性能实践由技能提供。
- 项目采用 Vite SPA，不直接套用 Next.js、RSC、Server Actions 或服务端缓存规则；技术版本以架构文档及实际依赖为准。

## 实现约束

- 使用新的 JSX Transform、TypeScript props 和 ES 默认参数；不使用 `ReactDOM.render`、`ReactDOM.hydrate`、`findDOMNode`、string refs、`propTypes` 或函数组件 `defaultProps`。
- API 请求、鉴权和错误解析遵循架构文档的服务层边界，不因并行请求或性能优化移入组件。
- 默认从具体模块导入，不为便利新增大范围 barrel 导出；可选重型功能按交互时机懒加载。
- 新增依赖、修改构建配置或引入跨路由拆包方案须有明确授权；沿用现有方式的局部 `import()` 无需额外确认。
- 性能优化不得改变业务语义、可访问性或测试覆盖；按优化目标报告检查结果与未验证风险，不机械添加记忆化、虚拟化等复杂度。

## UI 与交互

- 外观、布局、组件库、图标、Token 和响应式规范统一遵守 `DESIGN.md`；样式组织遵循 `ARCHITECTURE.md`，不在本文件重复维护具体值。
- 新增 UI 库或样式框架须先确认；已有授权覆盖时直接执行。
- 面向最终用户的删除、批量和不可逆操作须有明确二次确认。
- 交互调整按 `DESIGN.md` 检查加载、空、成功、错误和确认状态，反馈可理解且不暴露敏感信息。
- 涉及响应式布局时验证桌面和移动端的主要查询、录入流程，检查文字溢出、控件可操作性及键盘可达性。

## 测试要求

- 新增或实质改变交互、状态或业务行为的页面、store、service、hook 须有对应测试；静态文案和样式按风险验证。
- 关键表单覆盖成功、失败和校验错误；路由参数与 search 参数解析、分类统计逻辑须有测试，金额和日期规则遵循根规范。
- 组件测试优先使用 Testing Library，验证用户行为而非实现细节，不使用 `react-test-renderer/shallow`。

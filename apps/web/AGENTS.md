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

## UI 与交互硬规则

- 样式设计、视觉风格、布局和组件外观调整必须参考同目录 `DESIGN.md`
- 不做营销式 hero、大面积装饰背景或低信息密度卡片堆叠
- 卡片圆角不超过 8px，除非组件库默认样式要求
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

# Xpense 子 Agent 配置

参考 [codex-team-mode](https://github.com/oil-oil/codex-team-mode) 的四个工作角色，配置仅作用于当前项目。角色文件由 Codex 自动发现，无需在配置中重复注册。

| 角色 | 模型 | 思考档位 | 速度档 | 职责 |
| --- | --- | --- | --- | --- |
| Explorer | gpt-6-luna | medium | fast | 只读定位大型代码库中的主要文件、入口与调用关系 |
| Executor | gpt-6-luna | xhigh | 继承主 Agent | 在明确且独占的写入范围内完成实施 |
| Reviewer | gpt-6.1-sol | high | 继承主 Agent | 从独立上下文评审稳定产物，仅在分配范围内保存审查报告 |
| ExpertAdvisor | 派发时选择，未指定则继承 | 派发时选择，未指定则继承 | 继承主 Agent | 复杂决策、建模、自动化或反复未解决的问题 |

主 Agent 负责拆解、集成和最终验收；最多同时打开 3 个子 Agent。简单任务直接处理，子 Agent 不再派发子 Agent。并行实施必须分配互不重叠的文件所有权，共享类型或接口由主 Agent 协调。

所有角色遵守根目录及目标目录的 AGENTS.md、ARCHITECTURE.md；角色配置不授予额外的安装、migration、Git 或外部操作权限。Reviewer 保留上游 workspace-write 配置用于保存获准的报告，不修改被审查产物。Explorer 的只读配置仍须结合父会话的实际权限核对。

## 使用

在当前项目中新建 Codex 任务后，可直接要求：

```text
请使用小队模式处理这项任务：按实际需要选择 Explorer、Executor、
Reviewer 或 ExpertAdvisor，明确每个子 Agent 的问题、交付结果和文件归属；
只派发有明确收益的部分，由主 Agent 统一验收。
```

派发时明确指定角色。Explorer、Reviewer、ExpertAdvisor 默认使用独立上下文；Executor 仅在确实依赖近期决策时继承少量对话。提示词可使用英语，面向用户的报告使用中文。

本次只配置工作角色与项目调度规则，未安装上游 team-mode 技能、诊断脚本或可选 default 哨兵；使用上述自然语言指令即可。项目没有覆盖 Codex 内置 default 角色。

## 加载与验证

- 角色未出现时，新建任务或重启 Codex。当前任务可能仍使用修改前加载的角色列表。
- 确认派发工具提供相应角色；角色不可用时由主 Agent 继续，不用通用子 Agent 冒充配置角色。
- 首次实际派发时核对运行记录中的角色、模型、思考档位和速度档；文件解析成功不代表运行时已生效。
- 角色文件中固定的模型和思考档位优先于派发参数。需要按次选模时使用 ExpertAdvisor。
- Explorer 按上游请求 Fast；实际生效取决于模型和宿主支持，可用时额度消耗为 Standard 的 2.5 倍。

配置格式与运行行为参见 [Codex 官方子 Agent 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)；上游配置参见 [角色说明](https://github.com/oil-oil/codex-team-mode/blob/main/skills/team-mode/references/custom-agents.md)。

# 租赁月度收费事项实施验收

验收日期：2026-10-03；分支：`feature/rental-billing`；实施基线：`2e6a472671cc6893ce4c3aeef32405aa931930e2`。

## 实施结果

- 合同创建与草稿在同一服务端事务中保存收费标准及可选入住底数，并独立检查财务、计量权限。
- 水、电分别代收；不代收单价归零，不参与新月度账单。真实底数 0 有效，空底数允许创建，但启用计量项目资料不齐时不能正式出账。
- 新固定月费不足月仍全额；租金保留原折算。历史无计算模式的快照仍按原逐日规则结算，手动金额按快照维护。
- 合同标准只影响尚未生成的账单；单张账单可设置费用最终金额、设为零或删除。不依赖当前合同费项，不传播到其他账单。
- 未收款编辑在事务内检查有效收款事实及版本；已收款/部分收款走更正，保留真实现金记录，可退金额需另行登记退款。关联结算账单继续展示原结算差额语义。
- 无抄表变化的费用调整保留原读数链；组织切换、版本冲突、重复点击、未知网络结果重试均有相应测试。

## 实际验证

任务 8 首次全量测试退出码 0：Shared 38/38、Server 1443 通过及 15 跳过、Web 854/854；合计 2335 通过、15 跳过。最终评审修复后为 **2342 通过、15 跳过**，见下方修复记录。

- 隔离交付副本：从任务 7 的已提交 HEAD 导出，叠加任务 8 的明确文件清单；排除并行登录页面及其主题/资源改动。沿用现有依赖，没有安装依赖或修改 lockfile。测试不连接真实外部服务。
- 三个子项目 `check`、`build`：6 个任务全部通过。
- Shared、Server `lint`：通过。Web 全量 lint 失败，19 个已有错误、1 个警告、2 个提示，涉及 layout、multi-select、sidebar、search-provider 和原合同页格式；原基线亦存在同类诊断。保留原有单引号大文件风格，不为本计划清理无关诊断。任务 7 的 14 个专属文件，以及任务 8 除两个原有格式问题文件之外的 15 个文件定向检查通过。
- 最初全量测试中无关 property-detail 测试曾超过默认 5 秒；该文件定向重跑 32/32 通过。当前工作区全量检查还曾被并行登录页面的暂缺 CSS 与临时页面内容阻挡，均未修改、回滚或提交这些改动。隔离副本结果不能证明未提交登录改版组合通过。
- 关键 HTTP 流程测试包含：新建合同→缺底数阻止出账→补真实零底数→月中入住租金折算、固定费全额→新标准仅影响后续账单→本期设金额/归零/删除→收款后更正产生精确可退差额。相关 7 个 HTTP harness 测试文件 65/65 通过；harness 合同编号改为实际创建编号，先观测失败再修复。
- 任务 7 末轮 Server 54/54、Web 39/39、两端 check 通过；关联结算退款提示与无计量账单入口两个边界先观测失败再修复。
- `git diff --check`：交付前执行，未发现空白错误。

## 浏览器与视觉验收

应用 design-taste-frontend 的现状审查、间距/分组、一致性、可访问性和响应式检查；遵守项目现有 Slate Token、字体、图标、shadcn/ui 和紧凑后台表单。营销 Hero、装饰图、品牌改版、复杂动效不适用于本次后台表单。

- 使用实际收费表单、月度预览、账单修订组件及模拟 API，未向真实合同写入。
- 390、706、1280px × 浅色/深色：6 组收费录入/缺项预览，12 组未收款/已收款修订。检查横向溢出、长名称、金额对齐、键盘 Tab、Esc、动态添加、删除确认/取消、成功与空资料状态；已人工查看关键截图。
- 另外检查加载、读取失败、底数独立显示、读取重试、保存未知结果复用原请求重试 5 种状态，全部通过。
- 缺水底数/抄表时显示中文提示并禁用确认；禁用电费不显示电表必填。支付后由 50 元更正为 30 元，显示可退 20 元及不自动退款说明。
- 这是组件浏览器验收，未声称完成真实登录路由全流程或数据库浏览器写入。

## Schema / migration 与未验证项

新增 `waterCollectionEnabled`、`electricityCollectionEnabled` 的 schema、共享必填类型与兼容 DTO；迁移目录 `apps/server/src/db/migrations/20261002133352_rental_charge_collection/` 包含 SQL 和快照，两个数据库列默认 true、非空，保留既有合同代收行为。任务 8 仅整理生成快照格式，解析后的 JSON 与任务 7 HEAD 相同。

迁移仅生成并提交，没有执行。当前没有隔离测试库 DDL 授权与所需配置，15 个数据库相关测试跳过，不计为通过。上线前仍需在获授权的隔离库验证全迁移回放、旧迁移兼容、默认值、外键与历史快照；开发/生产库迁移执行仍需另行授权。

没有推送、创建 PR、修改公共规范或新增依赖。原有大合同页/草稿 hook/服务保留完整职责；新修订规则约 332 行，财务快照修订是连贯流程，本次保留以免用大量参数切碎流程，后续值得按职责继续观察。

## 任务 1—7 提交

- `5e840a9` feat: 扩展合同收费与账单调整数据契约
- `8f4b06a` feat: 原子保存合同收费标准与入住底数
- `4c304e9` feat: 按水电代收设置校验月度出账
- `741a7be` fix: 固定月费不足月按全额收取
- `eb77f61` feat: 完善合同收费录入与复核界面
- `f2f1260` feat: 完善收费详情与月度出账交互
- `6cb9fb8` feat: 支持本期费用编辑与已收款账单更正

任务 8：`ca93f0764137aebe9e3a3208e62a03c7af7a52fc`，`test: 完成租赁月度收费流程验收`。最终评审修复另有一个本地提交，SHA 在最终交付中提供。

## 最终独立评审及修复

独立 Reviewer 实际采用 `gpt-6.1-sol / high`，严格评审本任务 8 个提交，独立定向执行 218 项测试通过。结果为无 Critical、2 项 Important、1 项 Minor；主线程按实际影响维持分级，并执行一次修复，不派第二轮评审。

- I1：表单回传未改变的另一表计底数，已有账单时阻断首次补录。修复为仅发送新增或实际改变的代收底数，按精确十进制文本规范化判断等值，不用浮点转换；无变化不能提交。两个补录方向均验证真实零，原请求未知结果重试和卸载后迟到结果处理保留。
- I2：两个表单把所有 409 误报成版本变化。改为展示项目 API 层规范化的实际业务冲突原因，保留“需读数更正”及“暂停/恢复需交接边界”的指引，失败后清除原尝试。分别覆盖业务限制和真正版本冲突。
- 复现测试先观测 8 个失败，然后同一组 19/19 通过；没有削弱服务端已使用底数限制，没有变更代收暂停/恢复业务，也没有改写金额、现金或读数链。
- 修复后全量测试：Shared 38、Server 1443 通过及 15 跳过、Web 861，共 **2342 通过、15 跳过**；三端 check/build 6 个任务通过，修复 4 文件定向 lint 与 diff 空白检查通过。
- M1 递延：草稿空间底数清理，以及“收费已写后读数失败”“底数已写后审计失败”缺少完整聚合回滚测试。源码核对确认共用外层事务，现有异常传播测试不等于这几种分阶段写失败都已独立实证；未发现实际部分提交缺陷，仍是值得补齐的覆盖热点。
- 前述浏览器 QA 为修复前的组件视觉/状态检查；修复后新增变化由组件复现测试和全量检查验证，未声称重新完成真实登录至数据库的浏览器整链。

## 执行判断记录

- Ruling: 沿用当前功能分支，不新建 worktree — 用户明确选择 — 误判成本：改动在现有分支，可逐提交回溯。
- Ruling: 计划“本轮只修订计划”属于编写阶段记录，本轮执行实施任务 — 当前用户请求明确要求完成计划 — 误判成本：本地可逆改动。
- Task 2: Ruling: Zod 4 refined schema 不能 omit，修订预览改为对未 refine 基础对象 omit 后复用校验 — E2E 暴露启动错误，已查 ctx7 — 误判成本：预览与确认交叉校验失配，DTO/E2E 覆盖。
- Task 2: Ruling: 草稿更换空间的底数清理先删除未使用底数修订，再删除底数 — 保持现有外键，不把旧底数转接新空间 — 误判成本：草稿底数修改历史只保留合同审计；正式读数不允许清理。
- Ruling: 后续实施按用户最新要求派发 gpt-6.1-sol/ultra 子Agent，主线程负责集成验证 — 用户指定执行配置覆盖 inline 不委派指引；使用可选模型的 ExpertAdvisor 处理财务调整，不冒充固定模型 Executor — 误判成本：多一个独立上下文及集成开销。
- Ruling: 最终评审使用 gpt-6.1-sol/ultra 的独立 ExpertAdvisor 按评审模板核对财务实现 — 固定 Reviewer 档位为high，用户最新指定ultra；以独立专家审查承担实际咨询职责，不声称切换配置角色 — 误判成本：区别于已配置Reviewer的角色约束，需要主线程严格限制只读。
- Ruling: 并行登录页改动不纳入提交，额外建立基线加本次文件的隔离验收快照 — 当前整库测试/build曾因范围外CSS暂缺失败，保持其他工作不回滚 — 误判成本：隔离结果不覆盖未提交的登录页组合；当前工作区失败另行保留记录。
- Ruling: 保留本计划临时记录，不删除workspace — 项目删除文件需明确授权，当前仅授权实施和提交 — 误判成本：留有可清理的忽略文件。
- Ruling: 后续 Agent 改为 gpt-6.1-sol/high，最终采用已匹配的独立 Reviewer — 用户最新要求覆盖此前 ultra；主线程宿主档位不可由工具修改 — 误判成本：前序已完成工作仍按当时配置执行。
- Final: Ruling: 未提交登录改版/主题/public组合行为不纳入评审 — 本次仅修改租赁功能，保持其他工作 — 误判成本：未验证并行登录组合。
- Final: Ruling: 已计费表计暂停恢复与交接链留待后续设计 — 当前禁止切换且提示实际限制，符合计划 — 误判成本：暂不支持该业务。
- Final: Ruling: 真实PostgreSQL迁移执行/并发/生产升级未实测 — 无DDL授权及配置，仅静态核对和跳过 — 误判成本：数据库行为上线前仍需验证。
- Final: Ruling: 真实登录路由至真实库的浏览器整链未验证 — 本次以模拟API组件QA和HTTP harness验证，不冒充整链实证 — 误判成本：真实路由和数据库组合仍有验证缺口。
- Ruling: 收尾保留当前功能分支与本地提交，不再询问合并/推送菜单 — 用户授权边界已经明确为当前分支本地实施及提交 — 误判成本：分支仍待后续集成。

## 修改文件

- `apps/server/src/db/migrations/20261002133352_rental_charge_collection/migration.sql`
- `apps/server/src/db/migrations/20261002133352_rental_charge_collection/snapshot.json`
- `apps/server/src/db/rental-charge-items-migration.integration.test.ts`
- `apps/server/src/db/schema/rental-charges.ts`
- `apps/server/src/modules/rental/bill-revisions.repository.test.ts`
- `apps/server/src/modules/rental/bill-revisions.repository.ts`
- `apps/server/src/modules/rental/bill-revisions.service.test.ts`
- `apps/server/src/modules/rental/bill-revisions.service.ts`
- `apps/server/src/modules/rental/charge-terms.repository.test.ts`
- `apps/server/src/modules/rental/charge-terms.repository.ts`
- `apps/server/src/modules/rental/charge-terms.repository.types.ts`
- `apps/server/src/modules/rental/charge-terms.service.test.ts`
- `apps/server/src/modules/rental/charge-terms.service.ts`
- `apps/server/src/modules/rental/contract-charge-setup.service.test.ts`
- `apps/server/src/modules/rental/contract-charge-setup.service.ts`
- `apps/server/src/modules/rental/contract-lifecycle.service.ts`
- `apps/server/src/modules/rental/contracts.service.test.ts`
- `apps/server/src/modules/rental/contracts.service.ts`
- `apps/server/src/modules/rental/dto/contract-charge-setup.dto.ts`
- `apps/server/src/modules/rental/dto/create-contract.dto.ts`
- `apps/server/src/modules/rental/dto/rental-calendar-date.schema.ts`
- `apps/server/src/modules/rental/dto/rental-charges.dto.ts`
- `apps/server/src/modules/rental/dto/rental-finance.dto.test.ts`
- `apps/server/src/modules/rental/dto/rental-meters.dto.ts`
- `apps/server/src/modules/rental/dto/rental-monthly-bills.dto.ts`
- `apps/server/src/modules/rental/meter-correction.rules.test.ts`
- `apps/server/src/modules/rental/meter-correction.rules.ts`
- `apps/server/src/modules/rental/meter-readings.repository.ts`
- `apps/server/src/modules/rental/meter-readings.service.test.ts`
- `apps/server/src/modules/rental/meter-readings.service.ts`
- `apps/server/src/modules/rental/monthly-bill-plan.rules.test.ts`
- `apps/server/src/modules/rental/monthly-bill-plan.rules.ts`
- `apps/server/src/modules/rental/monthly-bills.controller.test.ts`
- `apps/server/src/modules/rental/monthly-bills.controller.ts`
- `apps/server/src/modules/rental/monthly-charge.rules.test.ts`
- `apps/server/src/modules/rental/monthly-charge.rules.ts`
- `apps/server/src/modules/rental/rental-bill-revisions.e2e.test.ts`
- `apps/server/src/modules/rental/rental-finance-source.service.ts`
- `apps/server/src/modules/rental/rental-monthly-charge-items.e2e.test.ts`
- `apps/server/src/modules/rental/rental-settlement-readings.rules.test.ts`
- `apps/server/src/modules/rental/rental-settlement-readings.rules.ts`
- `apps/server/src/modules/rental/rental-settlement.rules.test.ts`
- `apps/server/src/modules/rental/rental-settlement.rules.ts`
- `apps/server/src/modules/rental/rental-settlements.service.test.ts`
- `apps/server/src/modules/rental/rental-settlements.service.ts`
- `apps/server/src/modules/rental/rental.module.ts`
- `apps/server/src/test/rental-finance-fixtures.ts`
- `apps/server/src/test/rental-finance-http-harness.ts`
- `apps/server/src/test/rental-postgres-corpus.test.ts`
- `apps/server/src/test/rental-postgres-corpus.ts`
- `apps/server/src/test/rental-postgres-harness.ts`
- `apps/web/src/features/rental/bills/bill-detail-page.test.tsx`
- `apps/web/src/features/rental/bills/bill-detail-page.tsx`
- `apps/web/src/features/rental/bills/bill-revision-charge-fields.tsx`
- `apps/web/src/features/rental/bills/bill-revision-dialog.test.tsx`
- `apps/web/src/features/rental/bills/bill-revision-dialog.tsx`
- `apps/web/src/features/rental/bills/bill-revision-form.test.ts`
- `apps/web/src/features/rental/bills/bill-revision-form.ts`
- `apps/web/src/features/rental/bills/bill-test-fixtures.ts`
- `apps/web/src/features/rental/bills/meter-reading-fields.tsx`
- `apps/web/src/features/rental/bills/monthly-bill-dialog.test.tsx`
- `apps/web/src/features/rental/bills/monthly-bill-dialog.tsx`
- `apps/web/src/features/rental/bills/monthly-bill-form.test.ts`
- `apps/web/src/features/rental/bills/monthly-bill-form.ts`
- `apps/web/src/features/rental/bills/monthly-missing-fields.ts`
- `apps/web/src/features/rental/charges/contract-charge-fields.test.tsx`
- `apps/web/src/features/rental/charges/contract-charge-fields.tsx`
- `apps/web/src/features/rental/charges/contract-charge-form.test.ts`
- `apps/web/src/features/rental/charges/contract-charge-form.ts`
- `apps/web/src/features/rental/charges/contract-charges-form.test.tsx`
- `apps/web/src/features/rental/charges/contract-charges-form.tsx`
- `apps/web/src/features/rental/charges/contract-charges-section.test.tsx`
- `apps/web/src/features/rental/charges/contract-charges-section.tsx`
- `apps/web/src/features/rental/charges/meter-baseline-form.test.tsx`
- `apps/web/src/features/rental/charges/meter-baseline-form.tsx`
- `apps/web/src/features/rental/contracts/contract-form-page.test.tsx`
- `apps/web/src/features/rental/contracts/contract-form-page.tsx`
- `apps/web/src/features/rental/contracts/contract-form-schema.test.ts`
- `apps/web/src/features/rental/contracts/contract-form-schema.ts`
- `apps/web/src/features/rental/contracts/steps/contract-local-review-step.tsx`
- `apps/web/src/features/rental/contracts/steps/contract-review-step.tsx`
- `apps/web/src/features/rental/contracts/steps/contract-terms-step.tsx`
- `apps/web/src/features/rental/contracts/use-contract-draft.ts`
- `apps/web/src/features/rental/settlements/settlement-editor.tsx`
- `apps/web/src/features/rental/settlements/settlement-page.test.tsx`
- `apps/web/src/features/rental/settlements/settlement-preview.tsx`
- `apps/web/src/routes/_authenticated/(rental)/rentals/contracts/new.tsx`
- `packages/shared/src/rental-bills.ts`
- `packages/shared/src/rental-charges.test.ts`
- `packages/shared/src/rental-charges.ts`
- `packages/shared/src/rental-contracts.ts`
- `packages/shared/src/rental-monthly-bills.ts`
- `docs/superpowers/reports/2026-10-02-rental-monthly-charge-items-verification.md`

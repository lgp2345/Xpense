# 租赁月度收费、收款与退租结算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after the user reviews the plan and selects the execution method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 房东按月确认含租金、水电、固定费用及正负额外费用的综合账单，登记实际收退款，并在退租或起租前取消时完成合同级多退少补。

**Architecture:** 在现有 RentalModule 中复用租金规则、组织锁、权限和事务入口，增加收费标准、读数、账单修订、资金事实及结算边界。账单身份稳定，资金记录只追加或撤销；结算以最终费用减真实净收款计算。前端沿用现有 API 服务层、组织隔离查询、路由 descriptor 和后台设计系统。

**Tech Stack:** 仓库现有 NestJS 12、Fastify、Drizzle ORM 1.0.0-rc.4／Kit 1.0.0-rc.3、PostgreSQL、Zod 4、React 19、TanStack Router／Form／Query、Vitest 4、pnpm 10.30.2、Turborepo 2；不升级或安装依赖。

**Spec:** `docs/superpowers/specs/2026-09-28-rental-monthly-billing-settlement-design.md`。实施前必须与本计划一起阅读；上一阶段规范只用于兼容旧数据和复用既有规则。

**Status:** 实施完成，Task 10 已独立提交 `679ffec`（`test: 补齐租赁收费与结算回归验证`，20 路径，未推送）。用户选择“按 Task 小队实施与评审”，沿用 `feature/rental-billing` 工作区，并于 2026-09-30 明确要求每个 Task 的改动分别 commit。Task 1—9 已独立提交（`28e5530`、`9a1935d`、`af36b66`、`50fc5bc`、`75a0241`、`df298d2`、`c58c50f`、`07e3def`、`a5db6cc`）；Task 10 的真实 PostgreSQL 演练、完整回归、页面与权限门禁、增量独立复核及独立提交均已完成。逐 Task 提交、不推送。执行记录见文末。

## Global Constraints

- 本轮一份合同对应一个空间，不实现多空间费用分摊，不删除既有通用空间关系。
- 按月手动生成正式综合账单；保留租金计划预览，不提前生成全租期正式综合账单。
- 合同起始日／自然月租金锚点和 1／3／6／12 月付款继续有效；租金行不可手改，付款账期按开始日所属月份入单。
- 单价取生成时合同当前值；允许本期非租金覆盖并填原因，历史账单保留自己的价格快照。
- 固定月费不足月按实际天数／当月天数折算；实际退租当天计费。水电按实际抄表区间，不强拆自然月。
- 正数额外费用加收、负数减免，每项有名称、金额、备注；账单应收合计允许零，不允许负值。
- 金额结果为安全整数最小单位，计算用 BigInt／十进制定点整数；不使用浮点金额。API 日期 `YYYY-MM-DD`，月份 `YYYY-MM`，日期展示遵守现有 DatePicker 规则。
- 综合账单收款可多次、部分，但不超过未收；押金每项单独出账，一次全额确认，不支持部分收款。
- 退款按钮每次确认当前全部应退金额；后续更正产生新差额允许再次退款。收退款撤销必须原因并留历史，不代表真实反向转账。
- 收款不分配到费用项，不创建跨账单自由分配或未分配余额，不改变账户、流水或核心交易。
- 结算涵盖整份合同；资金未清不阻止按日期释放空间。确认结算后，新增收退款只能走结算单。
- 不做历史实收导入、旧合同接管、旧合同退租兼容、共用水电、换表、阶梯计价、自动化或支付通道。
- 无新增依赖，无 lockfile 改动，无未经授权的 migration 执行／seed，无无关格式化或文件删除／移动。
- 新业务文件原则上不超过 300 行；复用既有基础组件，不为行数制造透传抽象。服务端用结构化 logger，禁止 console 输出。
- 服务端实现遵循 `nestjs-best-practices`；React 代码遵循 `vercel-react-best-practices`。样式设计必须实际使用 `design-taste-frontend`，项目 DESIGN.md 优先，不安装技能默认建议的额外库。
- 每个 Task 完成后独立中文 Commit，格式为项目类型前缀＋中文主题；失败、缺必需验证时不能标记完成。

## Review Focus

1. 退款按钮出现后另一人更正费用，确认必须返回版本冲突；网络重试已成功退款则返回原记录，不能再次退钱（Task 5、8）。
2. 更正历史读数时两侧可能采用不同单价，其中一张已收且已纳入结算；只能按各自快照修正，整体原子更新并保留真实资金（Task 2、6、7）。
3. 租金季付且某月未出账，退租时不能遗漏未生成义务，不能重复收已覆盖租金、水电或把押金应收算入费用（Task 2、7）。
4. 切换组织后旧预览、迟到请求或对话框重试不得写到新组织；确认结算后旧账单页面不能继续收款（Task 4、5、8、9）。
5. 存量账单没有收款证据，不能在升级后显示欠款；未来终止不能提前退钱，取消及账单作废不能抹掉实收（Task 3、7、9、10）。

## 0. 仓库落点与执行前检查

代码图的 SHA 落后于 HEAD，本计划已核对实际 schema、service、页面、测试和 scripts。执行开始时重新检查工作区及目标目录规范；图用于缩小范围，不代替源码。所有路径相对仓库根，命令也从根运行。

现有热点：`contract-lifecycle.service.ts`、`contracts.service.ts`、`bills.queries.ts`、`rental-billing.ts`。只增加必要分流和映射，新业务放入下表职责文件。旧规则 `buildRentPlan`、`calculateTerminationReference`、日期函数和账单编号分配继续复用。

| 文件／目录 | 用途与负责 Task |
| --- | --- |
| `packages/shared/src/rental-charges.ts`、`rental-monthly-bills.ts`、`rental-cash.ts`、`rental-settlements.ts` | 新业务契约及稳定枚举，Task 1 |
| `apps/server/src/modules/rental/rental-finance.types.ts` | 服务端计算、来源和事务输入类型，Task 2 |
| 同目录 `rental-decimal.rules.ts`、`monthly-charge.rules.ts`、`meter-correction.rules.ts`、`rental-balance.rules.ts`、`rental-settlement.rules.ts` | 纯规则，Task 2 |
| `apps/server/src/db/schema/rental-charges.ts`、`rental-cash.ts`、`rental-settlements.ts` | 新表，Task 3；扩展既有 `rental-billing.ts`、`rental-tenancy.ts` |
| `apps/server/src/modules/rental/charge-terms.repository.ts`、`meter-readings.repository.ts`、`bill-revisions.repository.ts`、`rental-cash.repository.ts`、`rental-settlements.repository.ts`、`finance-requests.repository.ts` | 无独立事务的持久化，Task 3 |
| 同目录 `rental-finance-source.service.ts`、`charge-terms.service.ts`、`meter-readings.service.ts`、`monthly-bills.service.ts` | 一致来源、默认收费、底数和月度出账，Task 4 |
| 同目录 `rental-cash.service.ts`、`settlement-projection.service.ts` | 资金动作、账单余额与既有结算投影重算，Task 5 |
| 同目录 `bill-revisions.service.ts` | 费用、读数及相邻账单原子更正，Task 6 |
| 同目录 `rental-settlements.service.ts`、`monthly-billing-lifecycle.service.ts` | 结算编排及合同动作联动，Task 7 |
| `apps/web/src/features/rental/charges/`、`bills/`、`settlements/` | 收费与底数、出账与资金、结算页面，Task 8、9 |
| `apps/web/src/services/rental-finance-api.ts`、`rental-finance-query.ts` | 新接口与组织隔离查询，Task 8、9 |

### 0.1 当前脚本与文档核对

- server／web 的 `test` 是 `vitest run`；shared 是 `vitest run src`，因此 shared 验证运行全包，避免附加文件后误以为只执行目标测试。
- `turbo.json` 的 test／check／lint 依赖 `^build`；通过 `pnpm exec turbo run test --filter=@xpense/server --force -- <文件>` 运行目标测试，不另建测试框架。
- 已通过 Context7 查询 [Turborepo CLI](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/cli/RULE.md)、[Drizzle 迁移文档](https://orm.drizzle.team/docs/drizzle-kit-generate)、[Query key 变量](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-keys.md)。生成 SQL 不等于执行迁移；查询键必须包含组织及所依赖的资源标识。实际实施第三方 API 时继续按项目要求查询 ctx7，不因本计划而跳过版本核对。
- 当前租赁金额输入与 `bill-format.ts` 使用每主币单位 100 个最小单位；本阶段沿用，不扩大为多币种小数位治理。水电单价对外定义为“主币单位／吨或度”，乘用量后转为整数最小单位。
- `docs/` 被忽略。新的计划和设计需显式检查内容；用户授权提交任务时，只对本任务具体文档使用 `git add -f`，不更改 `.gitignore`。

后文缩写对应的完整验证命令如下；“重跑 controller 测试”指对应 Files 中 `.controller.test.ts` 的精确路径，按目标测试命令追加，不运行未列出的脚本。

| 验证简称 | 根目录命令 |
| --- | --- |
| server check | `pnpm exec turbo run check --filter=@xpense/server` |
| web lint／check／build | `pnpm exec turbo run lint check build --filter=@xpense/web` |
| server／web lint／check／build | `pnpm exec turbo run lint check build --filter=@xpense/server --filter=@xpense/web` |
| server 目标测试 | `pnpm exec turbo run test --filter=@xpense/server --force --` 后逐项追加 Files 中测试路径 |
| web 目标测试 | `pnpm exec turbo run test --filter=@xpense/web --force --` 后逐项追加 Files 中测试路径 |

## 1. 跨任务契约与数据库决定

### 1.1 对外输入及输出（Task 1 定义）

以下 ID 均为 UUID 字符串，金额为 number 类型安全整数；读数／单价为非负十进制字符串，最多四位小数，不接受指数记法、符号或 NaN，单价可以为零。备注可空、去首尾空白、最多 1000 字符；强制原因去空白后 1—1000 字符。请求都由 strict Zod schema 排除未声明字段。

| 类型 | 固定字段与语义 |
| --- | --- |
| `RentalBillingMode` | `'legacy_receivable' \| 'monthly_settlement'`，服务端持久化决定；客户端不可自行切换 |
| `RentalChargeTerms` | `contractId, version, waterUnitPrice, electricityUnitPrice, fixedFees: {id,name,monthlyAmountMinor}[]`；条目 ID 稳定，名称 1—100 字符 |
| `UpdateRentalChargeTermsRequest` | `contractId, expectedVersion, idempotencyKey, reason`＋两单价和完整 `fixedFees`；新条目由客户端生成 UUID，服务端检查条目归属 |
| `RentalMeterReadingInput` | `kind: 'water' \| 'electricity', readingDate, reading`；底数记录带合同和空间，API 不信任客户端提供前驱 ID |
| `UpdateRentalMeterBaselineRequest` | `contractId, readings: RentalMeterReadingInput[], expectedVersion, idempotencyKey, reason`；水电各一项 |
| `RentalExtraFeeInput` | `id, name, amountMinor, note`；amountMinor 有符号，允许零，不把符号隐藏在名称中 |
| `PreviewRentalMonthlyBillRequest` | `contractId, billingMonth, dueDate?, readings?, overrides?: {waterUnitPrice?,electricityUnitPrice?,fixedFees?: {id,monthlyAmountMinor}[],reason}, extraFees`；可缺必要字段以返回待完善预览，不接受租金金额 |
| `GenerateRentalMonthlyBillRequest` | 上述输入＋必填到期日、水电输入、`expectedVersion, idempotencyKey`；与预览完全相同内容才能确认 |
| `RentalMonthlyBillPreview` | `version, canConfirm, missingFields, defaults: RentalChargeTerms, baselineReadings, lines, amountMinor, billingMonth, existingBillId: string \| null` |
| `RentalBillRevisionInput` | `billId, expectedVersion, readings?: RentalMeterReadingInput[], overrides?, extraFees?, reason`；提供的费用集合是替换，未提供表示保留；无租金字段 |
| `RentalBillRevisionPreview` | `version, affectedBills: {billId,beforeAmountMinor,afterAmountMinor}[], settlementDifferenceMinor: number \| null`；确认请求加 `idempotencyKey` |
| `RentalCashTarget` | `{kind:'bill',billId}` 或 `{kind:'settlement',settlementId}`，不得同时包含两者 |
| `RecordRentalReceiptRequest` | `target, amountMinor, occurredOn, note, expectedVersion, idempotencyKey`；仅综合账单或结算补款 |
| `ConfirmRentalDepositReceiptRequest` | `billId, occurredOn, note, expectedVersion, idempotencyKey`；不接受金额，由服务器取押金整额 |
| `ConfirmRentalRefundRequest` | `target, occurredOn, note, expectedVersion, idempotencyKey`；不接受金额，服务器取当前全部待退 |
| `RevokeRentalCashRequest` | `entryId, reason, expectedVersion, idempotencyKey`；receipt／refund 各自接口，不改原记录金额 |
| `RentalCashEntry` | `id, contractId, target, kind:'receipt'\|'refund', purpose:'bill_receipt'\|'deposit_receipt'\|'settlement_receipt'\|'refund', amountMinor, occurredOn, note, createdAt, createdByUserId, revokedAt, revokedByUserId, revokeReason` |
| `RentalFinancialBalance` | `receivedMinor, refundedMinor, netReceivedMinor, outstandingMinor, refundableMinor, state:'unpaid'\|'partial'\|'settled'\|'refundable', overdue:boolean, version`；netReceivedMinor 可有符号 |
| `PreviewRentalSettlementRequest` | `contractId, finalReadings?: RentalMeterReadingInput[], extraFees: RentalExtraFeeInput[]`；实际结束日从当前终止事件或自然到期日读取，不能由此接口任意修改租期 |
| `RentalSettlementPreview` | `version, canConfirm, missingFields, effectiveEndDate, billChanges, finalCostMinor, receivedMinor, refundedMinor, differenceMinor`；billChanges 每项含既有 billId 或待建月份、费用行和变化金额 |
| `ConfirmRentalSettlementRequest` | 预览输入＋`expectedVersion, idempotencyKey`；确认需要最终读数齐全 |
| `RentalSettlementDetail` | `id, contractId, eventId, kind:'termination'\|'expiry'\|'cancellation', effectiveEndDate, version, revision, finalCostMinor, balance: RentalFinancialBalance, status:'pending_collection'\|'pending_refund'\|'settled', confirmedAt, confirmedByUserId` |

扩展 `RentalBillLine.kind` 支持 `water/electricity/fixed_fee/extra_fee`，保留既有类型；新增可选 `note`、`feeSnapshot:RentalFeeSnapshot`，旧行缺失时不伪造。`RentalFeeSnapshot` 是带 kind 的联合：水电分支含 `startReadingId,endReadingId,startDate,endDate,startReading,endReading,unitPrice,overrideReason`；固定费分支含 `feeId,monthlyAmountMinor,overrideReason`；额外费分支含 `extraFeeId,origin:'monthly'|'settlement'`，金额和备注使用行本身字段。`RentalBillType` 增加 `monthly`；账单摘要增加可选 `modelVersion:1|2, billingMonth, financial, settlementId, revision`，Task 4／5 起新服务明确返回。存量响应缺字段按 legacy 读取，不推断余额。

合同详情增加可选 `billingMode`，数据库及新服务必须返回实际值；旧 mock 缺失视为 legacy。原 `GenerateRentalBillsRequest` 增加可选 `scope:'deposits'`：v2 仅允许明确生成押金，旧整租期租金入口不得用于 v2 合同。

列表统计保留旧字段供 legacy 客户端使用，新增 `monthlyAmountMinor` 及财务汇总。`rentAmountMinor` 只统计租金行，不能将整张综合账单当作租金收入；押金分开，已纳入结算的原账单不再计入独立待收／待退合计。

### 1.2 服务端计算与事务接口（Task 2、3 定义）

在 `rental-finance.types.ts` 定义：

- `FinanceScope = {organizationId:string; contractId:string}`。
- `FinanceContext = FinanceScope & {userId:string; today:string; currencyCode:string; timezone:string}`。
- `RentalFinanceSnapshot` 包含 `context, contract:RentalContractDetail, terms:RentalChargeTerms|null, readings:RentalMeterReading[], bills:RentalBillDetail[], cashEntries:RentalCashEntry[], settlement:RentalSettlementDetail|null`；`RentalMeterReading` 为输入＋`id,spaceId,contractId,revision,predecessorId:null|string`。
- `MonthlyChargeInput` 为合同已确认租金 `BillingTerms`、出账月份、采用的收费标准、水电前后读数及额外费用；`MonthlyChargeResult={lines:RentalBillLine[],amountMinor:number}`。
- `BillRevisionPlan={bills:{billId,lines,amountMinor}[],readings:RentalMeterReading[],affectedBillIds:string[]}`；`SettlementPlan={effectiveEndDate,finalBills:{billId:string|null,billingMonth,lines,amountMinor}[],finalCostMinor,differenceMinor}`。
- `CashWriteInput` 为去掉服务器生成字段的 `RentalCashEntry`；`RequestResult={resourceId:string;resourceKind:'terms'|'baseline'|'bill'|'cash'|'revision'|'settlement'|'generation'}`。请求记录另外保存规范化请求摘要，不保存数据库连接等运行时数据。

所有 repository 方法以 `FinanceScope` 限定查询，最后一个参数为必填 `AppDbExecutor`，不得自行开事务。方法返回数据库推导 Record（定义在各自 `.repository.types.ts`）；服务端 source/read service 映射为业务类型。

| Repository | 后续依赖的接口 |
| --- | --- |
| `ChargeTermsRepository` | `find(scope,tx)`、`save(scope,terms,actor,tx)`（同时追加价格修订） |
| `MeterReadingsRepository` | `list(scope,tx)`、`saveBaseline(scope,readings,actor,tx)`、`appendBoundary(scope,input,actor,tx)`、`reviseBoundary(scope,id,input,reason,actor,tx)`、`findAdjacentBillIds(scope,readingId,tx)` |
| `BillRevisionsRepository` | `append(scope,billId,lines,amountMinor,reason,actor,tx)`、`history(scope,billId,page,tx)`；原子增加 revision、保留旧快照并更新当前行 |
| `RentalCashRepository` | `list(scope,target,page,tx)`、`allForContract(scope,tx)`、`insert(scope,input,actor,tx)`、`revoke(scope,entryId,reason,actor,tx)` |
| `RentalSettlementsRepository` | `findCurrent(scope,tx)`、`create(scope,plan,event,actor,tx)`、`linkBills(scope,settlementId,billIds,tx)`、`revise(scope,settlementId,projection,actor,tx)`、`history(scope,page,tx)` |
| `FinanceRequestsRepository` | `find(scope,idempotencyKey,tx)`、`complete(scope,{idempotencyKey,action,requestHash,result},actor,tx)`；组织级唯一，返回时检查所属合同与动作 |

### 1.3 数据模型（Task 3 落地）

- `rental_contracts.billing_mode` 为非空 text＋CHECK；迁移默认 `legacy_receivable`，只在新建／续租服务中显式写 `monthly_settlement`，不能按当前日期推断版本，不能将存量合同自动接管。
- 扩展 `rental_bills`：`model_version` 默认 1、`billing_month` 可空、`revision` 默认 1。新综合和新押金写 2；综合账单 `sourceKey=monthly:YYYY-MM`，原押金来源规则复用。维持既有 generationId 和编号机制；允许批次 origin 增加 `monthly/settlement`，总额快照兼容新分类。
- `rental_bill_lines` 增加 note、fee_snapshot；额外费用与旧终止差额允许负数，其他计算行非负；合计仍由事务校验。
- `rental_charge_terms` 与 `rental_charge_term_revisions` 保存当前条款和不可变版本；固定费用集合为明确 JSON 类型，ID 合同内稳定，删除与重排不误匹配覆盖值。
- `rental_meter_readings` 保存合同、空间、表计类型、日期、numeric(20,4) 读数、前驱及 revision；`rental_meter_reading_revisions` 留变更历史。入住底数没有前驱，两表计分别成链；账单行快照引用起止读数 ID，实际 DB 关联用带组织、合同的引用表 `rental_bill_meter_intervals`，阻止相同计费区间重复入单。
- `rental_bill_revisions` 保存组织、合同、账单、revision、全部计算快照、原因及操作者；唯一 `(organization_id,bill_id,revision)`。
- `rental_cash_entries` 仅保存正数金额，billId／settlementId 必须恰一非空，包含 kind、purpose、业务日期、备注和完整撤销字段。有效 `deposit_receipt` 对同账单唯一；单笔整额及账单类型在持有合同锁时校验，不能仅凭客户端 purpose 放行。
- `rental_settlements`、`rental_settlement_revisions`、`rental_settlement_bills` 保存独立事件 UUID、最终成本快照、版本历史和纳入账单集合。一合同最多一份当前结算；自然到期、取消、提前终止均由服务端建立事件标识，不按日期复用旧终止事件。
- `rental_finance_requests` 组织＋幂等键唯一，保存 action、contractId、requestHash、result。仅完成操作才在同事务写成功记录；失败回滚，不留下虚假成功标志。
- 全部引用采用组织／合同复合约束，部分唯一索引显式区分有效记录；CHECK 显式处理 NULL，金额约束上下界与撤销字段一致性完整。资金记录不级联删除，历史账单或费用修订不破坏收款引用。

### 1.4 API、权限与页面契约

所有写请求 POST＋HTTP 200；strict schema、中文 400 校验错误、404 不可见资源、409 来源变化与幂等内容冲突沿用既有约定。预览为只读 POST，需要对应操作权限；动作写入在 service 再校验范围。

| API | 方法与对应权限（另外要求关联资源 read） |
| --- | --- |
| `/rental-charges/detail`、`/rental-charges/update` | GET `rental_charges:read`；POST `rental_charges:update` |
| `/rental-meters/detail`、`/rental-meters/update` | GET `rental_meters:read`；POST `rental_meters:update`（入住底数，使用后通过账单更正） |
| `/rental-monthly-bills/preview`、`/rental-monthly-bills/generate` | POST `rental_monthly_bills:generate`＋`rental_bills:read`、`rental_contracts:read` |
| `/rental-monthly-bills/adjust-preview`、`/rental-monthly-bills/adjust` | POST `rental_monthly_bills:adjust`＋`rental_bills:read`；联动已确认结算还要求 `rental_settlements:confirm` |
| `/rental-receipts/create`、`/rental-receipts/confirm-deposit`、`/rental-receipts/revoke` | POST `rental_receipts:create/create/revoke`；押金专门确认不接受金额 |
| `/rental-refunds/create`、`/rental-refunds/revoke` | POST `rental_refunds:create/revoke`；create 不接受金额 |
| `/rental-cash/list` | GET `rental_bills:read` 或 `rental_settlements:read`，按实际 target 检查，不给跨域并集访问 |
| `/rental-settlements/detail`、`/rental-settlements/history` | GET `rental_settlements:read`，按 contractId／分页读取 |
| `/rental-settlements/preview`、`/rental-settlements/confirm` | POST `rental_settlements:confirm`＋合同和账单 read |

既有 `/rental-bills/list|detail` 返回兼容扩展；新增 `/rental-bills/revisions` 读取有界账单版本历史。列表默认 20、上限 100；资金／结算历史同样有界。结算计算内部加载完整合同，不被页面分页限制。

新 routeKey 为 `RentalSettlement`，路径 `/rentals/settlements/$contractId`，作为合同详情和账单的链接入口，不增加空的全局结算看板。route descriptor 和缓存键包含 contractId、组织；开结算前该页展示预览，确认后展示当前结算和历史。服务端 detail 返回 `{settlement: RentalSettlementDetail|null}`，null 表示尚未确认，未知合同仍为 404。

### 1.5 共用事务协议与 Task 依赖

1. 权限／组织资源校验后锁组织→房产→合同；不以启用状态阻断既有资金的合法读写。关联读数、账单按稳定 ID 顺序加锁。
2. 先检查已完成同幂等键请求；同内容返回原资源结果，再读取当前状态展示。不得先比较当前版本而阻断网络重试；不同内容／合同／动作拒绝。
3. 读取一致 `RentalFinanceSnapshot`，计算版本摘要，校验 expectedVersion；再运行纯规则、保存领域记录、资金／结算投影、审计和幂等结果，全部同事务。
4. `SettlementProjectionService.refresh(scope,actor,tx)` 在 Task 5 实现：无结算时直接返回；有结算时从已关联账单当前版本求最终非押金成本，从合同全部有效资金求净收款，保存结算修订与当前差额。只依赖 repositories 和 Task 2 规则，不依赖结算编排 service，供 Task 5／6／7 调用。
5. Task 1→2→3→4→5→6→7→8→9→10 顺序执行。Task 6 通过上项投影接口联动已存在结算，不提前依赖 Task 7 service；测试可以直接构造已确认结算仓储记录。中间提交是可测试开发增量，不单独发布部分资金流程。

## Task 1：共享契约、输入校验与权限

**Files:** 新建 `packages/shared/src/rental-charges.ts`、`rental-monthly-bills.ts`、`rental-cash.ts`、`rental-settlements.ts` 及各自 `.test.ts`。修改 `index.ts`、`rental-bills.ts`、`rental-bills.test.ts`、`rental-contracts.ts`、`rbac.ts`、`rbac.test.ts`、`menu.ts`、`menu.test.ts`。新建 `apps/server/src/modules/rental/dto/rental-charges.dto.ts`、`rental-meters.dto.ts`、`rental-monthly-bills.dto.ts`、`rental-cash.dto.ts`、`rental-settlements.dto.ts`、`rental-finance.dto.test.ts`；修改既有 `generate-bills.dto.ts` 接受 scope，`list-bills.dto.ts` 接受 monthly。

**Interfaces:** 产出 §1.1 全部外部类型；DTO 类型用 schema 的 `z.output` 推导。schema 分别导出 `updateRentalChargeTermsSchema`、`updateRentalMeterBaselineSchema`、`previewRentalMonthlyBillSchema`、`generateRentalMonthlyBillSchema`、`reviseRentalBillSchema`、`recordRentalReceiptSchema`、`confirmRentalDepositReceiptSchema`、`confirmRentalRefundSchema`、`revokeRentalCashSchema`、`previewRentalSettlementSchema`、`confirmRentalSettlementSchema`。预览缺项允许，确认缺项拒绝。

- [x] **Step 1：写失败测试。** 为每个 schema 构造独立合法输入，断言额外费用 `-10000` 和备注合法，五位小数、负读数、非法日期、重复水电类型、空原因、双 target、押金／退款客户端 amountMinor、普通出账 rentAmountMinor 被拒绝。核心断言：
  ```ts
  expect(generateRentalMonthlyBillSchema.safeParse({ ...validMonthlyInput, extraFees: [{ id: extraId, name: "优惠", amountMinor: -10000, note: "本期减免" }] }).success).toBe(true);
  expect(confirmRentalRefundSchema.safeParse({ ...validRefundInput, amountMinor: 50000 }).success).toBe(false);
  expect(recordRentalReceiptSchema.safeParse({ ...validReceiptInput, amountMinor: 0 }).success).toBe(false);
  ```
- [x] **Step 2：验证失败。** 运行 `pnpm exec turbo run test --filter=@xpense/shared --force`；运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/dto/rental-finance.dto.test.ts`。预期因未定义 schema／新枚举断言失败，保存实际失败证据。
- [x] **Step 3：实现输入和稳定契约。** 按 §1.1 完成 schema 与中文 JSDoc；复用既有日历合法性、整数金额和分页校验。权限键与 routeKey 集中声明，暂不开放未实现端点。
- [x] **Step 4：验证兼容。** 重跑 Step 2 至通过，再运行 `pnpm exec turbo run check --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web`；修正仅因契约变化产生的类型映射，不弱化 legacy 测试。不存在 partial deposit 类型。
- [x] **Step 5：完成提交检查并独立提交。** `git commit -m "feat: 定义租赁月度收费与结算契约"`。

## Task 2：金额、月度计费、读数与结算纯规则

**Files:** 新建 §0 所列 5 个 `.rules.ts` 及一一对应 `.rules.test.ts`；新建 `rental-finance.types.ts`、`rental-rent-projection.rules.ts` 及其测试，月度与结算共用原付款账期租金投影。只复用 `billing-period.rules.ts`、`billing-termination.rules.ts`、`contract-date.rules.ts`，不重写既有算法。

**Interfaces:** `parseDecimal4(text:string):bigint`；`calculateMeterCharge(previous:string,current:string,unitPrice:string):number`；`calculateMonthlyCharges(input:MonthlyChargeInput):MonthlyChargeResult`；`calculateRentalBalance(amountMinor:number,receivedMinor:number,refundedMinor:number,dueDate:string|null,today:string):Omit<RentalFinancialBalance,'version'>`（version 由服务层填充）；`buildMeterCorrectionPlan(snapshot:RentalFinanceSnapshot,input:RentalBillRevisionInput):BillRevisionPlan`；`buildRentalSettlementPlan(snapshot:RentalFinanceSnapshot,input:PreviewRentalSettlementRequest):SettlementPlan`。

- [x] **Step 1：写金额和月份失败测试。** 用 10 月月租 300000、网费 10000、卫生费 5000、水电 20000、优惠 -10000，预期合计 325000；季度租金 900000 只进入付款账期开始月份。9 月 15 日起租的自然月租金仍为 160000；固定费 10000 在 10 月 20 日退租为 6452。
  ```ts
  expect(calculateMeterCharge("100", "112.5", "3")).toBe(3750);
  expect(calculateRentalBalance(300000, 200000, 0, "2026-10-01", "2026-10-02")).toMatchObject({ outstandingMinor: 100000, refundableMinor: 0, overdue: true });
  expect(calculateRentalBalance(200000, 300000, 50000, null, "2026-10-20")).toMatchObject({ refundableMinor: 50000 });
  ```
- [x] **Step 2：写读数／结算失败测试。** 9 月边界从 100 改 110，前区间单价 3、后区间单价 4，差额分别 +3000、-4000；租金 200000、10 月 20 日退租得到 129032，另有水电 20000，已收租金 200000 和押金 300000，最终应退 350968；再录入退款 300000 后只待退 50968。同时断言缺失月份补入、已计费区间不重计、押金应收不进入成本、金额溢出和负应收拒绝。
- [x] **Step 3：运行失败测试。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/rental-decimal.rules.test.ts src/modules/rental/monthly-charge.rules.test.ts src/modules/rental/meter-correction.rules.test.ts src/modules/rental/rental-balance.rules.test.ts src/modules/rental/rental-settlement.rules.test.ts`。
- [x] **Step 4：实现纯计算。** parseDecimal4 统一放大 10000；水电最小单位金额＝`roundHalfUp((current4-previous4)*price4*100/100000000)`，全程 BigInt。固定费用每项末尾舍入，额外费用直接有符号求和。租金从原始付款计划按 start month 归属，不按账单月份裁成自然月。结算覆盖原计划至实际结束，匹配既有稳定月份和计费区间，只补缺失义务。
- [x] **Step 5：执行回归。** 重跑 Step 3，再运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/billing-period.rules.test.ts src/modules/rental/billing-termination.rules.test.ts src/modules/rental/contract-date.rules.test.ts` 和 server check；所有既有锚点、月底与闰年断言保持有效。
- [x] **Step 6：完成提交检查并独立提交。** `git commit -m "feat: 实现租赁费用与收退结算计算"`。

## Task 3：数据库、仓储及迁移文件

**Files:** 新建 §0／§1.3 的 schema 文件、6 个 repository 及各自 `.repository.types.ts`、`.repository.test.ts`。修改 `apps/server/src/db/schema.ts`、`schema/rental-billing.ts`、`schema/rental-tenancy.ts`；新建 `apps/server/src/db/rental-monthly-finance-migration.integration.test.ts`。保留 Task 1 已生成的 `_rental_monthly_enums` migration.sql／snapshot.json，本 Task 只生成 `_rental_monthly_finance` 后继迁移；时间戳由已安装生成器产生并记入执行记录，不手编 snapshot。

**Interfaces:** 产出 §1.2 仓储接口及 §1.3 约束。扩展 `BillsRepository.insertBills` 的内部输入支持 v2 月份／revision／新行快照；保留旧调用默认 v1。schema 推导类型留在服务端，不能引用前端或将数据库类型导入共享包。

- [x] **Step 1：补仓储和约束失败测试。** 检查每次查询含 organizationId 和 contractId，现金不物理删除，cash target 恰一、组织复合引用、正金额范围、月账单有效唯一、押金有效 receipt 唯一、读数前驱同合同同表计、区间不重复及修订递增。断言同一月底账单可保留多版本但只能一个当前身份。
  ```ts
  expect(afterRevision.id).toBe(beforeRevision.id);
  expect(afterRevision.revision).toBe(beforeRevision.revision + 1);
  expect(afterRevoke.amountMinor).toBe(beforeRevoke.amountMinor);
  expect(afterRevoke.revokedAt).not.toBeNull();
  ```
- [x] **Step 2：验证失败。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/db/rental-monthly-finance-migration.integration.test.ts src/modules/rental/charge-terms.repository.test.ts src/modules/rental/meter-readings.repository.test.ts src/modules/rental/bill-revisions.repository.test.ts src/modules/rental/rental-cash.repository.test.ts src/modules/rental/rental-settlements.repository.test.ts src/modules/rental/finance-requests.repository.test.ts`。无专用库时只运行静态／mock 部分，真实库用例必须明确 skipped。
- [x] **Step 3：生成数据结构 migration。** 枚举 schema 与 `_rental_monthly_enums` 迁移已前移 Task 1，完整保留、不重复生成；完成表、列、约束和仓储后，运行 `pnpm exec turbo run db:generate --filter=@xpense/server -- --name=rental_monthly_finance`。不能假设两个 migration 文件之间自动提交：新 CHECK 中对新增值的判断使用 `type::text`／`kind::text` 与 text 常量比较，新部分索引按 model_version／billing_month 等字段筛选；迁移内不 INSERT 新枚举数据、不设置新枚举默认值，不将新增字符串强转成尚未提交的 enum 值。静态检查这些条件，Task 10 使用真实 runner 验证同次部署可完成，不引入手动分阶段发布前提。
- [x] **Step 4：实现原子修订及引用。** append 保存旧版完整快照后更新当前账单及行；当前行替换仅限本任务新增的修订机制，不删除账单／资金历史。价格和读数版本各自保留，现金 purpose 约束与唯一索引不能依赖可伪造 JSON。幂等结果只在业务和审计成功事务中插入。
- [x] **Step 5：验证迁移边界。** 静态测试断言不 UPDATE accounts、不 INSERT transactions、不回填收款或把旧合同改为 monthly；检查 CHECK 的 NULL 分支。重跑 Step 2、既有 `rental-billing-migration.integration.test.ts`、`bills.repository.test.ts`、server check。所有应执行的静态和仓储测试通过；未授权真实 DDL 不执行并记录边界，留待 Task 10 必需演练。
- [x] **Step 6：完成提交检查并独立提交。** `git commit -m "feat: 新增租赁收费与收退款数据模型"`。本 Task 只包含实际生成的 finance 后继目录；枚举目录属于 Task 1，禁止暂存其他既有迁移改动。

## Task 4：收费标准、入住底数与月度出账服务

**Files:** 新建 `rental-finance-source.service.ts`、`charge-terms.service.ts`、`meter-readings.service.ts`、`monthly-bills.service.ts` 及各自 `.test.ts`；新建 `charge-terms.controller.ts`、`meter-readings.controller.ts`、`monthly-bills.controller.ts` 及各自 `.test.ts`。修改 `contracts.service.ts`、`contract-lifecycle.service.ts`（新建／续租写模式）、`contracts.repository.select-fields.ts`、`contract-read-model.ts`、`contracts.repository.types.ts`、`bills.service.ts`（v2 押金与旧入口隔离）、`bills.repository.ts`、`bills.queries.ts`、`bills-read.service.ts`、`rental.module.ts`。新建 `apps/server/src/test/rental-finance-fixtures.ts`、`rental-finance-http-harness.ts`；修改 `create-test-app.ts`、`rental.controllers.test.ts`，新建 `rental-monthly-billing.e2e.test.ts`。

**Interfaces:** `RentalFinanceSourceService.read(scope:FinanceScope,tx:AppDbExecutor):Promise<RentalFinanceSnapshot>`；`ChargeTermsService.detail/update(auth,dto)`；`MeterReadingsService.detail/update(auth,dto)`；`MonthlyBillsService.preview(auth,PreviewRentalMonthlyBillRequest):Promise<RentalMonthlyBillPreview>`、`generate(auth,GenerateRentalMonthlyBillRequest):Promise<RentalBillDetail>`。service 方法均返回 Promise，读取／写入用 §1.1 对应类型。

- [x] **Step 1：写失败测试。** 新建合同 mode=monthly，既有合同仍 legacy；履行中只改水电／月费合法，租金核心修改仍拒绝。生成前看到默认费用及底数；单价 3 改 4 后新账单取 4，旧账单仍 3；本期覆盖不改默认。缺读数或 dueDate 的 preview 可返回 missingFields，generate 400；入住房间以外底数、第二空间、重复月份、重用计费区间拒绝。
  ```ts
  expect(preview.defaults.waterUnitPrice).toBe("4.0000");
  expect(oldBill.lines.find(line => line.kind === "water")?.feeSnapshot).toMatchObject({ unitPrice: "3.0000" });
  expect(incompletePreview).toMatchObject({ canConfirm: false, missingFields: expect.arrayContaining(["dueDate"]) });
  ```
- [x] **Step 2：运行失败测试。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/rental-finance-source.service.test.ts src/modules/rental/charge-terms.service.test.ts src/modules/rental/meter-readings.service.test.ts src/modules/rental/monthly-bills.service.test.ts src/modules/rental/rental-monthly-billing.e2e.test.ts`。
- [x] **Step 3：实现一致来源与收费入口。** source 在传入 executor 下组装，不嵌套事务。底数使用后不允许普通 update 覆盖，需走可预览的读数更正；同表计链首次计费前要有底数。新建／续租仅复制收费默认值，不复制押金资金或历史读数，续租底数重新确认。新增合同仍可先存草稿，确认新模式合同只有一个空间。
- [x] **Step 4：实现生成与查询分流。** 按 §1.5 事务协议保存 generation、账单、费用行及水电区间；预览不分配编号。v2 旧 generate 请求没有 scope=deposits 时明确 409 引导月度入口，不悄悄生成整租期；v1 原行为和测试保持。新月度覆盖计数不继续使用旧 rentalCoverage，列表支持 monthly 且金额分类正确。
- [x] **Step 5：接 API 并验证。** 为新增 controller 覆盖 schema 绑定、HTTP 200、401、403、404、409；新请求重放先查幂等再校验版本，同键不同组织／合同不串用。重跑 Step 2 及各新 controller 测试、`contracts.service.test.ts`、`contract-lifecycle.service.test.ts`、`bills.service.test.ts`、`bills-read.service.test.ts`、`rental.controllers.test.ts`，运行 server check。UI 尚未接入前不可宣称可发布。
- [x] **Step 6：完成提交检查并独立提交。** `git commit -m "feat: 支持合同收费配置与月度出账"`。

## Task 5：收款、全额押金、退款与撤销

**Files:** 新建 `rental-cash.service.ts`、`settlement-projection.service.ts`、`rental-receipts.controller.ts`、`rental-refunds.controller.ts`、`rental-cash.controller.ts` 及各自 `.test.ts`；新建 `rental-cash.e2e.test.ts`。修改 `bills-read.service.ts`、`bills.queries.ts`、`rental.module.ts` 及其相关测试、`rental-finance-http-harness.ts`、`create-test-app.ts`、`rental.controllers.test.ts`。

**Interfaces:** `RentalCashService.recordReceipt(auth,RecordRentalReceiptRequest)`、`confirmDepositReceipt(auth,ConfirmRentalDepositReceiptRequest)`、`confirmRefund(auth,ConfirmRentalRefundRequest)`、`revokeReceipt/revokeRefund(auth,RevokeRentalCashRequest):Promise<RentalCashEntry>`；`list(auth,{target,page,pageSize}):Promise<PageResult<RentalCashEntry>>`。`SettlementProjectionService.refresh(scope:FinanceScope,actor:string,tx:AppDbExecutor):Promise<RentalSettlementDetail|null>` 按 §1.5 定义，不调用 Task 7 service。

- [x] **Step 1：写失败测试。** 应收 300000，先收 200000 再收 100000，未收变零；第二次输入 120000 拒绝。押金服务取 300000 全额，重复不同 key 也不可再收，同 key 返回原记录。应收更正为 200000、已收 300000 后确认退 100000，再将应收改为 190000 后可再退 10000。
  ```ts
  expect(detail.financial).toMatchObject({ receivedMinor: 300000, outstandingMinor: 0 });
  expect(afterRefund.financial).toMatchObject({ receivedMinor: 300000, refundedMinor: 100000, refundableMinor: 0 });
  expect(revoked.refundableMinor).toBe(100000);
  ```
- [x] **Step 2：验证失败。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/rental-cash.service.test.ts src/modules/rental/settlement-projection.service.test.ts src/modules/rental/rental-cash.e2e.test.ts`。
- [x] **Step 3：实现资金协议与投影。** 校验 bill／settlement 归属、modelVersion、active 状态、操作类型、expectedVersion 和余额；资金写入后刷新关联结算及查询余额。撤销回滚到派生结果，不覆盖金额。已收后退款不能重新启用押金“全额收取”按钮。旧账单有 settlement 关联时拒绝新增 receipt/refund；原记录撤销仍可操作并重算。
- [x] **Step 4：验证冲突与无外部资金副作用。** 同步发起两次收取剩余 100000，只允许一笔成功；退款预览后更正应收返回 409，已完成退款请求重试只重放。无结算 projection 返回 null；有结算时计入全部有效资金含原账单上的钱，不能重复加押金。mock 断言未调用账户／交易写入口，审计失败现金和幂等记录回滚。
- [x] **Step 5：重跑并检查。** Step 2、全部本 Task controller 测试、`bills-read.service.test.ts` 和 server check 通过；E2E 测试使用本地 harness，不依赖真实支付服务。
- [x] **Step 6：完成提交检查并独立提交。** `git commit -m "feat: 实现租赁账单收款退款登记"`。

## Task 6：账单修订与相邻读数联动

**Files:** 新建 `bill-revisions.service.ts`、`bill-revisions.service.test.ts`、`rental-bill-revisions.e2e.test.ts`；修改 `monthly-bills.controller.ts` 及其测试、`bills.controller.ts`、`bills.controller.test.ts`（历史接口）、`rental.module.ts`、新 finance harness 及 `rental.controllers.test.ts`。

**Interfaces:** `BillRevisionsService.preview(auth,RentalBillRevisionInput):Promise<RentalBillRevisionPreview>`、`adjust(auth,RentalBillRevisionInput & {idempotencyKey:string}):Promise<RentalBillRevisionPreview>`；调用 Task 2 `buildMeterCorrectionPlan`、Task 3 append 和 Task 5 projection，不反向依赖 MonthlyBillsService 或未来的 RentalSettlementsService。

- [x] **Step 1：写失败测试。** 一张已收、另一张已纳入结算，公共读数 100→110 后两张金额分别变 +3000／-4000；两个原 billId 及现金 ID 不变；修订保存两张 before／after 快照，结算待退款变化。改成大于后端读数、无权限更正其中一张、缺原因均在写前拒绝。
  ```ts
  expect(preview.affectedBills.map(bill => bill.afterAmountMinor - bill.beforeAmountMinor)).toEqual([3000, -4000]);
  expect(after.cashEntries.map(entry => entry.id)).toEqual(before.cashEntries.map(entry => entry.id));
  ```
- [x] **Step 2：验证失败。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/bill-revisions.service.test.ts src/modules/rental/rental-bill-revisions.e2e.test.ts`。
- [x] **Step 3：实现事务内联动。** sourceVersion 涵盖两侧账单、公共读数版本和结算资金；一次 append 全部受影响修订、读数历史、结算投影、审计与请求结果。只改单期价格或额外费用时，不重算相邻用量；只改读数时价格使用各期旧快照，不读取当前合同价。
- [x] **Step 4：补失败注入和历史查询。** 第二张更新或结算 projection 故障，验证第一张、读数、历史及 request 全部回滚；没有后一期只影响本张及后续底数；已结清／已退之后仍可更正。读取历史分页上限 100，跨组织不可见。
- [x] **Step 5：回归通过后提交。** 重跑 Step 2 和本 Task controller 测试、server check、相关 cash 测试；`git commit -m "feat: 支持租赁费用更正与读数联动"`。

## Task 7：统一结算与合同生命周期

**用户补充验收（2026-10-01）：** 退租统一结算必须撤回实际结束月之后已生成的账单，不保留未来有效月份账单。未来月份租金、固定费及该月份的月度额外费用／减免随未来义务撤回；已经实际发生的水电连续区间按原价格快照结算到结束月份。原账单编号、完整修订历史和真实收退款凭证保留，全部有效资金按合同汇总一次，不通过删除历史、重分配现金或虚构抵扣实现。此直接用户要求替代此前未决的未来月份额外费用保留策略；结算差额允许负数。覆盖十月已出账、九月退租的公开接口流程及撤回后补退归零、旧入口拒绝、重试和事务失败回滚。

**Files:** 新建 `rental-settlements.service.ts`、`monthly-billing-lifecycle.service.ts`、`rental-settlements.controller.ts` 及各自 `.test.ts`；新建 `rental-settlements.e2e.test.ts`。修改 `billing-lifecycle.service.ts`、`billing-termination.service.ts`（legacy 分支保留）、`contract-lifecycle.service.ts`、`contracts.service.ts`、`dto/terminate-contract.dto.ts`、`rental.module.ts`、`rental-finance-http-harness.ts`、`create-test-app.ts`、`rental.controllers.test.ts`；补充对应现有 lifecycle 测试。

**Interfaces:** `RentalSettlementsService.detail(auth,{contractId}):Promise<{settlement:RentalSettlementDetail|null}>`、`preview(auth,PreviewRentalSettlementRequest):Promise<RentalSettlementPreview>`、`confirm(auth,ConfirmRentalSettlementRequest):Promise<RentalSettlementDetail>`、`history(auth,{contractId,page,pageSize})` 返回分页修订。`MonthlyBillingLifecycleService.onCorrection/onCancel/onTerminate/onRevokeTermination(auth,before,after,tx):Promise<void>` 接受现有事务；分流在既有 BillingLifecycleService，禁止 service 循环调用。

- [x] **Step 1：写完整失败场景。** 使用新合同：9 月未清 50000、10 月本期多收 30000、实际押金 300000，应退 280000；确认后原账单资金入口拒绝，结算确认退款后归零。存在未生成月份仍补足费用；缺最终水电只返回不可确认预览，不允许最终确认。
  ```ts
  expect(preview.differenceMinor).toBe(-280000);
  expect(afterRefund).toMatchObject({ status: "settled", balance: { refundableMinor: 0, outstandingMinor: 0 } });
  ```
- [x] **Step 2：写生命周期失败场景。** 9 月 28 日预约 10 月 20 日退租，不能提前确认退款结算；可按既有规则撤销未来终止，空间冲突时全部不变。到实际退租日最终费用确定但未补款，合同空间仍按日期释放。起租前未登记收款取消无退款，有已收押金取消生成待退 300000；previous refund 必须扣除。
- [x] **Step 3：运行失败测试。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/rental-settlements.service.test.ts src/modules/rental/monthly-billing-lifecycle.service.test.ts src/modules/rental/rental-settlements.e2e.test.ts`。
- [x] **Step 4：实现确认与缺失费用补齐。** 合同实际结束日期和独立事件从服务端读取；预览构建完整计划，确认事务中修订受影响原账单、补缺失月份及末次水电、关联全部结算账单、建立结算事件／版本，调用 projection 并写审计。既有费用取原快照，未出账的非租金费用取此次生成时合同当前默认值，不自动复制另一张账单的本期覆盖。缺失月份补应发生的租金和固定费，水电仅对最终未计费的实际连续区间出一份明细，不伪造缺失月份的月末读数。结算额外费用只写入结束月份账单，按 `origin=settlement` 与 extraFeeId 区分既有月度额外费用，重算替换自身集合而不反复追加。已发生现金只按合同汇总一次，押金应收不计成本；季度原账期裁剪，不重分组。不创建虚构抵扣收款。取消不要求不存在的入住后读数。
- [x] **Step 5：处理已收账单与合同修正。** v1 原联动保持；v2 不能直接沿用旧的“作废后无资金补生成”。同月份义务变化采用稳定 ID 修订，已取消的义务归零但现金保留；来源消失需作废时仍计入合同资金并建立明确的原义务退款状态。新的押金来源独立生成、整额确认，不能静默将旧收款分配给新来源。覆盖有收款后的起租前租期／押金修正测试，不新增任意房租改价入口。
- [x] **Step 6：实现并发与权限。** 结算确认和原账单收款在同一合同锁串行化；确认提交后旧弹窗必须 409。结算确认的读取／调整权限不可由合同 update 代替；预定终止无财务变更不强制退款权限。明细更正、原收退款撤销和结算补收／退款均重新计算 projection，可重新打开已结清状态。
- [x] **Step 7：验证并独立提交。** 重跑 Step 3 和 `rental-billing-lifecycle.e2e.test.ts`、`contract-lifecycle.service.test.ts`、`billing-lifecycle.service.test.ts`、`billing-termination.service.test.ts`、`rental.controllers.test.ts`、server check；`git commit -m "feat: 实现租赁合同统一结算"`。

## Task 8：前端收费配置、月度出账及收退款

**Files:** 新建 `apps/web/src/services/rental-finance-api.ts`、`rental-finance-query.ts` 及各自 `.test.ts`；修改 `web-session.ts`、`web-session.test.ts`、`rental-bills-api.ts`。新建 `features/rental/charges/contract-charges-section.tsx`、`contract-charges-form.tsx`、`meter-baseline-form.tsx`，各有 `.test.tsx`；新建 `features/rental/bills/monthly-bill-dialog.tsx`、`monthly-bill-form.ts`、`meter-reading-fields.tsx`、`extra-fee-fields.tsx`、`bill-receipt-dialog.tsx`、`bill-cash-history.tsx`、`bill-revision-dialog.tsx` 及对应测试（form 为 `.test.ts`）。修改 `contract-bills-section.tsx`、`bill-detail-page.tsx`、`bill-detail-sections.tsx`、`bill-calculation-lines.tsx`、`bill-test-fixtures.ts`，以及 `contracts/contract-detail-page.tsx`、`contract-form-page.tsx` 和相关测试。为 service、组件、route 依赖中新增 finance API 的编译调用方同步增加 fixture，不弱化既有断言。

**Interfaces:** `createRentalFinanceApi(client:ApiClient)` 返回与 §1.4 同名动作的方法（`getChargeTerms/updateChargeTerms/getMeterBaseline/updateMeterBaseline/previewMonthlyBill/generateMonthlyBill/previewBillRevision/adjustBill/recordReceipt/confirmDepositReceipt/confirmRefund/revokeReceipt/revokeRefund/listCash/getSettlement/previewSettlement/confirmSettlement/settlementHistory`）；`RentalFinanceApi=ReturnType`，加入 WebSessionDependency。Query key 统一 `['rental',organizationId,'finance',resource,resourceId,filters]`；`invalidateRentalFinance(queryClient,organizationId,contractId):Promise<void>` 同时失效本合同收费、计量、账单和结算相关查询，不清全账号缓存。

会话依赖 fixture 的已定位调用方：`apps/web/src/router.test.tsx`、`routes/-shared/route-contract.test.ts`、`routes/-shared/access.test.ts`、`routes/login.test.tsx`、`routes/_session/_shell/system/menu-reset.test.tsx`、`components/layout/authenticated-layout.test.tsx`、`features/menus/menu-reset-page.test.tsx`、`routes/_authenticated/(iam)/iam-routes.test.tsx`、`routes/_authenticated/(bookkeeping)/bookkeeping-routes.test.tsx`、`routes/_authenticated/(rental)/rentals/{contracts/contracts-routes,properties/properties-routes,tenants/tenant-routes}.test.tsx`（除首项外均以 `apps/web/src/` 为前缀）。仅补必要依赖，不改各页面既有业务。

- [x] **Step 1：执行设计审视。** 必须读取并实际使用 `design-taste-frontend`，同时使用 `vercel-react-best-practices`；审视当前合同详情、账单列表和 DatePicker，输出“房东业务后台、金额核对与录入优先”的设计方向，复用 DESIGN.md 的 Token、shadcn、lucide 和金额 tabular-nums。保留桌面与移动端布局检查记录，不引入营销 hero、装饰动效或新组件库。
- [x] **Step 2：先写服务与组件失败测试。** 渲染合同费用及上次读数，输入后出现服务端新预览；额外金额 `-100` 与备注正确提交为最小单位负数，租金不可编辑；缺字段禁止确认，修改输入使旧预览失效。收款弹窗每次填本次金额；押金只出现全额确认，退款二次确认不发送 amountMinor；撤销必须原因。
  ```ts
  expect(screen.getByText("本次收款")).toBeInTheDocument();
  expect(api.confirmRefund).toHaveBeenCalledWith(expect.not.objectContaining({ amountMinor: expect.anything() }));
  expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  ```
- [x] **Step 3：运行失败测试。** `pnpm exec turbo run test --filter=@xpense/web --force -- src/services/rental-finance-api.test.ts src/services/rental-finance-query.test.ts src/features/rental/charges src/features/rental/bills/monthly-bill-dialog.test.tsx src/features/rental/bills/bill-receipt-dialog.test.tsx src/features/rental/bills/bill-revision-dialog.test.tsx`。
- [x] **Step 4：实现 API 和会话隔离。** 全部请求留在 services，客户端不重新实现 authoritative 金额算法；录入触发可取消／可忽略迟到响应的服务端预览，展示最新输入对应结果。一次确认保存不可变请求及幂等键，未知网络结果重试原键，改内容重新预览并换键。对话框捕获原组织和资源，组织切换关闭旧尝试，不允许通过最新 token 把旧输入重发到新组织。
- [x] **Step 5：实现页面与兼容分支。** v2 合同展示收费、底数和“生成本月账单”入口，押金保留独立入口；legacy 仍使用旧 generation dialog 和未知收款提示。新明细展示正负额外费用、备注、实际计量区间、本期改价原因、收退款及修订历史；日期使用现有 DatePicker，表单使用现有 TanStack Form 规范。
- [x] **Step 6：完善交互与验证。** 补全部新字段／历史组件测试，再重跑 `src/features/rental/bills`、`src/features/rental/charges`、`src/features/rental/contracts/contract-detail-page.test.tsx`、`src/features/rental/contracts/contract-form-page.test.tsx`、两项 finance service 测试、`web-session.test.ts`，运行 web lint／check／build。浏览器验证桌面 1440 和移动 390 宽度、浅深主题、键盘、错误定位、二次确认；记录实际截图／观察结果，不以 jsdom 冒充视觉验证。
- [x] **Step 7：完成提交检查并独立提交。** `git commit -m "feat: 新增租赁月度收费与收退款界面"`。

## Task 9：结算页面、路由权限与汇总联动

**Files:** 新建 `apps/web/src/features/rental/settlements/settlement-page.tsx`、`settlement-preview.tsx`、`settlement-money-actions.tsx`、`settlement-history.tsx` 及各自 `.test.tsx`；新建 `apps/web/src/routes/_authenticated/(rental)/rentals/settlements/$contractId.tsx` 和该目录 `settlement-routes.test.tsx`。修改 `contracts/contract-actions.tsx`、`contract-action-model.ts`、`contract-detail-page.tsx`，`bills/contract-termination-billing.tsx`、`termination-billing-fields.tsx`、`bills-page.tsx`、`bill-table.tsx`、`bill-filters.tsx`、`bill-search.ts` 及已有对应测试；修改 `router.test.tsx`、`routes/-shared/route-contract.test.ts`。修改服务端 `db/seed-rbac.ts`、`seed-rbac.test.ts`、`modules/iam/billing-menu-template.ts`、`menu-template.test.ts`、`bills-read.service.ts`、`bills.queries.ts` 及测试；生成后缀 `_rental_monthly_permissions` 的增量权限 migration，不执行。

**Interfaces:** `SettlementPage({organizationId,contractId,permissions,api:RentalFinanceApi})`；routeKey `RentalSettlement` 及路径遵守 §1.4。合同详情使用 billingMode 分流终止确认界面；旧费用确认只服务 legacy，v2 先预约／终止，最终确认从新结算页进入。新统计响应不重复汇总已纳入结算的原账单资金缺口。

- [ ] **Step 1：执行技能和现状审视。** 同 Task 8 实际使用 `design-taste-frontend`，审视合同动作弹窗和金额层级。结算页清楚分开“费用明细”“实际收退”“最终差额”，不嵌套多层装饰卡片；未实现的控件不显示。
- [ ] **Step 2：写失败测试。** 明确显示确认结算不等于已退款；应退 280000 时按钮为“确认已退 ¥2,800.00”，二次确认后为已结清；更正费用后重新出现应退按钮。读数缺失不能确认结算，未来终止不能提前确认；待补款仍显示合同已按日期结束。已纳入结算的原账单无新增收退款按钮，有结算链接；旧账单不显示已收零或欠款。
  ```ts
  expect(await screen.findByRole("button", { name: "确认已退 ¥2,800.00" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "登记收款" })).not.toBeInTheDocument(); // 已纳入结算的原账单页面
  ```
- [ ] **Step 3：运行失败测试。** `pnpm exec turbo run test --filter=@xpense/web --force -- src/features/rental/settlements src/features/rental/bills src/routes/_authenticated/\(rental\)/rentals/settlements/settlement-routes.test.tsx`；运行 server `seed-rbac.test.ts`、`menu-template.test.ts`、`bills-read.service.test.ts` 的目标测试。
- [ ] **Step 4：实现结算页及合同入口。** 使用 Task 8 API、组织查询键和不可变确认请求；同步失效结算、原账单及合同详情。结算页收款沿用部分输入，退款沿用全额按钮；更正和撤销显示其影响，不把真实退款伪造成撤销收款。路由沿用 RegisteredRouteLeaf／page descriptor，不手改 routeTree.gen.ts，由已安装 router 插件随构建生成。
- [ ] **Step 5：接权限和汇总。** 增量维护权限目录、隐藏详情 route、动作按钮及 owner/admin 授权；不重置已有组织菜单和自定义角色。迁移采用幂等插入，实际 seed／迁移执行仍需授权。bill totals 分开费用构成；统一待收／待退以未纳入结算账单＋当前结算求和，cash historical totals 不能 JOIN 明细后重复累加。
- [ ] **Step 6：验证并独立提交。** 重跑 Step 3、合同动作相关测试、router 和 route-contract 测试、server／web lint／check／build；完成桌面移动端和权限视觉检查。`git commit -m "feat: 完成租赁退租结算与账单联动界面"`。

## Task 10：完整回归、真实并发及交付记录

**Files:** 新建 `apps/server/src/modules/rental/rental-finance-flow.e2e.test.ts`、`apps/server/src/db/rental-finance-concurrency.integration.test.ts`；必要时扩展 `src/test/rental-finance-http-harness.ts`，但模拟事务不得冒充真实数据库。更新本计划末尾执行记录及设计文档状态；不修改无关公共规范。

**Interfaces:** 全流程测试使用已实现 API。真实库复用 `RENTAL_MIGRATION_TEST_DATABASE_URL` 指向明确获准的一次性 PostgreSQL；连接值不写入代码、文档或日志，DDL／清理只作用于测试唯一 schema。

- [x] **Step 1：编写端到端失败用例。** 新合同→设置默认费用与入住底数→押金出账并全额收款→月度账单含负额外费用和备注→部分两次收款→改历史读数联动两期→预约终止及撤销→实际退租补缺失月份→统一结算→全额退款→费用再更正→第二次退款→误确认撤销。每一步校验金额、来源 ID、版本、组织权限及最终资金事实，不能只断言 HTTP 200。
  ```ts
  expect(concurrentLastReceipts.filter(result => result.statusCode === 200)).toHaveLength(1);
  expect(afterTwoRefunds.balance.refundedMinor).toBe(firstRefund.amountMinor + secondRefund.amountMinor);
  expect(afterRevokingSecond.balance.refundableMinor).toBe(secondRefund.amountMinor);
  ```
- [x] **Step 2：运行目标流程。** `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/rental-finance-flow.e2e.test.ts`。如果前面任务实现已满足而直接通过，记录这是集成回归，不伪造红灯；新增缺口按失败测试修复，并记录所属 Task。
- [x] **Step 3：准备并获准真实库演练。** 先说明要创建独立 schema、应用迁移并清理的具体范围，再按项目权限执行。未获授权或缺一次性库时不运行 DDL，Task 10 保持未完成，交付明确阻塞，不把 skipped 写成通过。
- [x] **Step 4：验证迁移及并发。** 使用不同连接并发登记最后余额、押金全额、退款、相邻账单更正和结算确认，断言唯一成功、无超收重复退、无部分提交。按实际 migration runner 顺序验证新增枚举事务边界、旧数据 v1、增量权限重复执行不破坏菜单。运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/db/rental-monthly-finance-migration.integration.test.ts src/db/rental-finance-concurrency.integration.test.ts`；逐项核对真实测试没有 skipped。
- [x] **Step 5：完整子项目回归。** 运行 `pnpm exec turbo run test --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web --force`，再运行 `pnpm exec turbo run lint check build --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web`。既有失败单独报告，不弱化断言或顺手修复无关问题；未解决的本任务失败阻止完成。
- [x] **Step 6：复核页面与授权。** 用本地已授权数据在浅／深主题、1440／390 宽度、键盘操作验证月度录入、负额外费用、押金、部分收款、退款撤销、预约及最终结算；测试不依赖真实外部服务。按选定执行方法安排最终评审，修复本次问题后只重跑受影响检查。
- [x] **Step 7：完成文档与独立提交。** 记录实际命令、通过／失败／跳过、迁移演练和视觉证据、剩余风险及未改变的账户资金边界；全部完成后 `git commit -m "test: 补齐租赁收费与结算回归验证"`。不自动推送或创建 PR。

## 每个 Task 共用提交检查

1. 确认本 Task 实现与实际验收一致，更新执行记录；所有必需验证通过，未执行项按边界如实记录。Task 3 不要求未经授权真实 DDL，Task 10 要求完成真实演练。
2. 运行 `git diff --check`，检查本 Task 文件 diff、敏感信息、无关改动及测试断言强度；新忽略文档另行读取并检查尾空白与冲突标记。
3. 按本 Task 实际改动的具体文件列表执行 `git add -- <精确路径>`；计划／设计新文件用 `git add -f -- <精确文档路径>`，不使用 `git add .` 或 `git add -A`。生成迁移只暂存执行记录列出的实际目录。
4. 运行 `git diff --cached --check`、审阅 `git diff --cached --stat` 和 staged diff，确认不夹带其他 Task、他人或无关文件。
5. 使用该 Task 指定中文 Commit；确认成功，再记录 hash 并进入下一个 Task。后续修复单独中文 fix／test 提交，不自动 amend、squash 或重写历史。

## 覆盖映射与执行记录

| 设计章节 | 实施 Task |
| --- | --- |
| §1—2 范围与行为切换 | 1、3、4、7、9 |
| §3 合同价格与水电基础 | 1、2、3、4、8 |
| §4 月度账单、正负费用、备注 | 1、2、4、8 |
| §5 收款、押金与退款撤销 | 1、2、3、5、8 |
| §6 费用及相邻读数更正 | 2、3、5、6、8 |
| §7 退租、取消、资金入口 | 2、3、5、7、9 |
| §8—9 事务、权限与旧数据 | 1、3、4、5、6、7、9、10 |
| §10—11 页面、样式技能、验收 | 8、9、10 |
| §12 中文逐 Task Commit | 全部 Task 的末步及共用提交检查 |

计划编写阶段记录：仅完成计划、源码／scripts／Context7 核对及文档检查。实际实施及验证记录见下文；逐项记录范围、结果、未执行原因及获准后的 commit hash。

计划阶段验证：`git diff --check` 通过；单独检查被忽略的设计与计划文件，无尾空白、冲突标记或占位；10 个 Task 的文件／接口／步骤／中文提交及 Task 8、9 的设计技能要求齐全，金额示例已核算。使用 `turbo run test --filter=@xpense/server --dry-run=json` 核对到 server test 和 shared build 依赖任务；dry-run 不代表实际测试或构建通过。


## 本次执行记录（2026-09-28）

- 授权与流程：用户明确要求按 Task 小队实施及独立评审，确认沿用当前功能分支。范围内可逆实现已授权；未执行暂存、提交、推送、DDL、seed、依赖安装或文件删除／移动。
- 日期策略：用户确认结算中新补建的缺失月份账单到期日为实际结束日；既有账单保留原日期。
- 基线：shared 28 项通过；server 1124 项通过、3 项专用 PostgreSQL 用例跳过；web 703 项通过、2 项合同表单旧文案断言失败，单文件复现 48 通过／2 失败。保留警告与失败证据，Task 8 在相同页面测试范围内同步完整 fixture 和行为断言。
- 预检裁决：取消结算请求允许省略最终读数，由服务端按结束事件判断完整性；FinanceContext 不含无法由 source.read 获取的 actor，写操作单独传入；组织级幂等查重先按组织＋key 读取，再由 service 检查合同／动作／摘要；读数和单价限定 numeric(20,4) 可存储范围。
- Task 1 边界调整：枚举 schema 与生成的 `_rental_monthly_enums` 迁移前移至此 Task，避免共享类型与数据库推导类型断层，未执行迁移；`RentalSettlement` 路由声明移到 Task 9 与真实页面和生成路由一同交付，避免提前产生不存在的导航路径。
- Task 1：实现与独立评审通过，Git 暂存／提交待授权；精确验证记录见下文。Task 2—4 实现及复评通过，Task 5 开始实施，完整计划尚未完成。

### Task 1 验收（2026-09-29）

共享契约、严格 DTO 与 RBAC 完成；两项 Important（预览部分读数、年份零账期）经 RED→GREEN 修复和独立复评闭环。主线程实际复跑 shared 38/38、DTO/legacy/迁移静态 15通过1跳过；修复后 DTO 再次 8/8。三包 check 和 shared/server lint 通过；PostgreSQL 跳过项留待 Task 10，不作为通过。路由声明按执行裁决留待 Task 9 与真实 File Route 一起落地。实现及评审已通过，Git 暂存/提交等待本次明确授权，未执行 DDL。

Task 2 内部来源裁决：snapshot 增加 cancelledOn，由数据库已有 cancelledAt 按组织时区映射。取消结算取稳定事件日期，不用读取当天或起租前一天；不扩展公开 API 或数据库列。Task 7 同事务捕获一次取消时间供快照与持久化使用，来源摘要包含该日期和时区。误判成本为内部类型、source 和生命周期接线调整。

Task 2 末读数身份接线裁决：预览用服务端校验后的完整内存读数副本；确认在幂等和原来源版本校验后，同事务追加真实读数，再以仓储返回的身份计算并保存快照／区间引用。规则不生成持久化 ID，不以任意已有 ID 替代新末读数。来源摘要排除临时 ID、计划行，按表计类型和十进制值规范化请求。无需扩展公开输入或 SettlementPlan；误判成本为内部 service／repository 接线调整，Task 4／7 必须覆盖追加后计算失败的完整回滚。

### Task 2 首轮评审及修复中（2026-09-29）

独立评审指出三项 Important：目标单价覆盖传播到相邻历史账单、两个入口重复租金裁剪职责、缺少计划指定350968/50968结算退款样例。原实施队统一修复，主线程已核对第一项断言级 RED（相邻账单203500而非204000）与修复后5/5 GREEN；其余验收仍在执行，未关闭 Task 2。评审代码图的 tests_for 查询挂起约1504秒，中断后同一评审队以源码完成检查，未把未索引的新节点解释为无影响。真实数据库和 Git 操作仍未执行。

### Task 2 验收与 Task 3 开始（2026-09-29）

三项Important经统一修复及同一Reviewer scoped复评闭环，Spec✅／qualityApproved。新增rental-rent-projection.rules.ts及测试，月度和结算共用原付款计划投影。主线程修复后fresh9文件56/56通过（新规则34＋旧规则22），server check/lint实际执行通过，git diff --check退出0；无目标skip。精确退款样例最终成本149032、首次应退350968、退款300000后50968已由真实规则测试；settlement target补收参与差额，押金应收不计成本。固定费比例公式复用建议作为Minor保留给最终评审。

体量裁决：消除共享租金职责重复后，独立评审接受剩余444行结算规则作为单一SettlementPlan连续编排例外；进一步拆分当前会分散结算专属快照／月度补入协议。误判成本为后续按终末表计及固定费用职责重新拆分并调整测试，不普遍放宽300行原则。

Task 3已交 fresh Executor，保留枚举迁移，只生成finance后继结构及6个仓储；所有真实DDL仍待Task10具体演练范围授权，静态/mock测试显式置空专用库变量以防误运行。两个已验收Task的暂存与本地提交仍等待当前直接授权，未推送／创建PR。

### Task 3 验收与 Task 4 开始（2026-09-29）

Task 3 数据结构与六个仓储经独立评审、同一 Reviewer 定向复评通过：首次发现的读数历史外键缺少精确唯一目标、v2 押金月份类型不合法均已修复，无新增评审问题。完整目标 10 文件 33 项通过、2 项真实 PostgreSQL 测试跳过；server check／lint 实际执行通过，git diff --check 通过。原始修复失败输出、生成产物核验与评审记录保存在本计划 SDD 工作区。

实际 finance 迁移目录为 `apps/server/src/db/migrations/20260929014516_rental_monthly_finance/`，包含工具生成的 SQL 与快照；修复时在临时完整前驱链重新生成，并将完整产物写回原未应用目录。枚举迁移两文件保持不变；SQL 与临时生成件字节一致，自动格式化后快照 JSON 值一致。未执行数据库 DDL；Task 10 必须替换当前跳过用例并验证真实 runner、约束及并发。

Task 4 接续当前稳定产物，实现合同模式、收费配置、底数和月度出账接口。Task 1—3 的末步暂存／提交均未执行，仍待直接授权；所有后续 Task 继续实施与评审。

Task 10 隔离准备裁决：历史首段迁移有 17 处显式 public 引用，不能只设置 search_path。准备仅在临时 SQL 副本中进行固定 SHA、精确位置和可逆字节核验保护的 namespace 重定位，交给已安装的真实 runner；原始迁移、顺序、分句与事务边界不变。全部持久对象与迁移记录限定唯一测试 schema，历史 ON COMMIT DROP 会话临时对象作为未来运行授权中必须明确的例外，目前未获准、未执行。误判成本为测试 helper／授权范围返工；即使演练成功，也不能据此声称原 public 权限或首段原 hash 部署已验证。

Task 4 押金幂等桥接裁决：原押金批次继续使用 generation 表、真实批次 ID 和编号／回放机制，v2 成功事务同时写组织级 FinanceRequests。内部 RequestResult 及 schema JSON 类型增加 generation 分支，不把多张押金批次伪装成单张账单；不扩公开 API 或 SQL 数据结构。各写入口在组织锁内检查另一幂等记录表，避免同组织键跨动作绕过冲突；v1 原算法、响应及自身完成请求回放保留。误判成本为内部结果类型与桥接调用方调整；需要双向冲突、版本前回放和审计失败双表回滚测试。

### Task 4 验收与 Task 5 开始（2026-09-29）

合同模式、默认收费、入住底数、一致来源、月度预览／出账及接口完成。独立评审的 8 项 Important 经原实施队修复、原 Reviewer 定向复评全部关闭，无新增问题，quality Approved。原完整 20 文件 239 项通过；修复与类型／格式收尾后最终受影响 9 文件 69 项通过，server check、441 文件 lint 及主线程冻结后 git diff --check 通过。最终 server 测试和检查实际执行，上游 shared build 使用缓存；真实 PostgreSQL 金额查询／约束／并发和 UI 验证仍留待后续，不作为本 Task 通过证据。

月度覆盖裁决：月度合同列表 coverage 返回 null，生成状态取实际 monthly 来源键；legacy 保留原四项计数。旧 coverage 类型无法准确描述新月度账单，未增加公开计数字段。误判成本为后续月度 UI／查询契约调整，不影响持久数据或金额。

租金分类以 rent_period 行汇总；季度起始月真实租金 900000 分原被批次写为 0，服务／HTTP 失败回归已修复。领域金额／读数错误返回 400；历史链内新增读数被拒绝，旧多空间草稿确认及终止后已完成请求重放保持可用。必需价格验收证明默认 3 改 4 后旧单仍 3，本期覆盖 6 后默认仍 4；读数追加后纯规则失败完整恢复租赁及审计状态。Buffer 克隆比较器失真属于夹具问题，未包装为业务失败。

本 Task 最终范围 47 文件；原 26 个迁移文件均未变、无新增迁移，共享接口未变。纯月度计划 288 行、编排服务 259 行；既有 BillsService 365 行保留同一 v1／v2 批次事务流程，原评审认可其连续职责，最终评审继续核对。Task 4 步骤 1—5 完成，步骤 6 暂存／提交未执行，仍待直接授权。Task 5 接续稳定来源及事务协议，所有后续 Task 继续实施及评审。

后续集成裁决：真实结束读数落在已出账区间内部时保留较晚实测点与原账单身份／到期日／现金；同事务依次插入结束点、按原历史单价修订原收费区间、改接后继前驱，避免立即外键冲突。Task 7 协调结算纯规则及空明细归零修订；误判成本为内部规则／编排／仓储返工，真实写入顺序和回滚仍需 Task 10。结束月之后额外费用／减免的保留策略正在等待用户答复，尚未据此改动金额政策。

Task 5 作用域接线裁决：公开资金请求只带目标或记录 ID，允许先以组织限定的只读定位取得合同 ID；加组织／房产／合同锁后所有资源重读和写入仍严格限定 FinanceScope 与目标 ID，禁止全局仅 ID 查找。投影读取实际结算账单关系，不能猜测全部账单都已关联。误判成本为少量内部查询／调用方调整，不扩公开输入、schema 或金额政策。

### 逐 Task 提交补齐（2026-09-30）

用户明确授权每个 Task 分别 commit 后，主线程按最终评审检查点暂存，保留工作区后续 Task 5 及其他既有修改。Task 1 `28e5530`（27 文件）、Task 2 `9a1935d`（13 文件）、Task 3 `af36b66`（32 文件）、Task 4 `50fc5bc`（48 文件）均已本地提交，未推送。Task 4 的第 48 个路径为 `dto/generate-bills.dto.ts`：将重复 scope 字段移入共用输入形状后其最终内容恰与最初 HEAD 相同，累计差异工具曾漏列；已按相邻检查点纳入实际 Task 4 提交，DTO 相关测试保持通过。

提交前重新执行 shared 全包 38 项通过、服务端 36 文件 345 项通过／2 项真实 PostgreSQL 跳过，均强制执行、无缓存。隔离物化已评审 Task 4 检查点后 server/shared check 与 lint 五个任务实际执行通过（server 441 文件，shared 27 文件），避免未完成 Task 5 的控制器测试影响历史提交验证；git diff --check 和每次 staged diff --check 通过。现有 `.codex` 配置修改保留在工作区，不属于本计划提交。后续 Task 仍须完成实施、独立评审、验证再提交；DDL、推送及 PR 未授权。

### Task 5 实施、复评与提交（2026-09-30）

收款、整额押金、全额退款、撤销、资金列表、账单余额和既有结算投影完成。独立评审的3项Important（精确目标read权限、合法带符号费用抵消、退款撤销及真实投影版本回路）和1项Minor（本次未用仓储API），以及主线程补充的目标写后安全整数问题，均由原小队修复、同一Reviewer定向复评关闭，无剩余问题。最终14文件73项通过，server check、459文件lint、工作区与staged diff check通过，最终Turbo均强制执行、无缓存。真实生产投影返回值可连续用于两次成功HTTP收款；审计故障500为预期回滚测试，不能算异常失败。模拟并发与内存事务不替代Task10真实PostgreSQL演练。

主线程核验33个实际变更路径和已批准快照字节一致后，本地提交 `75a0241`（`feat: 实现租赁账单收款退款登记`）。其他既有配置修改未纳入提交；无推送、DDL或外部账务资金写入。CashService当前538行，同一资金聚合的完整授权、锁、重放和事务编排语义例外经独立评审接受，后续治理列入最终交付热点。财务总计按Task9明确Step5继续承接；Task7仍需真实settlement detail HTTP回路及生命周期衔接。

Task 6 集成解读修正：账单更正 extraFees 遵守“提供完整集合即替换”契约，已有 ID 保留各自 monthly／settlement 来源，新更正条目归 monthly；未提供保留，空数组删除全部。结算来源额外费用也可在受控账单更正入口纠错。此前仅替换 monthly 的控制器交接解读收窄了设计 §6／§7.3，已由独立咨询核对并回到原契约；Task 7 自身结算重算仍只替换 settlement 集合。误判成本为内部纯规则／测试和前端表单初始化调整，不扩大 API、SQL 或结束月之后费用保留策略。

Task 6 并发协议裁决：继续以现有组织→房产→合同聚合锁串行化同合同财务写入，并限定来源与目标组织／合同；暂不仅为 §1.5 形式追加关联读数／账单行锁。当前实现未单独按稳定 ID 获取这些行锁，明确作为计划技术实现差异记录，不宣称已做到。独立评审核对当前完整写协议没有绕过总锁的实际路径；误判或未来移除总锁的成本是新增作用域行锁并复核写入次序。Task 10 仍必须完成真实独立连接并发验证。

Task 6 已完成并独立提交 `df298d2`（`feat: 支持租赁费用更正与读数联动`），精确13个路径。初评三项历史路径、完成键当前结算权限和候选余额已修复；补强相邻候选测试通过真实生产计划及target-only临时变异RED证明，原错误金额说明已撤回。生产冻结21文件141测试通过；最后仅测试增量修改，5文件44测试、server check、lint462文件与工作／暂存diff检查通过，独立复评Approved、开放0。343行服务完整事务职责经评审接受。没有真实PG、推送或迁移；原有两项用户配置修改未暂存。

Task 7 接口协调裁决：结算仓储 create 的内部事件允许可选服务端预分配 UUID，使包含实际结算 ID 的资金版本可在初始快照中正确命名；省略时仍沿用数据库默认 ID，保持旧调用，不接收客户端结算 ID、不改变公开契约或数据库结构。误判成本为内部仓储、类型、测试及服务调用返工；不因此跳过计划要求的投影刷新或最终持久化事实重读，也不单独授权初始修订优化。

Task 7 实施过程修正：实施队曾先写部分结算服务业务体，再补核心测试；发现后已丢弃该未测试业务体，仅保留接口及薄控制器接线，从真实 HTTP 501 功能缺失失败重新实施，未将原代码留作参考。此前已有失败测试的纯规则、仓储及原义务退款修复保留；夹具权限、预置幂等记录等失败单独分类，不冒充金额缺陷。核心结算指定三文件19项已通过（强制执行、无缓存），生命周期、完整回归、独立评审及 Task 7 提交仍待完成；实际结束月之后已确认额外费用的金额规则仍待用户选择。

Task 7 阶段验证：起租前取消已有押金、扣除历史实际退款及审计失败回滚的六文件57项通过；已收款月账单稳定 ID 更正和跨月历史单价裁切的两文件18项通过；完整未来终值仍不可确认、月结终止／撤销分流的两文件13项通过，均为强制执行、无缓存的阶段测试。未提前入库的真实退租读数仍在真实 HTTP 测试中返回400，服务写入编排正在补齐；纯规则通过不替代该流程或 Task 10 真实 PostgreSQL 外键与并发验证。辅助成员仅补独占生命周期单元测试，不改业务源。Task 7 尚未完成独立评审或提交。

Task 7 后续阶段验证：未入库退租点通过内存预览和真实 ID 确认后，原账单按历史价裁切，再改接较晚实测点；具体表计链路回滚测试10项通过，仍仅为模拟事务证据。完成请求重放后返回的当前资金版本可用于真实退款撤销，该新增覆盖首次通过，未将源码怀疑冒充产品缺陷。幂等完成记录先写入同事务再注入审计失败，回滚后原键成功重试且仅一份结果，真实失败／修复后11项通过。读数职责抽取后15项、独占生命周期单元10项通过。额外费用 ID、服务边界、最终回归与用户待定金额规则仍需完成，尚未评审／提交。

Task 7 稳定阶段检查点（NEEDS_CONTEXT）：实际指定23文件266项回归通过；随后只清理新增现金测试三处非空断言，受影响22项再次通过，最新 server check、lint471文件（无警告）及diff检查通过，未把旧整套结果冒称清理后重跑。重复／实际目标账单跨来源费用 ID 拒绝，不额外禁止不同月份账单同 ID；公开资金累计不可安全表示时返回400，未新增收款上限。603行结算服务与314行生命周期服务保留事务职责，176行读数纯规则已拆分，体量例外待独立评审判断。实施成员现停止源写；唯一未决业务项是结束月之后已确认月度额外费用／减免的保留或取消及负账单边界。未决停止标记必须在用户选择后替换，Task 7 尚未独立评审、暂存或提交，Task 8–10 仍待推进。

Task 7 用户例验收与评审时机裁决：已增加“九月房租已收、实收押金1000、水电100、最终差额−900并真实退款后归零”验收，E2E文件17项、check／lint／diff通过。租金计算截止9月30日、10月1日办理退款，不改既有日期策略；负结算净额本来就是正常退款状态。用户再次要求继续后，对稳定26路径先启动独立评审，未决未来月份费用政策单列待答，不视为已经完成的行为。政策落地和修复后仍由同一评审员核对增量及交叉影响，并完整回归，才可完成Task 7及单独提交。误判成本是额外集成评审或遗漏交叉影响，不增加金额政策、Git或Task 8授权。

Task 7 部分独立评审已冻结，确认四项重要问题：插入退租终值缺少后继读数上界校验、作废原押金的公开余额与退款命令不一致、起租前修正日期未重算固定费用覆盖天数、同日读数冲突逃逸为500。主线程核对源码后派发统一修复轮次1，要求逐项真实失败测试、最小修复和同一评审员增量复核；原Task7成员当前运行时无法恢复，复用实际项目Executor并完成只读交接，避免重新实施整项任务。已有26路径检查点及原Task7基线保留，新增账单读取修复仅用于原义务余额一致。未决未来月份费用／减免政策仍等待用户选择，Task7尚未通过完整验收或提交。

Task 7 修复轮次1的定向验证：上述四项均已实际复现失败后修复通过，日期修正还覆盖历史固定费单价／原因、原ID／到期日／现金、消失月份义务归零及真实结算预览→确认→详情金额一致。另经公开入住底数更新→终止合同复现了第五项完整性问题：退租日的底数被错误当成末次读数齐全。修复仅收紧结算完整性判断，不改变底数日期策略，也不从被替换的旧底数推算虚构水费。五项定向验证均通过，整组回归及同一评审员增量复核仍待完成；未来月份已确认费用／减免规则仍未据用户答复确定，未提交Task7。

Task 7 修复轮次1已冻结：最终25文件280项相关回归通过，server check、lint471文件和主线程diff检查通过，实际10路径修复差异包已交同一评审员增量复核。类型／格式中间失败和首次通过的结束日已计费可省略终读覆盖均据原始日志单独记录；源码与测试停止写入，未把模拟数据库证明当成真实PG约束／并发验收。未来月份费用／减免政策仍待用户选择，尚未提交Task7。

Task 7 独立复评确认五项修复均已解决，另发现日期裁剪带来的错误边界问题：原合法减免在租金／固定费取消后使合计为负，现有拒绝及事务回滚方向正确，但公开合同修正返回500而非明确金额校验。第二轮仅修复该响应并补真实接口失败／完整回滚测试，不取消、移动或截断减免，不代替用户选择未来月份费用政策。同一实施员与评审员继续处理，尚未提交Task7。

Task 7 第二轮已获同一评审员确认：新增错误边界问题已解决，本轮新缺陷为零，先前五项保持关闭。最终25文件282项相关测试、check、lint471文件和diff检查通过；连续两次负合计日期更正返回明确400并完整恢复原合同／账单／现金／历史。源码已冻结，主线程保存原Task7基线上的28路径已评审部分差异包；真实PG仍属Task10未执行范围。结束月之后已确认月度额外费用／减免保留或取消的金额政策尚未得到用户答复，Task7整体仍未验收／提交，Task8–10尚待实施。

2026-10-01 Task7 complete：c58c50f feat: 实现租赁合同统一结算。用户明确撤回未来月份账单，按原价转入已发生水电、保留原编号及全部现金历史；独立Spec/quality PASS，新增C/I/M=0，原六发现闭环。最终26文件294测试0cache、server check/lint471、diffcheck通过。32任务路径精确暂存且字节匹配接受快照，用户两处.codex改动未纳入；未推送。真实PG/全分支仍Task10必须完成，20项裁决及Task2 Minor保留。


### Task 8 完成记录（2026-10-01）

已独立提交 `07e3def5d9e295f70fd926ed15911a1ac5045c48`（`feat: 新增租赁月度收费与收退款界面`），精确54个前端路径。收费标准/入住底数、月账服务端预览与正负额外费、独立押金出账、部分收款/全额退款/撤销历史、修订原因和区间快照、真实路由会话接线均完成。初评及实际浏览器新增的I1–I11重要问题由同一实施队修复、同一Reviewer定向复评关闭，源码与约定视觉门禁PASS；M2押金/作废账单仍有不可用更正入口由服务端拒绝，作为非阻断Minor留最终评审。

实际验证：fix3完整37文件276测试；最后两路径日期展示fix4仅按影响运行5文件28测试，未声称最终全37/278已跑。强制check/build3tasks0cache、授权路径Biome、工作/暂存diff及54冻结字节核验通过。完整web lint仍有19个既有错误（10路径与Task8BASE字节一致），原警告/失败日志保留，无弱化断言或无关修复。超过300行的五个业务组件经职责评审接受为连续表单/预览/确认会话例外。

真实浏览器在1440/390、浅深主题验证输入/失效预览/错误/键盘提交/二次退款/撤销原因/历史、独立押金全收及月账生成；九月真实模拟账单92.50、本期水110→120电60→70，费用覆盖Aug31至Sep30，不再把入住底数称上次或合同年底称本期计租截止。Web与真实Nest服务使用回滚内存DB替身，无真实资金转账或PostgreSQL；静态mock汇总不作为全筛选财务查询证据，Task9/10另验。你的两项.codex配置修改未暂存。


### Task 9 实施中记录（2026-10-02，未提交）

结算页面、真实隐藏详情路由、权限增量SQL、全筛选财务身份查询及组织锁内批量事实读取已实施。实际页面点验发现并修复预约终止撤销入口/文案、终止合同收费与底数读取误用写保护、历史结算嵌套快照类型、原关联账单误显示独立待收/可退、列表旧副文案。原账单保留真实本账单收退及撤销历史，当前资金统一在合同结算；后端原单历史金额不改。服务端读取修复由主线程在原后端Agent不可恢复时接管，仍等待独立Task9评审。

本轮前端29文件165项测试通过，server结算HTTP25项通过（含历史快照金额/日期加强断言），三包check/build6tasks0cache通过，58个授权TS输入的Biome实际检查57文件通过（生成路由文件被忽略），git diff --check通过。server整包lint此前在读取修复后474文件通过；web整包仍19个既有错误/1警告/2提示，均在8个与Task9基线字节一致路径，未扩大修改。权限SQL只生成/静态验证，真实迁移和并发尚未运行。

本地模拟数据通过正常页面操作验证：未来终止不可提前确认结算及正常撤销；实际Sep30退租撤回Oct账单、保留原预收；确认Set不自动退款；全额2800退款→撤销恢复应退→重新登记→结清后原月账减免100→再次应退100→第二笔退款后有效已退2900/成本400/结清。1440/390浅深主题、非法金额/空撤销原因、键盘提交及历史版本已实际核对，原账单ID和资金事实保留。此证据使用真实HTTP服务与内存仓储替身，不能冒充PostgreSQL或真实转账；只读账号权限视觉验收尚等夹具验证码确认。

Step5用户已明确选择A：实际关联结算的整个合同有效现金与独立匹配账单现金按ID并集统计；各结算余额只统计一次，原关联单不重复累计，不跨合同抵消。公共totals.financial四字段及前端分组展示已接入，费用构成仍按完整筛选，空分页不改变汇总，无新版财务事实时省略未知字段。最新前端29文件167测试、服务端11文件104测试（另1真实PG占位跳过）、三包check/build通过；模拟费用汇总seam修正另4文件36测试及servercheck/lint通过。独立Task9评审正在进行，已发现退款二次确认缺失待统一修复；最新统计视觉及只读权限仍待核对。Task9未验收/暂存/commit，Task10未开始，按原约定逐Task独立提交。

2026-10-02 Task9评审修复：独立初评C0/I4/M2，六项分别是全额退款缺少二次确认、在途旧预览回写、命中缓存合同切换沿用旧预览、未知撤销后换流水仍发原目标、费用名称错误无提示、无confirm权限仍发送预览。自然6失败6通过后修复，29文件172通过，web check/build通过。复评原六项闭合，新增I-F1：草稿改变会解锁在途confirm；用preview/confirm操作状态分离、确认期间fieldset禁用及提交守卫修复。新测试先因selector多匹配失败不算自然RED，修正role后1失败5通过，修复后结算6文件19通过、check/build3任务0缓存、相关12文件lint通过、diff-check通过。新范围复核尚待完成，未提前标记Task9验收或提交。editor324行仍为完整单职责表单及预览确认流程，按项目体量原则保留例外。

全三包预检（fix1源版本）shared13文件38通过、server154文件1394通过4真实PG跳过、web115文件812通过，Turbo4任务0缓存；fix2只改editor两路径，由目标19测试补验，不冒称fix2后再次全量。Task10真实库占位仍未替换/演练/验收。当前14段迁移的首段固定SHA与17个public引用重新核对，其余13段无显式public引用；这只是隔离准备证据，无DDL。

实际UI仍待修后退款弹窗补验：当前模拟房东登录已填公开夹具手机号与密码、验证码留空，等待电脑操作工具规定的本次明确许可。Chrome localhost5174现有账号账单读取仍失败，尚无可靠服务日志根因，未执行迁移补救。Task1–8独立提交保持；Task9通过源、工程及视觉门禁后独立提交，再推进Task10真实迁移/并发；未暂存无关.codex变更、运行生成缓存、忽略的工作日志，未执行DDL、seed、安装、推送或PR。

Task9最终范围独立复核（2026-10-02）：I-F1闭合，无新增C/I/M；本轮源码计划、工程门禁均PASS，root亲读报告并核对60路径SHA一致。整体实际退款确认弹窗验收仍等待本次模拟登录验证码许可，Task9未标完成/未暂存提交。无需重复早期已完成的Task或重做整段评审；获当前步骤许可后补取消、二次确认及键盘Enter的实际页面证据，通过即按Task9精确路径独立提交，再实施Task10。

Task9完成并独立提交：`a5db6cc3afbfe3a53e83d900ad86bc2b1790d8a9`（feat: 完成租赁退租结算与账单联动界面），精确60路径；fresh web173/server101通过1真实PG占位跳过、server/web checkbuild5任务通过、owned57及server474 lint通过，wholeweb19既有错误未改。用户确认本次mock CAPTCHA后，实际refund首次仅Dialog/返回无写/Tab+第二Enter2800结清及1440light390dark通过，旧撤销资金与结算历史保留，截图已归档。源与工程独立复评通过，视觉门禁闭合，未执行DDL/seed/push/PR。Task10现进入无DB连接的PhaseA准备。


### Task 10 准备与修复记录（2026-10-02，未提交）

全流程 HTTP 回归已覆盖新合同、默认收费与入住底数、押金全收、带备注负额外费用、两次部分收款、历史读数联动两期、预约与撤销、退租补月、全退、再次费用更正和退款撤销。使用真实控制器/服务与内存仓储替身，不作为 PostgreSQL 事务证明。迁移测试已替换无条件跳过占位，真实并发接入实际服务、仓储、审计和事务 provider，设置真实锁后的 barrier 并观察独立 backend 的 Lock 等待。

独立初评发现清理查询漏掉未枚举 catalog 的外部依赖（I1）；主线程先补静态结构失败回归，再改为完整依赖闭包、未知归属拒绝和本次 TOAST 所有权核对，并准备两个独立 owned schema 的 operator 负例。同一 Reviewer 已完成定向复评：Spec/Engineering PASS，C0/I0/M0，I1闭合；真实负例仍未运行。原迁移内容未改；临时副本仅首段固定 SHA 对应17处 namespace 引用可逆迁移，其他13段字节不变，由已安装真实 runner 执行。此方式不证明原 public ACL/首段原 hash 的部署。新增测试专用环境变量在 `.env.example` 留空，server test.env 明确传入，未加载业务 DATABASE_URL。

修复后定向5文件15通过/11真实PG跳过、server check通过、13路径中的12个TS/JSON精确lint通过（env示例人工检查）、diff检查通过。新增清理负例及修复后最新 server全量158文件1402通过/14跳过，其中3项是既有旧PG演练，11项是Task10必需真实用例。专用URL和执行标志均置空，未连接数据库。

三包完整检查/构建6任务通过；shared全量38通过。首轮web全量812通过/1项合同日历定位失败；未改源码后该50项测试文件及web全量813项均复测通过，首次日志保留，未认定根因已修复。whole lint shared27/server481通过；web仍19项既有错误/1警告/2提示，实际诊断路径均与Task10基线一致，未扩大修复。页面实际模拟视觉与键盘证据沿用已接受Task8/9记录，没有真实资金转账。

Task10必需真实用例为2迁移+9并发/清理，每轮创建12个随机测试schema（10个迁移/业务场景加负例2个）；历史组织菜单迁移还使用会话TEMP ON COMMIT DROP。迁移、合成数据及仅本次归属验证后的schema清理须获得明确许可后执行。当前无DDL、seed、role/ACL变更、暂存、Task10 commit、push或PR；无关.codex改动和生成缓存保留。全分支最终评审仍待真实演练结果。

2026-10-02 14:48，用户明确确认上述Task10演练范围，授权11用例、每轮12随机测试schema、迁移/合成DML/清理负例/历史TEMP自动DROP及仅本次归属核验后的清理和必要定向复测。当前进程、根.env及server环境文件没有专用RENTAL_MIGRATION_TEST_DATABASE_URL；已请求本机配置位置，不索取连接串，不回退业务DATABASE_URL。获许可不等于已执行；Task10仍待实跑及最终门禁。


### Task 10 实际数据库与最终回归（2026-10-02）

用户明确指定本地 .env 并允许配置测试连接。专用 RENTAL_MIGRATION_TEST_DATABASE_URL 已在 git 忽略的 .env 中显式配置；测试没有运行时 DATABASE_URL 回退，公开示例只保留空值。已获准的独立 schema 演练采用实际安装的迁移 runner，在 PostgreSQL 18.4 上运行14段迁移、旧11段数据升级及11项真实用例；第二轮两文件19项（8静态/接线＋11真实）通过、零跳过。第一轮17通过2失败源于测试把输入 JSON 字符串当数据库 numeric 格式、以及对无顺序契约的查询数组强加次序；仅修正这两处测试期待，完整ID行集合、金额、旧价、现金、外键和回滚断言保留。两轮共24个本轮创建的随机 schema 都完成受控清理；后续独立只读检查本轮标记 schema 和测试连接均为零。

真实并发涵盖最后余额收款、押金全额、全额退款、共享读数联动、双结算确认及结算与旧账单收款；另覆盖审计故障全部回滚、未来账单撤回与旧价计量区间转移，以及跨 schema operator 依赖拒绝清理。使用不同真实 backend 和锁后 barrier，观察 Lock 等待；这是代表性固定起跑顺序，未声称穷举调度。原 migration 文件未变，仅首段临时副本17个 public 引用经固定 SHA 和可逆核验重定位，其余13段原字节保留。因此不证明原 public ACL、首段原 hash 部署或其他 PostgreSQL 版本。

最终强制、无缓存的三包 test/check/build 共9任务成功：shared 13文件38项、server 158文件1402项通过（全套专用变量明确空，14项数据库用例跳过；其中本次11项已单独真实执行，另外3项旧用例不扩大执行授权）、web 116文件822项通过。共享 lint 27文件、服务端483文件通过。网页 lint 仍有19个既有错误、1警告和2提示，9个诊断路径与 Task10 基线字节一致；新增5个更正表单文件 lint 无诊断。首次全套网页回归的单次日历 grid 等待失败保留原日志，源码未改的单文件及完整回归再次通过，未声称找到其根因或修复无关问题。

完整独立评审先发现1项 Important：历史读数、单价和固定费用更正缺少实际页面输入。根线程观察3项真实交互失败后补齐5个表单/字段/测试文件，相关15项通过；只从账单历史快照初始化，只提交明确改变的读数或费用，固定费保留原ID、租金不可改，金额和相邻账单/结算影响仍由服务端预览。379行主弹窗保留一个完整确认、权限、迟到响应及原请求重试会话；纯模型和完整字段区域已分拆。既有两个 Minor 保留：比例计算重复可能带来未来舍入漂移；押金/作废账单显示更正入口但服务端拒绝，属于可用性问题。

当前同一 Reviewer 正在定向复核新源增量；实际页面核对因内置标签页停在不可操作的内部连接错误页，已请求用户手动恢复并登录。未绕过浏览器安全策略。Task 10 的页面门禁、最终文档收尾及独立提交仍未完成，不把源码或数据库通过冒称整项完成。

### Task 10 增量复核、页面门禁与最终门禁（2026-10-02，续）

**I1 增量独立复核（同一 Reviewer，独立上下文，未改动任何文件）。** 复核对象：`bill-revision-form.ts`、`bill-revision-charge-fields.tsx`、`bill-revision-form.test.ts` 新增，`bill-revision-dialog.tsx`（−96/+37）、`bill-revision-dialog.test.tsx`（+222）。结论：要求 1—8 全部符合，**C0／I0／M3**。逐项证据：只从账单历史快照初始化（`bill-revision-form.ts:82-87,90-126`，更正路径无 `getChargeTerms`）；只提交明确改变项（`:32-65,248-263,268-269`）；固定费按原 `feeId`、租金不可改、金额只由服务端预览决定（`:104,255-260`；`bill-revision-charge-fields.tsx:61-191`）；多段计量共享边界去重、两个不同边界显式拒绝、多段禁改日期（`:199-216,180-187`；UI `charge-fields.tsx:131`）；读数取值域精确等于 `numeric(20,4)` 上限（`:67-73`）；会话、迟到响应与未知结果重试原键契约未变（`dialog.tsx:52-56,104-113,152-189`）。实际命令：目标 2 文件 **19 项通过**；`vitest run src/features/rental/bills` **16 文件 93 项通过**；web check 通过；5 个文件 Biome 0 诊断；`git diff --check` 退出 0。报告：`.superpowers/sdd/2026-09-28-rental-monthly-billing-settlement-implementation/task-10-increment-review.md`。

保留 Minor（未修，未改变行为）：M1 前端 `decimal4` 接受前导零（`form.ts:69`），服务端 schema 拒绝，界面只显示通用“更正预览失败，请重试。”，属沿用既有 `monthly-bill-form.ts` 约定且失败安全；M2 `charge-fields.tsx:62` 的 fieldset 无 legend、无水电与固定费时渲染空 fieldset；M3 `bill-revision-dialog.tsx` 379 行超过 300 行原则（相对 HEAD 净减 59，已记录单职责表单会话例外）。另记录未验证风险：`RevisionSession` key 仅组织＋账单 ID，用户编辑过表单后后台刷新不会更新草稿，旧值会被当作“明确改变”提交（服务端预览与 `expectedVersion` 取自已重算预览，未构造端到端失败用例）。

**页面与授权门禁（本轮首次改为全自动、无新增依赖）。** 用本机 `chrome-headless-shell`（Playwright 缓存内已安装二进制）经 CDP 驱动，配合既有内存 HTTP harness（真实 Nest controller／service，数据库 provider 在 Nest 初始化前替换；未连接 PostgreSQL、无真实资金转账）与自建 Vite dev server（API `127.0.0.1:5201`、Web `127.0.0.1:5200`）。owner 走真实登录表单（公开夹具手机号＋`test` 验证码，未注入认证状态、未绕过验证码）。实际观察：

- 弹窗“账单更正与历史”出现“历史水电读数与单价／已保存固定月费／修订历史”三段；字段全部来自账单快照：上次水表读数 100、本次 110、水费单价 3.0000、本次读数日期 2026/08/31；电表 50／60／4.0000；物业费固定月费 50（原 `feeId`）；清洁费 +20 与本月减免 −10 含备注；更正原因可填。
- 越界输入“115.00001”只在字段内提示“请输入非负读数，最多四位小数。”、`aria-invalid=true`、不产生预览、“确认更正”禁用。
- 合法更正（原因＋本次电表读数 60→70）触发服务端预览“应收 CNY 130.00 → CNY 170.00”，确认按钮可用。
- 键盘：从更正原因起按 Tab 3 次依次聚焦“关闭”→“重新预览”→“确认更正”，Enter（`rawKeyDown`＋`char`＋`keyUp`）直接提交，弹窗关闭；提交后账单详情应收 170.00、`revision=2`、电费行“电表 50 → 70 CNY 80.00”；`GET /rental-bills/revisions` 返回 1 条历史（第 1 版 CNY 130.00，原因“页面门禁：更正电表读数”），弹窗修订历史实际渲染该条快照。
- 主题与宽度：1440 浅色／深色、390×844 浅色／深色截图均已人工核对；390 下 `documentElement.scrollWidth === innerWidth === 390`，无横向溢出；Esc 可关闭弹窗。
- 只读账号（`13800000003`，viewer）：账单详情无“更正账单”和“登记收退款”入口，仅读到应收 170.00，未发起任何写请求。

证据：`task-10-visual/*.jpg`（12 张）、`task-10-visual/task-10-visual-owner-report.json`、`task-10-visual/task-10-visual-viewer-report.json`、`task-10-visual-api*.log`；驱动脚本 `task-10-visual-lib.mjs`、`task-10-owner.mjs`、`task-10-viewer.mjs`、`task-10-visual-server.ts`（均在忽略的 SDD 目录，未进入提交）。边界：内存 harness 不能作为 PostgreSQL／真实转账证据；两段旧价的**页面**渲染仍由 `bill-revision-dialog.test.tsx` 断言覆盖，本轮页面证据是单区间账单＋固定月费＋正负额外费用；CDP 首次鼠标点击需重试、Enter 需 `char` 事件才触发默认动作，属工具环境差异，不是产品缺陷。

**既有失败（与本增量无关，按用户裁决记录并继续）。** `apps/web/src/components/layout/authenticated-layout.test.tsx > AuthenticatedLayout > 在退出请求失败且壳层卸载后仍显示全局错误反馈` 稳定失败：“网络异常，请检查网络连接”出现 2 个 toast（断言要求 1）。独立复核确认与该增量无因果关联：该用例依赖图内文件均与 HEAD 字节一致，且 `components/layout`、`routes/-shared`、`web-session`、`auth-store` 均不引用 `features/rental`。来源收敛到紧邻前序用例 `authenticated-layout.test.tsx:641-676`——它是该文件唯一未注入 `MockAdapter` 实例、会真实请求 `http://localhost:4000` 的会话，其提示残留到下一用例。本机 4000 端口当前有正在运行的 API，故该文件在本环境稳定失败，而今日早先两轮全量回归（`task-10-final-all.log` 822 项全通过、`task-10-final-all2.log` 仅房产移动超时）中它通过。未修改该文件、未弱化断言。建议（未执行，需单独授权）：为前序用例注入 mock 实例，或在 `afterEach` 清理 sonner 全局 toast。

**最终门禁（本轮实际执行，全部 `--force`、无缓存，专用数据库变量显式置空）。**

- `turbo run test --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web`：shared 13 文件 38 项通过；server 158 文件 1402 项通过／14 项跳过（本次 11 项必需真实用例已在 PostgreSQL 18.4 演练中单独执行通过，另 3 项为既有旧 PG 用例，不扩大执行授权）；web 825 项通过／1 项既有失败（即上文 `authenticated-layout`）。日志 `task-10-final-all4.log`。
- `turbo run lint check build --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web`：shared／server 的 lint、check、build 全部通过；web check／build 通过，web lint 仍为 19 项既有错误、1 项警告，全部位于 `src/components/ui/multi-select.tsx`、`src/components/layout/page-cache-host.tsx`、`src/context/search-provider.tsx`、`contracts/steps/*` 等既有文件，与 Task 10 基线一致；本次增量 5 个文件在整包 lint 输出中 0 诊断（同一 Reviewer 单独 Biome 复核亦为 0）。日志 `task-10-final-lintcheck4.log`。
- `git diff --check` 通过；未执行 DDL、seed、推送或 PR；账户、流水与核心交易未被本次改动触碰。
- 剩余风险：真实 PostgreSQL 演练证据限于 PG 18.4 与临时副本首段 namespace 重定位，不证明原 `public` ACL、首段原 hash 部署或其他版本；内存事务不能替代真实并发；结束月之后额外费用／减免策略已在 Task 7 按用户直接要求落地，本轮未再改动金额政策。

Task 10 独立提交：`679ffec`（`test: 补齐租赁收费与结算回归验证`）。实际暂存 20 个路径＝本 Task 的 18 个代码／测试／配置路径＋本计划与被忽略的设计文档（`git add -f`）；用户自己的 `.codex/README.md`、`.codex/agents/Reviewer.toml` 改动与生成缓存 `apps/web/.tanstack/` 未纳入。`git diff --cached --check` 通过，提交后分支 `feature/rental-billing` 领先 `origin/feature/rental-billing` 10 个提交，未推送、未创建 PR。

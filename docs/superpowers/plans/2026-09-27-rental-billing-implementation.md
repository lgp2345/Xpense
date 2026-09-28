# 租赁合同应收账单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 从合同手动预览并生成全租期租金及独立押金应收，提供账单查询和可追溯的合同生命周期联动。

**Architecture:** 在现有 RentalModule 内增加账单计算、查询和写入边界，正常生成由账单 service 控制事务，合同动作调用接受同一事务的联动 provider。前端使用服务端预览和现有 API、查询缓存、路由 descriptor。账单不写核心交易或资金流水。

**Tech Stack:** 仓库现有 NestJS 12、Fastify、Drizzle ORM 1.0.0-rc.4、PostgreSQL、Zod 4、React 19、TanStack Router/Form/Query、Vitest、pnpm 10.30.2 与 Turborepo；不升级或安装依赖。

**Spec:** `docs/superpowers/specs/2026-09-27-rental-billing-design.md`（已确认，执行者必须先读）。

**Status:** 实施计划待审阅及选择执行方式；用户已明确要求并授权每个 Task 完成后使用中文单独提交。本文没有执行其中的代码任务。

## Global Constraints

- 租金金额、账期、到期日严格按合同计算，不允许手动改写。
- 每项押金独立成单，与租金分开；到期日生成预览时手动指定。
- 一次生成整个租期，重复操作不得重复记账。
- 持久化状态仅为 `active`（有效）和 `voided`（已作废）。
- 不推断实收、欠款或逾期未付，不写核心交易、账户流水和押金资金流。
- 所有业务日期为组织时区下的 `YYYY-MM-DD`；区间包含首尾日。
- 金额使用组织基础币种的整数最小单位；计算中使用整数比例，片段结果四舍五入，禁止浮点金额。
- 预览每页最多 100 张账单，确认生成全部计划而非当前页。
- 合同修正与账单作废、终止与账单调整必须在同一事务内完成。
- 所有数据访问限定当前组织，快照不携带完整证件等敏感信息。
- 不引入 `forwardRef()`、运行时业务依赖查找、通用收费引擎、定时器或队列。
- 新业务文件原则上不超过 300 行；不重构无关既有大型文件，不手改 `routeTree.gen.ts`。
- 不运行全局格式化；只清理由本次修改产生的无用内容。
- 用户已授权每个 Task 完成后的精确暂存及本地 commit，无需逐次重复确认；每个 Task 必须单独提交，不能合并多个任务后统一提交。
- 提交说明采用项目规定的类型前缀加中文主题，例如 `feat: 新增租赁账单生成服务`；如有正文，使用中文说明修改与验证。
- 安装依赖、修改 lockfile、运行 migration、实际 seed、文件删除/移动、推送和创建 PR 等操作仍不在当前授权内；准备可审阅产物后再按根 AGENTS.md 请求必要授权。

### 每个 Task 的提交检查

1. 完成该任务要求的实现、测试和验证；失败或受阻时如实记录，不把未完成任务标记为已完成。
2. 更新任务执行记录，记录实际运行的验证及结果；未执行项注明原因，不将跳过视为通过。
3. 运行 `git diff --check`，审阅本次任务 diff、敏感信息及提交文件范围。
4. 按具体文件路径暂存本任务代码、测试及必要文档，不使用全仓库暂存命令，不夹带他人或无关改动；审阅 staged diff 并运行 `git diff --cached --check`。
5. 使用该 Task 末尾指定的中文说明提交，确认提交成功并记录 commit hash，再进入下一 Task。commit hash 在本地执行记录或交付说明中追加，不为把当前提交自己的 hash 写入同一提交而反复 amend。
6. 后续评审发现的问题使用单独中文 `fix:` 或 `test:` 提交，不擅自 amend、squash 或重写已经完成任务的历史。

## Review Focus

1. 预览后用户切换组织或另一窗口更新合同，旧响应与旧确认不得写入新组织或变化后的合同（任务 4、7、8）。
2. 同内容多项押金有不同到期日，重排与底层 UUID 重建不能重复收费；删除一个同内容项须确定性保留较小出现序号的有效账单（任务 2、5）。
3. 网络超时后原请求其实已提交，即使之后合同被修正，重试也只能返回原批次并展示其当前历史状态，不能生成替代账单（任务 4、7）。
4. 先终止后首次生成、撤销后同日再次终止，调整记录只能匹配当前终止事件（任务 5、6）。
5. 已有组织的自定义菜单和角色不应被新增功能重置；真实 PostgreSQL 测试被跳过不能被报告为并发验证通过（任务 3、10）。

## 文件与接口安排

以下路径以仓库根为基准。先建立共享契约，再实现纯规则、数据库与仓储，最后连接服务和页面。类型名和方法名按本节统一，避免各任务自行发明接口。

| 位置 | 职责 |
| --- | --- |
| `packages/shared/src/rental-bills.ts` | 对外费用、账单、明细、预览、生成与终止预览类型 |
| `apps/server/src/modules/rental/billing.types.ts` | 内部计算来源、草案及计算计划 |
| `apps/server/src/modules/rental/billing-period.rules.ts` | 月锚点、片段、付款分组及金额 |
| `apps/server/src/modules/rental/billing-source.rules.ts` | 押金来源键与计费指纹 |
| `apps/server/src/modules/rental/billing-termination.rules.ts` | 终止当期定位、参考折算及差额 |
| `apps/server/src/db/schema/rental-billing.ts` | 批次、账单、明细、调整、编号序列 |
| `apps/server/src/modules/rental/bills.repository.ts` | 账单与批次持久化、作废及编号 |
| `apps/server/src/modules/rental/bills.queries.ts` | 账单列表、详情和汇总查询 |
| `apps/server/src/modules/rental/bill-adjustments.repository.ts` | 终止确认记录读写与撤销 |
| `apps/server/src/modules/rental/billing-source.service.ts` | 在已有 executor 内读取一致来源，不启动写事务 |
| `apps/server/src/modules/rental/bills.service.ts` | 预览及生成事务编排 |
| `apps/server/src/modules/rental/bills-read.service.ts` | 列表、详情、到期提示和安全响应 |
| `apps/server/src/modules/rental/billing-lifecycle.service.ts` | 同一事务内处理合同动作的账单影响 |
| `apps/server/src/modules/rental/bills.controller.ts` | HTTP、DTO 和声明式权限 |
| `apps/web/src/services/rental-bills-api.ts`、`rental-bills-query.ts` | API 请求与组织隔离查询键 |
| `apps/web/src/features/rental/bills/` | 预览表单、合同账单区、统一查询与详情 |

### 对外契约（任务 1 定义）

- `RentalBillType = 'rent' | 'deposit'`；`RentalBillStatus = 'active' | 'voided'`。
- `RentalBillDueState = 'upcoming' | 'due_today' | 'date_passed'`，仅对有效账单派生；作废账单为 null。
- `RentalBillLine`：`kind: 'rent_period' | 'deposit' | 'termination_adjustment'`、`label: string`、`amountMinor: number`、`periodStart/periodEnd/referenceStart/referenceEnd: string | null`、`coveredDays/referenceDays: number | null`、`baseRentAmountMinor: number | null`、`sortOrder: number`。
- `RentalBillSummary`：`id/billNumber/contractId/contractNumber/propertyId/propertyName/currencyCode: string`、`type/status`、`sourceKey: string`、`periodStart/periodEnd/effectiveEnd: string | null`、`dueDate: string`、`amountMinor: number`、`dueState`、`createdAt: string`。
- `RentalBillDetail` 扩展 summary：`lines: RentalBillLine[]`、生成批次/终止调整 ID（可空）、生成时房产/空间/承租人安全快照、作废原因/时间/操作者（可空），以及同来源历史 summary。快照空间复用共享路径类型，承租人只保留 ID、姓名与主要付款人标记。
- `RentalBillAdjustment`：`id/contractId/terminationDate/terminationRecordedAt/periodStart/periodEnd: string`、`originalAmountMinor/referenceAmountMinor/finalAmountMinor: number`、`reason/createdAt: string`、`revokedAt: string | null`。
- `RentalBillTotals = { rentAmountMinor: number; depositAmountMinor: number }`。
- `RentalBillCoverage = { existingRentCount: number; existingDepositCount: number; missingRentCount: number; missingDepositCount: number }`，按完整合同适用计划计算，不受列表状态或分页筛选影响。
- `ListRentalBillsQuery`：可选 `contractId/propertyId/keyword/type/status/dueDateFrom/dueDateTo/page/pageSize`；`RentalBillPage` 在现有 `PageResult<RentalBillSummary>` 上增加 `totals`（筛选结果中的有效账单金额）及 `coverage: RentalBillCoverage | null`（仅传 contractId 时返回）。只读用户可据此看到需补齐数量，无需调用要求 generate 权限的预览接口。
- `RentalBillGenerationInput`：`contractId: string`、`depositDueDates: Record<string, string>`（键为稳定 sourceKey）、可选 `terminationConfirmation: { finalAmountMinor: number; reason: string }`。
- `PreviewRentalBillsRequest`：生成 input，加可选 `expectedVersion/page/pageSize`；`GenerateRentalBillsRequest`：生成 input，加必填 `expectedVersion/idempotencyKey: string`，不含分页。
- `RentalBillPreviewItem`：费用类型、sourceKey、账期、effectiveEnd、到期日（未填押金时可空）、金额、明细、`disposition: 'create' | 'existing'` 和 `existingBillId: string | null`。
- `RentalBillPreview`：预览项的 `PageResult`、`version: string`、`canGenerate: boolean`、`createCount/existingCount: number`、`totals/createTotals: RentalBillTotals`、需补日期 sourceKey 数组、可空终止参考（原始/参考金额及账期）。
- `RentalBillGenerationResult`：`generationId: string | null`、`createdCount/existingCount: number`、`totals: RentalBillTotals`、`replayed: boolean`；重放返回原批次统计，最新状态通过列表读取，不返回无界 ID 数组。
- `PreviewRentalTerminationRequest = { contractId: string; terminationDate: string }`；`RentalTerminationPreview`：`version: string`、原付款账期、原始/参考金额、受影响账单计数及 `requiresConfirmation: boolean`。
- 扩展 `TerminateRentalContractRequest`：可选 `billingConfirmation: { expectedVersion: string; finalAmountMinor: number; reason: string }`；运行时是否必填由现有账单状态决定。

### 内部契约（任务 2、3 定义）

- `BillingTerms`：startDate/endDate、rentAmountMinor、billingAnchor、paymentIntervalMonths、dueDaysBefore，均为已确认合同非空值及现有共享枚举。
- `BillingDraft`：type、sourceKey、periodStart/periodEnd/effectiveEnd（可空）、dueDate（未填押金可空）、amountMinor、lines，以及可空押金来源 UUID/快照。
- `BillingPlan = { drafts: BillingDraft[]; totals: RentalBillTotals }`。
- `BillingSource`：`organizationId/currencyCode/timezone/today: string`、`contract: RentalContractDetail`、`terminationRecordedAt: string | null`、`activeBills: RentalBillDetail[]`、`adjustment: RentalBillAdjustment | null`。金额计算先校验合同状态并收敛为 BillingTerms。
- `BillRecord/GenerationRecord/AdjustmentRecord` 为新增 schema 的推导 select 类型，`NewGeneration/NewAdjustment` 为相应 insert 类型，统一放在 `bills.repository.types.ts`；不得从共享包导出。Generation 增加 `origin: 'manual' | 'termination'` 区分生成入口；终止内部批次以新 UUID 为幂等键，不与客户端请求共用键。
- `PersistableBillingDraft` 为 BillingDraft 收窄 `dueDate: string` 并增加 `adjustmentId: string | null`，仅在输入完整且版本验证通过后构建。
- `BillingWriteContext = { organizationId: string; userId: string; today: string }`。

---

## Task 1：共享契约与可校验输入

**Files:** 创建 `packages/shared/src/rental-bills.ts`、`rental-bills.test.ts`；修改 `index.ts`、`rental-contracts.ts`、`rbac.ts`、`rbac.test.ts`、`menu.ts`。创建服务端 `dto/preview-bills.dto.ts`、`generate-bills.dto.ts`、`list-bills.dto.ts`、`bill-detail.dto.ts`、`preview-termination.dto.ts`、`billing.dto.test.ts`；修改 `dto/terminate-contract.dto.ts`。

**Interfaces:** 产出上述共享契约；各 DTO 输出类型由各自 schema 推导，schema 命名为 `previewBillsSchema/generateBillsSchema/listBillsSchema/billDetailSchema/previewTerminationSchema`。新增权限 `rental_bills:read/generate/adjust`，RouteKey `RentalBills`、`RentalBillDetail`。

- [x] 先写枚举、请求及 schema 失败测试：金额非法、额外字段、日期不存在、分页超限、普通生成试图提交租金金额均被拒绝；终止最终金额零合法。核心断言：`expect(generateBillsSchema.safeParse({ ...validInput, rentAmountMinor: 1 }).success).toBe(false)`；`expect(listBillsSchema.safeParse({ pageSize: 101 }).success).toBe(false)`。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/shared --force` 和 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/dto/billing.dto.test.ts`，确认新增测试因未实现而失败，记录失败证据。
- [x] 实现契约、schema 与中文 JSDoc，复用现有严格日历日、UUID、分页约定；终止扩展字段整体可选，金额为 0 至 MAX_SAFE_INTEGER，原因去空白后 1–1000 字符。权限与路由声明一次到位，不启用业务入口。
- [x] 重跑同一组测试至通过，再运行 `pnpm exec turbo run check --filter=@xpense/shared --filter=@xpense/server`。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 新增租赁账单共享契约与输入校验"`。

## Task 2：纯账期、押金身份与终止计算

**Files:** 创建 `billing.types.ts`、`billing-period.rules.ts`、`billing-source.rules.ts`、`billing-termination.rules.ts` 及各自 `.test.ts`，均位于 `apps/server/src/modules/rental`；复用 `contract-date.rules.ts`、`contract.rules.ts`，仅在需要导出现有纯日期能力时做最小修改及回归。

**Interfaces:** `buildRentPlan(terms: BillingTerms): BillingPlan`；`buildDepositDrafts(terms: RentalContractDepositTerm[], dueDates: Record<string,string>): BillingDraft[]`；`billingFingerprint(source: BillingSource, input: RentalBillGenerationInput): string`；`calculateTerminationReference(terms: BillingTerms, terminationDate: string): { periodStart: string; periodEnd: string; originalAmountMinor: number; referenceAmountMinor: number; lines: RentalBillLine[] }`。

- [x] 写固定值测试：3,000 元、2026-09-15 至 10-20、起始日月付，`expect(plan.drafts.map(x => x.amountMinor)).toEqual([300000, 58065])`；自然月季付首期至 11-30 金额 760000；2026-01-31 锚点下一月为 02-28，第三月恢复 03-31，禁止滚动成 03-28。
- [x] 补充所有付款周期、闰年、单日、四位年份边界、零额舍入及安全整数溢出；季度终止参考覆盖整个付款账期。押金测试复制 UUID、重排、倍数规范化 `1.0/1.0000`、完全重复项；断言 sourceKey 集合不变。指纹规范化对象键顺序并排除纯显示排序，禁止靠 JSON 输入顺序比较。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/billing-period.rules.test.ts src/modules/rental/billing-source.rules.test.ts src/modules/rental/billing-termination.rules.test.ts`，记录失败后实现整数比例、片段末日和按原始日号计算的锚点算法。
- [x] 将来源键规范化实现留在服务端；预览和写入调用同一算法。计费指纹包含规则版本常量，且相关账单按 sourceKey 排序后参与版本摘要；完整证件不进入输入。
- [x] 重跑目标测试及原 `contract.rules.test.ts`、`contract-date.rules.test.ts`，全部通过后交付纯规则边界。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 实现租赁账期与应收金额计算规则"`。

## Task 3：持久化、唯一约束及增量权限菜单

**Files:** 创建 `apps/server/src/db/schema/rental-billing.ts`、`rental-billing-migration.integration.test.ts`；修改 `schema.ts`；创建 `apps/server/src/modules/rental/bills.repository.ts`、`bills.queries.ts`、`bills.repository.types.ts`、`bill-adjustments.repository.ts` 及仓储测试。修改 `apps/server/src/db/seed-rbac.ts`、`seed-rbac.test.ts`、`apps/server/src/modules/iam/rental-menu-template.ts`、`menu-template.test.ts`；新增带 `rental_billing` 业务名的生成 migration/snapshot。

**Interfaces:** `BillsRepository.findGeneration(organizationId: string, idempotencyKey: string, executor: AppDbExecutor): Promise<GenerationRecord | null>`；`createGeneration(input: NewGeneration, executor: AppDbExecutor): Promise<GenerationRecord>`；`insertBills(context: BillingWriteContext, source: BillingSource, generationId: string, drafts: PersistableBillingDraft[], executor: AppDbExecutor): Promise<BillRecord[]>`；`voidBills(context: BillingWriteContext, billIds: string[], reasonCode: string, executor: AppDbExecutor): Promise<void>`。查询 `list(organizationId: string, query: ListRentalBillsQuery, executor: AppDbExecutor): Promise<RentalBillPage>`、`detail(organizationId: string, billId: string, executor: AppDbExecutor): Promise<RentalBillDetail | null>`，coverage 初值由读取 service 填充。`BillAdjustmentsRepository.findCurrent(organizationId: string, contractId: string, executor: AppDbExecutor): Promise<AdjustmentRecord | null>`；`insert(input: NewAdjustment, executor: AppDbExecutor): Promise<AdjustmentRecord>`；`revoke(context: BillingWriteContext, contractId: string, adjustmentId: string, reason: string, executor: AppDbExecutor): Promise<void>`。

- [x] 先写 migration 结构断言与仓储行为测试：新增五类表（含计数器）、组织复合引用、有效来源键部分唯一索引、幂等唯一键、同合同未撤销调整唯一约束。断言不存在回填账单、改账户余额或删除现有菜单的 SQL。
- [x] 为真实 PostgreSQL 测试准备测试代码：相同来源插入两条 active 必须失败，原账单作废后允许新 active；两个组织同来源合法；跨组织关联失败；rollback 后批次、账单、明细为空。采用专用 `RENTAL_MIGRATION_TEST_DATABASE_URL` 和一次性 schema，授权运行前不得读取应用 DATABASE_URL 代替。
- [x] 用目标测试确认失败，再实现 schema、仓储、分类金额聚合、组织编号序列与批量明细查询。普通计租行非负，终止差额行可负，账单总额非负。历史押金来源 UUID 仅作快照，不强引用可被替换的押金条目。
- [x] 按现有 Drizzle 配置生成 migration：`pnpm exec turbo run db:generate --filter=@xpense/server -- --name=rental_billing`；先通过 ctx7 确认当前 drizzle-kit 的命名参数，再运行本地生成。只生成文件，不执行 db:migrate/db:push；生成目录时间戳由工具决定，记录最终路径，不改旧 migration。
- [x] 在同一新增 migration 中增量插入三项权限，仅给系统 owner/admin 增加映射；新增组织继续由模板创建账单菜单。已有组织只补缺失的 RentalBills/RentalBillDetail 及按钮，不覆盖已有节点、排序、可见性或自定义角色。父级优先复用 RentalContracts 所属租赁目录；不存在可靠父级时创建独立“租赁账单”入口，不猜测中文名称后重置菜单。对不存在和已存在两种数据库状态验证可重复执行的补充逻辑。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/db/rental-billing-migration.integration.test.ts src/modules/rental/bills.repository.test.ts src/modules/rental/bill-adjustments.repository.test.ts src/db/seed-rbac.test.ts src/modules/iam/menu-template.test.ts`。未获数据库授权时仅运行静态/模拟部分，真实数据库部分明确 skip，记录未验证项。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 新增租赁账单持久化与权限菜单"`。

## Task 4：一致预览与幂等生成服务

**Files:** 创建 `billing-source.service.ts`、`bills.service.ts`、`bills-read.service.ts` 及各自测试；新增 `apps/server/src/test/rental-billing-fixtures.ts`。复用现有 `DatabaseTransactionService`、`ContractsPolicyService`、AuditService 和 AccessService，不建立并行事务设施。

**Interfaces:** `BillingSourceService.read(organizationId: string, contractId: string, executor: AppDbExecutor): Promise<BillingSource>`；`BillsService.preview(auth: AuthContext, dto: PreviewBillsDto): Promise<RentalBillPreview>`；`generate(auth, dto: GenerateBillsDto): Promise<RentalBillGenerationResult>`；`BillsReadService.list(auth,dto): Promise<RentalBillPage>`、`detail(auth,dto): Promise<RentalBillDetail>`。preview/read 接口也用同一事务快照或现有组织锁保证来源一致，禁止多次无约束读取拼出混合版本。

- [x] 先写服务失败测试：首次全租期生成、有效账单跳过、过期版本 409、同键异内容 409、同键重放、无新增返回、计费不一致不静默跳过，以及草稿/取消拒绝与停用房产历史合同可用。
- [x] 专项断言：首次四张租金＋两项押金 `expect(result.createdCount).toBe(6)`；同请求重试 `expect(replayed.generationId).toBe(result.generationId)` 且账单数仍为 6；原批次后来作废，原请求重试仍不新增；同请求键不允许更换合同或押金日期。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/bills.service.test.ts src/modules/rental/bills-read.service.test.ts src/modules/rental/billing-source.service.test.ts`，确认失败后实现。锁顺序组织→房产→合同，重放鉴权后先于旧来源版本拒绝；重新计算、batch、lines、audit 在一事务内。
- [x] 预览缺输入时 canGenerate=false；后续页必须携带同一 version。确认接口不接分页，测试 101 张账单只浏览第一页仍生成 101 张。depositDueDates 只接受当前缺失押金的来源键，拒绝未知键和改写既有项；已有幂等请求重放先按原请求判断。列表汇总只含有效账单且按当前筛选，租金/押金分开；contractId 查询返回只读 coverage。详情历史有界加载，不返回全部合同账单代替详情。
- [x] 测试审计/明细写入失败整批回滚、组织不匹配 404、同合同并发调用、超大租期不静默截断；目标测试通过并运行 server check。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 实现租赁账单预览与幂等生成"`。

## Task 5：合同修正、取消与终止联动

**Files:** 创建 `billing-lifecycle.service.ts`、`billing-lifecycle.service.test.ts`；修改 `contracts.service.ts`、`contract-lifecycle.service.ts`、各自测试及 `dto/terminate-contract.dto.ts`。如 facade 接近 300 行，将完整终止处理职责放到 `billing-termination.service.ts` 及其测试，不拆为参数密集的碎片函数。

**Interfaces:** `BillingLifecycleService.onCorrection(auth, before: BillingSource, after: BillingSource, tx: AppDbTransaction): Promise<void>`；`onCancel(auth, source, tx): Promise<void>`；`previewTermination(auth, dto: PreviewTerminationDto): Promise<RentalTerminationPreview>`；`onTerminate(auth, source, dto: TerminateContractDto, tx): Promise<void>`；`onRevokeTermination(auth, source, tx): Promise<void>`。source 为合同动作改变关系前读取的来源；onCorrection 的 after 是同事务更新后来源。联动仅调用仓储、纯规则、审计及权限 service，不反向依赖合同 service。

- [x] 先补失败测试：月租修正仅作废租金和金额变化的倍数押金，固定押金保留；备注或 UUID 重建不作废；同内容押金两项分别有不同 dueDate，删一项确定性保留较小出现序号及原 dueDate；取消作废全部有效应收。
- [x] 增加终止测试：跨季付当期原始金额 900000、参考 450000、房东确认 500000 时，替代账单总额 500000、差额 -400000，旧账单及后续账单作废；早期账单、押金不变。零最终应收合法，理由必填，不按“最终金额减已收”计算。
- [x] 覆盖无账单先终止、历史终止首次生成、终止当期缺失、终止日在付款期末、未来终止撤销冲突 rollback、撤销成功后原账单不复活、再次同日终止新 adjustmentId。运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/billing-lifecycle.service.test.ts src/modules/rental/contracts.service.test.ts src/modules/rental/contract-lifecycle.service.test.ts` 取得失败证据。
- [x] 实现事务内调用点，保留 before 快照；按计费业务差异作废而非 Object.keys(dto)。条件权限在任何写入前检查。已有账单的终止确认与替代账单一次提交；从未生成的终止不要求财务字段。本任务同时补齐任务 4 对已终止合同首次生成的路径：复用任务 2 的纯终止计算和任务 3 的调整仓储，不让 BillsService 与 BillingLifecycleService 双向注入。调整 UUID 唯一标识财务事件，撤销标记而不删除。
- [x] 确认生命周期调用中任一审计、作废、adjustment 或新账单写入失败时合同状态、承租关系和账单全部回滚；重跑上述测试及 contract-parties.service.test.ts，确保履行中承租方变更不使旧账单失效。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 联动合同变更与租赁账单调整"`。

## Task 6：HTTP、权限和集成路径

**Files:** 创建 `bills.controller.ts`、`bills.controller.test.ts`、`rental-billing.e2e.test.ts`、`rental-billing-lifecycle.e2e.test.ts`；修改 `rental.module.ts`、`contracts.controller.ts`、现有 `rental-contract-core.e2e.test.ts`、`rental-contract-lifecycle.e2e.test.ts`；扩展 `apps/server/src/test/rental-test-state.ts`、`rental-fake-repositories.ts`、`rental-transaction-harness.ts`，保证账单状态进入事务快照，不伪造独立提交。

**Interfaces:** 注册设计第 7 节的五个账单路由，读 list/detail 为 GET，其余 POST；写响应 HTTP 200；终止仍走原合同 terminate 路由，返回现有合同详情。权限名称与任务 1 一致。

- [x] 写 app.inject 失败测试，覆盖完整“预览→生成→合同修正→旧账单作废→重新预览→补生成”及“终止→确认金额→撤销→补齐”两条用户流程。
- [x] 添加认证、三项权限组合、跨组织 id、未授权的自定义角色、非法 DTO、预览过期及条件权限断言。断言 `expect(response.statusCode).toBe(200)`、错误校验码 `VALIDATION_FAILED`；跨组织不得返回其他合同金额。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/server --force -- src/modules/rental/bills.controller.test.ts src/modules/rental/rental-billing.e2e.test.ts src/modules/rental/rental-billing-lifecycle.e2e.test.ts`，红灯后注册依赖和薄 controller；按 NestJS 技能与 ctx7 核对当前 schema 绑定用法，不改全局校验体系。
- [x] 新增“preview 中途 page 2 版本过期”“同键重放当前已失去权限仍拒绝”“无账单旧客户端终止继续可用”“有账单旧客户端缺金额确认拒绝”等 API 断言。
- [x] 上述测试和现有租赁 core/lifecycle E2E、服务端 check 通过；记录 mock E2E 与真实数据库并发测试的证据边界。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 接入租赁账单接口与权限校验"`。

## Task 7：前端 API、查询与组织隔离

**Files:** 创建 `apps/web/src/services/rental-bills-api.ts`、`rental-bills-query.ts` 及测试；修改 `web-session.ts`、`web-session.test.ts`、`rental-query.ts`、`rental-query.test.ts`。按需要扩展已有租赁组织缓存隔离测试，不改身份会话逻辑。

**Interfaces:** `createRentalBillsApi(client: ApiClient)` 产出 `listBills/getBill/previewBills/generateBills/previewTermination`，返回相应共享契约；`RentalBillsApi = ReturnType<typeof createRentalBillsApi>`，session 增加 `rentalBillsApi`。`rentalBillsKeys` 以 `['rental', organizationId, 'bills']` 为根；`invalidateRentalBills(queryClient, organizationId): Promise<void>` 负责该组织账单列表、详情和汇总失效。

- [x] 先写请求路径/参数/异常测试和查询 key 测试：两个组织同 contractId 的 key 不相等；金额不从 URL 浮点解析；预览 page 参数不进入 generate payload。断言 `expect(keyA).not.toEqual(keyB)`。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/web --force -- src/services/rental-bills-api.test.ts src/services/rental-bills-query.test.ts`，红灯后实现 API 封装及 session 注入。
- [x] 生命周期和合同保存成功后失效对应组织所有受影响 bills 查询；捕获发起操作时的 organizationId，切换组织后的迟到响应不能失效或展示新组织数据。预览状态为界面局部状态，不持久化到 Zustand。
- [x] 网络未知结果时保留原 idempotencyKey 与请求内容，重试返回原批次后再刷新列表；用户更改日期/终止输入或重新预览版本后创建新 key。补上模拟“响应丢失但服务器已提交”的测试。
- [x] 重跑上述、web-session、rental-query 以及已有租赁缓存边界测试，运行 web check。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 接入账单请求与组织隔离缓存"`。

## Task 8：合同内账单预览与生命周期交互

**Files:** 创建 `apps/web/src/features/rental/bills/contract-bills-section.tsx`、`bill-generation-dialog.tsx`、`bill-preview-table.tsx`、`bill-generation-form.ts`、`termination-billing-fields.tsx` 及对应交互测试；修改 `contracts/contract-detail-page.tsx`、`contract-detail-page.test.tsx`、`contract-actions.tsx`、`contract-action-model.ts`、`contract-form-page.tsx` 及对应测试和合同路由 props 注入。

**Interfaces:** `ContractBillsSection({ organizationId, contractId, api, permissions })`；`BillGenerationDialog({ organizationId, contractId, api, open, onOpenChange, onGenerated })`，api 为 RentalBillsApi；`onGenerated(result: RentalBillGenerationResult): void`。终止字段组件消费 RentalTerminationPreview，输出 billingConfirmation，原终止 action 提交合同 API。

- [x] 先写用户行为失败测试：6 张新增项预览、押金到期日必填、统一日期和逐项修改、租金字段只读、现有项不可改、确认显示分类金额；应看到“本阶段仅记录应收，收款情况尚未登记”，不出现欠款或已收状态。只有 read 权限时由列表 coverage 展示需补齐数量，隐藏生成入口且不请求 preview。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/web --force -- src/features/rental/bills/contract-bills-section.test.tsx src/features/rental/bills/bill-generation-dialog.test.tsx src/features/rental/bills/termination-billing-fields.test.tsx`，确认失败后按 DESIGN.md 实现，继续使用现有表单、日期和金额组件。
- [x] 预览表分页但顶部展示全计划新增数量和分类总额；生成按钮只有完整有效 version 且必填项齐全才可用。组织/合同变化立刻丢弃局部预览；迟到响应按原目标检查后丢弃。409 重新预览前不得确认；保留的押金日期必须按稳定 sourceKey 匹配。
- [x] 合同修正/取消/撤销确认中明确账单作废影响；终止弹窗先请求参考值，录入整期最终应收和原因，再一次提交。没有账单时保留原终止流程；已有账单缺 adjust 权限时解释为何不可操作。终止字段金额允许零，不能使用现有只允许正数的转换函数而改变原合同金额校验。
- [x] 新交互测试及合同详情、表单、生命周期回归通过；验证按钮连点、请求失败、重试、页间变化和切换组织不会漏确认或重复创建。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 新增合同账单预览与终止确认交互"`。

## Task 9：统一列表、详情与路由

**Files:** 创建 `features/rental/bills/bills-page.tsx`、`bill-detail-page.tsx`、`bill-filters.tsx`、`bill-table.tsx`、`bill-detail-sections.tsx` 及页面/筛选测试；创建 `apps/web/src/routes/_authenticated/(rental)/rentals/bills/index.tsx`、`$billId.tsx`、`bills-routes.test.tsx`；修改 `routes/-shared/route-contract.test.ts` 等路由登记验证。菜单结构来自任务 3，不新增 UI 库。

**Interfaces:** `BillsPage({ organizationId, api, permissions, search, onSearchChange, onNavigate })` 使用 ListRentalBillsQuery；`BillDetailPage({ organizationId, billId, api, permissions })`。RouteKey 和 path 与任务 1 一致；路由使用 RegisteredRouteLeaf 和 session 的 rentalBillsApi。

- [x] 先写 URL 筛选恢复和分页测试；示例金额租金 900000、押金 300000，作废租金 900000 不计入有效总额。状态“到期日已过”不解释为未付款；明细能区分原计划、差额和最终金额。
- [x] 运行 `pnpm exec turbo run test --filter=@xpense/web --force -- src/features/rental/bills/bills-page.test.tsx src/features/rental/bills/bill-detail-page.test.tsx src/features/rental/bills/bill-filters.test.tsx src/routes/_authenticated/\(rental\)/rentals/bills/bills-routes.test.tsx`，失败后实现分页、筛选、费用分类、详情及安全历史。
- [x] 普通详情源数据使用生成快照，跳转当前合同显示明确入口；作废原因与调整原因可查询，列表默认仅有效，切换后可查作废。无 read 权限时不请求账单；未知 ID 使用现有错误反馈。
- [x] 通过现有路由生成流程更新 routeTree.gen.ts（生成产物，不手改）；检查共享 RouteKey、菜单解析、页面缓存与懒加载映射一致。
- [x] 重跑页面及路由契约测试，手动检查桌面和移动端筛选、明细、日期录入、错误反馈、键盘操作及长名称溢出。
- [x] 完成提交检查后单独提交：`git commit -m "feat: 新增租赁账单列表与详情页面"`。

## Task 10：整体回归、数据库演练与交付

**Files:** 按前九项最终结果补充本计划执行记录及设计中必要的接口说明；不增加独立性能工具或通用测试框架。

**Interfaces:** 无新增产品接口；产出实际检查证据、尚未执行事项及部署说明。

- [x] 对照设计第 10 节逐项核对任务覆盖，运行 `pnpm exec turbo run test --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web --force`；再运行 `pnpm exec turbo run lint check build --filter=@xpense/shared --filter=@xpense/server --filter=@xpense/web`。既有无关失败单独记录，不修复或弱化断言。
- [ ] 数据库演练先明确申请一次性本地测试库 DDL/清理授权，再使用专用测试变量运行真实 PostgreSQL 测试；绝不连接业务库替代。至少两条独立连接竞争同一合同，验证有效来源唯一、同请求键竞争、事务回滚及合同修改竞争；单连接 mock 不计为并发验证。
- [ ] 验证已有组织菜单补充、角色授权、已终止合同和无账单合同升级前后行为；只交付 migration 文件和说明，运行到用户业务库另行授权。应用 dev 命令会触发 db-prepare，不使用根 pnpm dev 作为无副作用预览命令。
- [x] 在本地测试环境记录 1 年、30 年合同和长租期预览/生成的片段数、账单数、查询次数与耗时；断言 101 张账单分页展示却完整生成，以及没有按行 N+1。超出安全数值或日期明确报错，不人为截短。性能证据不足时列为风险，不声称全范围已验证。
- [x] 独立评审稳定代码，优先检查月份归属、金额舍入、身份快照、事务、条件权限和幂等。若采用子 Agent，仅使用项目 Reviewer 角色，给出明确只读范围，不让其继续派发；评审发现修复后只重跑受影响检查。
- [x] 最后运行 `git diff --check`，检查本次改动文件、敏感信息和禁止的 console 日志；在本计划中补齐实际验收记录，交付实施结果、验证范围、数据库演练是否执行、剩余风险及大型合同文件集成热点。
- [x] 完成提交检查后单独提交验收记录及本任务相关改动：`git commit -m "chore: 完成租赁账单回归验证与交付记录"`。即使无需再修改代码，也提交真实验收记录，不用空提交代替任务产物；不推送。

## 顺序、授权与执行方式

依赖顺序为 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10。后端接口和事务未稳定前不并行修改合同调用方；每个任务完成失败测试、实现、通过测试和中文提交的闭环后再继续。

推荐主 Agent 在当前会话顺序实施，最后使用独立 Reviewer：计费来源、事务联动和前端契约依赖紧密，顺序实施减少共享文件冲突。若用户选择子 Agent 驱动，任务 1 的共享契约仍由主 Agent维护，按任务独占其新增业务文件，合同 service、模块注册、共享类型和迁移由主 Agent 集成；所有子 Agent 禁止再派发。

已按用户请求在当前分支使用 executing-plans 原地顺序实施；当前对话已明确授权逐任务精确暂存及中文本地提交。实际迁移、seed、测试库 DDL、推送及 PR 仍未授权，只在需要对应操作时解释具体影响并申请，不重复询问已获授权的任务提交。

## 自检与文档依据

覆盖映射：设计 1–2 → 全局约束和任务 1/4；设计 3 → 任务 2；设计 4 → 任务 3；设计 5 → 任务 4；设计 6 → 任务 5；设计 7 → 任务 1/3/6；设计 8 → 任务 7–9；设计 9–10 → 任务 10。

计划中的任务命令依据本仓库 package scripts 和 turbo.json，并通过 Context7 核对 [Turborepo 参数透传与强制执行](https://github.com/vercel/turborepo/blob/main/apps/docs/content/docs/reference/run.mdx)。共享包测试脚本已包含 `src`，因此任务 1 运行完整共享包测试，不误称只跑单个文件。数据库部分唯一索引参考 [Drizzle PostgreSQL 索引文档](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/pg/indexes-constraints.mdx)；Context7 未提供当前 RC 专属版本，具体 schema API 仍以本地已用模式和当前类型检查为准，实施时查询所用 NestJS、Drizzle、TanStack API，不据此升级依赖。

本计划及设计位于被 .gitignore 忽略的 docs/。执行任务提交时，必要的本任务设计依据和验收记录可纳入已授权的提交范围；使用 `git add -f` 时仅列出本计划及对应设计的精确路径，不强制暂存整个 docs/，不修改忽略规则，也不夹带其他本地文档。实施任务和本地提交的实际结果记录如下，不将规划阶段状态误作当前进度。

## 实际执行记录

### Task 1

- 2026-09-27 当前 `feature/rental-billing` 分支实施；用户在当前会话明确授权逐任务精确暂存与中文本地提交，不推送。
- RED：共享账单模块、服务端账单 DTO 不存在；对应新增测试失败。
- GREEN：共享包 28 项通过；账单 DTO 4 项通过；服务端完整回归 1069 项通过、2 项既有跳过。
- shared/server lint、check 通过；git diff --check 通过。
- 基线 WEB 676/678 通过，两项既有失败位于 contract-form-page.test.tsx：选择启用房产、seeded property 改变后的表单重置；不修复无关失败。
- 扩展共享路由枚举时同步更新 menu.test.ts 的登记断言。
- 当前 Node 为 25.6.0，与根 engines 26.8.2 不同，未安装或切换运行时。

### Task 2

- RED：三份纯规则模块不存在，新增测试失败。
- GREEN：计费规则与原合同规则 32 项通过；服务端完整回归结果见本任务日志；server lint/check 通过。
- 覆盖月付/季付/半年付/年付、闰年月末恢复、零额与半数舍入、跨年到期、30 年租期、金额溢出和年份上限。
- 裁定：参考月末超出 9999 年时 referenceEnd 为 null，保留完整 referenceDays；不持久化五位业务日期。成本：极限日期界面需按天数解释参考依据。
- Task 1 提交：67f9061。

### Task 3

- RED：新 schema/repository 不存在；新增菜单与默认角色的预期尚未满足。
- ctx7 核对 drizzle-kit --name 参数后生成 `apps/server/src/db/migrations/20260927161043_rental_billing/`，包含 migration.sql/snapshot.json；未执行迁移或 seed。
- 增量 SQL 保留已有菜单、排序、可见性及自定义角色；系统 owner/admin 获得新增权限；新组织模板包含账单读与两项按钮，默认 member/viewer 保持只读。
- GREEN：静态迁移/仓储/seed/菜单目标测试通过；服务端全回归、lint、check 通过，真实 PostgreSQL 测试明确跳过，不能作为数据库约束及并发验证证据。
- 额外验证：批次整段编号、写快照不含电话和证件、明细合计不一致拒绝保存；SQL CHECK 显式拒绝空 effectiveEnd 的失败测试修复后通过。
- 为保持已有大型 rental-menu-template 清晰，新增独立 billing-menu-template 聚合；同步 menu-tree 的新增只读入口预期。
- Task 2 提交：e08b7b5。

### Task 4

- RED：预览与生成 service 缺失；GREEN：新增 8 项服务测试通过，服务端 1105 项通过、3 项跳过；lint/check 通过。
- 覆盖 101 张全量生成、页间版本冲突、同键重放、失去权限后拒绝、审计/明细失败整批回滚、只读覆盖与到期提示。并发测试为串行事务 mock，真实数据库证据留待任务 10。
- 将合同脱敏读模型提取为纯映射，保留旧模块导出，避免后续合同联动与计费来源循环依赖；原合同回归通过。
- 已终止合同首次生成按计划在任务 5 完成，接口将在任务 6 注册。

### Task 5

- RED：账单生命周期与终止服务缺失；GREEN：服务端 1114 项通过、3 项数据库测试跳过，lint/check 通过。
- 新增完整终止职责 provider 和适用计划纯规则；原付款期计算行加差额、零最终应收、历史终止首次生成、当期缺失仅保存确认、撤销事件匹配均覆盖。
- 修正按稳定来源及计费依据作废，固定押金保留、重复项保留较小序号；取消作废有效应收。合同权限检查先于写入，必需联动错误回滚合同状态。
- 为使新注入的合同联动可以运行，将任务 6 的 provider 注册和账单事务 mock 状态提前纳入本任务；HTTP controller 仍留任务 6。测试仓储与原合同共用快照，新增独立 rental-billing-fakes 文件避免继续扩大原仓储 fake。
- 生命周期 HTTP 全流程及数据库竞争将在后续任务补充，当前并发证据仍为 mock。

### Task 6

- RED：账单 controller 缺失，HTTP 预览/列表返回 404；GREEN：5 项 controller/HTTP 全流程测试通过，服务端完整回归、lint/check 通过。
- 注册五个接口，显式 Zod schema 与组合权限、POST 200；原合同终止仍返回详情。
- HTTP 覆盖生成后修正再补齐、旧预览冲突、丢失结果重放、失去生成权限后重放拒绝、跨组织 404、校验码及明细故障整批回滚。
- 生命周期 HTTP 覆盖终止确认、调整/审计写入故障回滚、恢复冲突保持账单、撤销不复活旧单、同日新 UUID、旧客户端无历史终止和历史终止首次零额生成。
- 专用 HTTP harness 使用固定合同/关系仓储 seam，真实 controller/service/guard/校验/事务执行；空间与原合同规则继续由原 core/lifecycle E2E 覆盖。该证据不替代真实 PostgreSQL 并发。

- Task 6 回归补充：全量测试发现原 rental.controllers.test.ts 的三个模块登记断言未包含新 controller；同步精确登记预期，保留模块不导出仓储的断言。上次任务提交早于该全量结果核对，补充单独测试提交，最终验证以后续实际结果为准。

- Task 6 最终回归：服务端 1119 项通过、3 项数据库测试跳过，server lint/check 通过。

### Task 7

- RED：账单 API/query 文件不存在；GREEN：请求、重试、会话及租赁缓存目标测试通过，变更文件 Biome 检查通过。
- 固定一次生成请求与 key，响应丢失后相同 payload 重试；新预览生成新 key。所有账单缓存含组织前缀，合同成功后失效发起组织的账单缓存，原会话清理根范围覆盖账单。
- session 新增必需 rentalBillsApi，同步九处原类型 fixture；未改身份会话流程。
- web check 已运行：仅报告尚待任务 9 接入的新 RouteKey/路由登记问题；整体类型验收延至任务 9，不使用占位页面或类型绕过。
- 全量 web lint 已运行：19 项既有错误、1 个 warning、2 个 info，涉及 page-cache-host/page-tabs/multi-select/sidebar/search-provider 及原合同步骤格式；未清理无关文件。修改文件单独通过。

### Task 8

- 账单预览/终止字段 RED→GREEN，合同和路由目标回归 51 项通过；含整期零金额一次提交、未知结果原键重试、409、分页版本和组织迟到响应。变更文件 Biome 通过（原合同表单仅增加文案，既有格式问题保留）。
- 合同详情接入应收覆盖/列表及生成；终止对话框检查有效和作废历史，无历史保留原流程，有历史必须完成参考值与整期金额/原因确认。取消和撤销说明作废及补齐影响。
- 原合同表单回归 98 通过/2 个基线失败，不改动其选择房产行为。web check 仍仅等待任务 9 的新路由登记。
- 当前前端只有草稿编辑，已确认合同没有核心修正编辑器；按现有入口补充账单影响提示，不扩大为新编辑器。后台已覆盖生效前核心修正及权限/事务。
- 预览金额使用组织本位币，无固定人民币符号；整数分显示避免大数精度损失，已生成账单详情将在任务 9 标明币种快照。

### Task 9

- 列表/详情/筛选/路由 RED→GREEN；页面与路由回归 42 项通过。默认有效，URL 恢复关键词、费用、状态、合同/房产与到期日期，分页保留筛选。汇总使用服务端全筛选有效金额，作废不计入。
- 详情使用生成快照，展示原计划、参考分母、差额、最终应收、作废原因及最近 20 张同来源历史。仅到期日期状态，不推断收款。
- Vite 插件生成 routeTree.gen.ts，同步 RouteKey 权限与菜单标签，web check/build 通过。变更文件 Biome 通过。
- 使用本地模拟接口检查 1280px 桌面和 390px 手机的状态筛选、详情、长名称、预览、日期录入、Tab 和未知结果重试。手机 document scrollWidth=390，dialogWidth=358；明细表内部横向滚动。未连接业务后端；模拟预览仅用于交互，不能作为真实生成验收。截图 /tmp/xpense-billing-mobile.png。

### Task 10（代码与本地验收完成；实库演练未执行）

- 最终修复后完整强制回归：shared 28 通过；server 1124 通过/3 skip；web 703 通过/2 个原基线失败（新合同选择房产、切换预选房产重置）。前一次全量运行的日历弹窗瞬时失败已在单项、表单整文件和最终全量运行中通过。未删除或弱化原断言。
- lint/check/build 最终为 8/9 任务成功：三个项目 check/build 和 shared/server lint 通过；web lint 保留 19 项原错误、1 warning、2 info。48 个本次 WEB 改动文件校验仅既有合同表单格式失败，排除此原格式问题后其余 47 个通过；未对既有整文件格式做无关清理。新生成的迁移快照已按仓库格式整理。
- 专用测试库环境变量未配置，测试库 DDL/清理申请尚未收到答复，真实 PostgreSQL 演练未执行。测试代码使用控制连接和两条独立 worker 连接，覆盖并发有效来源、同键重放、合同修正等待锁，以及生成/账单/明细/计数器回滚；增量菜单与权限幂等验证同样等待实库。不以这些跳过项声称并发已通过。
- 101 张预览分页但完整生成已有 service 回归覆盖。以下数字为本机纯计划预览，以及真实 BillsRepository 配合计数 executor 的批量写入，包含两项押金，不含数据库 I/O、来源读取查询或事务锁等待。每批最多 500 行，编号只查询一次；100 年合同实际 1202 张未截断。

| 租期 | 租金片段 | 账单 | 写查询 | 两次预览 | 仓储写入 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 年 | 12 | 14 | 3 | 3.02 ms | 0.63 ms |
| 30 年 | 360 | 362 | 3 | 6.92 ms | 0.37 ms |
| 100 年 | 1200 | 1202 | 7 | 54.52 ms | 1.24 ms |

- 这组代理证据不代表生产性能，真实数据库总查询数、锁竞争耗时、支持日期全范围的实库容量仍未测。规则测试覆盖安全整数溢出及 9999 年日期边界。本机 Node 为 25.6.0，仓库要求 26.8.2；未安装或切换运行时，以上证据限于本机环境。
- 架构/覆盖核对：设计 3 为日期/来源/终止纯规则；设计 4 为 5 表约束及安全快照；设计 5/6 为生成和合同共事务；设计 7 为条件权限与 HTTP/DTO；设计 8 为 API/query/表单/列表/快照详情/URL 路由。金额、日期、权限和关键 HTTP 流程均有目标测试，实际验证以各 Task 记录及最终评审修复记录为准。
- 安全检查：最终 123 个改动文件未检出常见真实密钥模式，新增禁止 console 日志为 0；工作区及暂存 diff 检查通过。未安装依赖、未改变 lockfile。

#### 部署与升级边界

1. 按顺序交付两份生成的 migration 及快照：`20260927161043_rental_billing` 新增应收，`20260928035119_rental_billing_scope` 将历史账单合同引用与房产引用按组织分别约束，允许合同修正房产而保留历史快照。业务库迁移、seed 尚未执行，部署时需单独授权并先备份/演练。
2. migration 只追加应收结构和默认账单菜单/权限；仅系统 owner/admin 增量授权，自定义角色不扩大；既有菜单可见性、排序和自定义结构保留，重复补充保持幂等。
3. 既有合同不自动回填应收，升级后手动预览生成；无账单合同保留原终止流程，历史已终止首次生成确认当期整期金额；不修改账户余额、交易或押金资金记录。
4. 新组织使用更新后的模板；既有组织通过 migration 获得目录/权限，不能仅运行更新后的 seed 就宣称线上已升级。
5. 当前分支仅本地提交，无推送或 PR。已有集成热点保持职责：contracts.service.ts 367 行、contract-lifecycle.service.ts 693 行、前端 contract-actions.tsx 525 行、contract-form-page.tsx 583 行，未进行整模块重构；新增账单业务文件均小于 300 行。

#### 最终修复与展示验证

- 历史账单房产关联、预览计算依据、押金费用名称及全计划日期输入、合同区域费用/历史切换、详情批次和计租范围均有失败测试后通过的证据；最后完整回归结果如上。
- 使用真实 WEB 组件和仅本机模拟 API 手工检查桌面 1280px、手机 390px 查询/详情/预览；手机对话框曾有内部溢出（499px > 356px），修复后 356px = 356px。不同押金日期重新预览和未知生成结果反馈可操作；此检查不代表真实 API/数据库联通。临时预览服务已停止，浏览器尺寸恢复。
- 唯一独立 Reviewer 因读取工具连续阻塞，最终依据直接提供的源码摘录完成五个 Review Focus 的有限独立核查；没有已确认的 Critical/Important，一项 Minor（生成时承租关系有效期未保存/展示）。此结论不替代全文评审或实库验收；主线程逐项核对并记录未审边界。测试数据库及临时文件删除授权尚未答复，未执行对应操作。

#### 执行裁决和延后完善项

- Ruling: 在当前分支原地实施 — 用户明确要求当前分支，覆盖技能的隔离工作区建议 — 若判断错误会影响此分支工作区。
- Ruling: 计划中的历史授权声明不视为本次 Git/数据库操作授权；先完成可审阅改动，再申请必要操作 — 用户要求区分文档指令与实际请求，根规范要求明确授权 — 成本为逐任务提交闭环等待确认。
- Task 1: Ruling: 同步更新共享菜单契约枚举断言 — 新 RouteKey 是本任务公开接口，相关契约测试必须随之更新 — 若遗漏会造成错误的路由登记验证。
- Ruling: 等待提交授权时继续互不重叠的可逆任务文件修改，保留逐任务文件范围与验证记录，不进行 Git 写操作 — 文件实施已授权且避免不必要停工 — 成本为批准后需按各任务精确提交。
- Task 2: Ruling: 上限参考月超出 9999 年时 referenceEnd=null，保留完整分母天数 — 设计允许内部日序计算且不要求持久化超范围日期 — 若判断错误需增加仅展示用参考日期表达。
- Task 3: Ruling: 新组织默认 member/viewer 沿用租赁只读模式获得 bills:read；迁移只为系统 owner/admin 增加映射，自定义角色不扩大 — 既有模式及设计权限边界 — 若判断错误需调整新组织默认授权。
- Task 3: Ruling: 独立 billing-menu-template 避免继续堆入既有大型模板，同步菜单树契约测试 — 新增完整菜单展示职责 — 成本为一份额外模板文件。
- Ruling: 将合同脱敏 mapper 提取为纯读模型，保留原导出，避免来源读取与生命周期注入循环；成本为新增一个职责明确的文件。
- Task 5: Ruling: 提前注册任务 6 的 providers 和共事务账单 fake — 新增合同构造器依赖要求本步骤即可解析，否则破坏既有 HTTP 回归 — 成本是任务 6 的这部分文件提前交付，接口注册仍顺序完成。
- Task 5: Ruling: onTerminate 增加可选 recordedAt 参数 — 合同和调整必须保存同一事件时间且预览指纹仍读取改变前来源 — 成本是内部接口多一个事件参数，无公共 API 改动。
- Task 6: Ruling: 新增固定关联的 HTTP 账单 harness — 原仓储 fake 使用严格逐请求 fixture，新长流程采用明确合同仓储 seam 共享同一事务状态避免扩散 fixture — 成本是关联校验仍依赖原 core/lifecycle E2E，不能声称数据库验证。
- Task 6: Ruling: 同步原 controller 精确登记断言 — 新接口必须成为模块的一部分，保留仓储私有断言 — 成本是测试登记随接口扩展；初次提交前全量结果核对遗漏，在任务完成前补充提交纠正。
- Task 7: Ruling: 整体 web 类型门槛延至任务 9 路由登记 — 任务 1 已扩展 RouteKey 而任务 9 才建立路由，当前类型错误属于计划依赖顺序 — 成本是步骤 7/8 期间应用类型检查不能全绿，最终必须在任务 9/10 验证，不用占位实现。
- Task 7: Ruling: 仅校验并格式化实际改动文件，记录既有 web lint 失败 — 原文件与当前提交版本一致，不顺手清理 — 成本是全量 lint 无法作为全绿验收。
- Task 8: Ruling: 不新增已确认合同修正编辑器，在既有详情/非草稿提示中解释账单影响 — 当前前端仅支持草稿编辑，计划要求影响提示而非新修正工作流 — 成本是前端仍无核心修正入口，API 修正已有覆盖。
- Task 8: Ruling: 预览使用组织本位币数字，生成快照明确币种，整数分展示 — 原合同 formatMoney 固定人民币且预览无币种字段 — 成本是预览依赖组织上下文辨别币种。
- Task 9: Ruling: 提取纯 bill-search 避免路由校验导入整套表单组件 — 注册页面保持懒加载 — 成本是一份独立查询规则文件。
- Task 9: Ruling: 手机明细表使用表内横向滚动，正文与筛选响应式换行 — 保持金额/账期对照且现有 Table 支持滚动 — 成本是手机需横向查看较多列。
- Task 10: Ruling: 实际 PG 演练保留为未验证项，不连接业务库 — 专用 URL 缺失且 DDL/清理未获授权 — 成本是数据库并发/部署验收仍开放。
- Task 10: Ruling: 长期性能记录使用纯计划与真实仓储计数 executor，明确不含 DB I/O — 当前无已授权测试库，不额外建立性能框架 — 成本是数据只能证明批量结构，不能代表生产耗时。
- Task 10: Ruling: 最终评审在 Task 10 验收中评审稳定产品 HEAD，测试/记录由主线程补充 — 计划将独立评审列为 Task 10 步骤 — 成本是测试新增未纳入 reviewer 的提交 diff，源码保持冻结。
- Task 10: Ruling: 整体失败保留并报告，完成门槛采用已执行全量证据与目标回归 — 根规范禁止顺手修复无关基线，优先于通用技能全绿要求 — 成本是全量前端测试/lint 仍不全绿，不能宣称可直接合并。
- Final: Ruling: 使用项目 Reviewer 固定角色配置执行唯一独立评审 — 项目角色约束优先于技能推荐显式指定最强模型 — 成本是审阅模型由项目运行时固定。
- Final: Ruling: 代码图过期且调用长期阻塞，恢复同一 Reviewer 上下文直接审阅稳定 94c51f9 源码 — 图只负责缩小范围，源码为准，不再追加新一轮评审 — 成本是评审延迟，图影响分析不能作为完整证据。
- Final: Ruling: Task 10 源码冻结约定在最终修复 pass 中解除，Reviewer 仍以 git show 94c51f9 查看稳定版本，主线程以失败测试验证修复 — 已确认产品缺口应在交付前修复 — 成本是最终未提交修复不由第二位 reviewer 重审。
- Final: Ruling: 预览补充可选 depositInputs 全计划元数据 — 分页中的押金不一定可见，日期齐全后 missing keys 为空仍必须允许修改新增日期 — 成本是一个兼容的响应字段，客户端/服务端需同步交付。
- Final: Ruling: 用第二份生成 migration 解耦历史账单合同与房产外键，保留原始 migration — 合同房产可修正而历史账单必须保留旧快照，分别按组织约束合同和房产 — 成本是部署须按顺序执行两份迁移，实库仍未验证。
- Final: Ruling: Reviewer 原源码读取连续阻塞后继续同一未完成的评审，直接提供已核对的源码摘录完成重点独立判断 — 不把无源码的首份受限报告视为通过，也不新增 Reviewer 或重审轮次 — 成本是独立评审依据为主线程摘录，全文及完整调用链仍需诚实列出未审边界。
- Final: Ruling: Reviewer 未判完整跨组织 HTTP 链路，保持现有共享会话 API 和组织 query/session key — 主线程核对 token 来源为当前 store、迟到刷新保护及已通过组织切换/HTTP 权限测试 — 成本是独立全文与真实双组织浏览器链路仍未验收。
- Final: Ruling: Reviewer 未判重放后历史展示，保持原批次返回并刷新当前列表、按作废历史查询 — result 不重新生成，详情读取保存的行与历史且不替换为当前合同资料 — 成本是用户需切换历史查看旧批次状态，独立全文核对不足。
- Final: Ruling: Reviewer 未判当前调整查询，保持组织/合同且 revokedAt IS NULL 的 findCurrent 与唯一索引 — 来源同事务读取，随后匹配日期/RecordedAt/撤销状态，相关回归通过 — 成本是实际数据库索引和锁仍未验证。
- Final: Ruling: Reviewer 未判完整金额日期算法，按主线程纯规则源码及边界测试验收 — BigInt 比例与汇总、原锚点月末、付款分组、日期上限和溢出目标测试及全量通过 — 成本是没有独立算法全文评审或真实全日期范围容量证据。
- Final: Ruling: Reviewer 未判所有合同入口，保持修正/取消/终止/撤销共事务及更换承租方不重算 — 主线程核对 ContractsService 调用 onCorrection，生命周期与更换参与方源码和原 API 回归 — 成本是固定关联 HTTP harness 不覆盖真实关系持久化，完整人工流程仍未执行。
- Final: Ruling: Reviewer 未判真实 PostgreSQL 行为，交付迁移和实库测试但明确未执行 — 缺少专用 URL 和 DDL/清理授权，不能连接业务库或以 fake 代替 — 成本是 DDL、并发、锁、回滚和部署验收仍开放。
- Final: Ruling: Reviewer 未判完整前端交互，采用主线程目标测试与实际浏览器展示验证 — 修复先有失败证据、最后全量 703 通过且只剩 2 个原基线失败，手机独立日期/确认/未知结果已核对 — 成本是独立组件全文及真实 API 联通未验收。
- Final: Ruling: 保留本计划工作区和仅模拟 API 的 WEB 临时预览文件 — 根规范要求删除获明确授权，异步询问尚未答复，服务与临时浏览器已停止 — 成本是仓库还留有未跟踪的 apps/web/.superpowers/billing-visual，不纳入提交。
- Final: Ruling: 收尾保持当前分支和本地提交，不进入合并/推送菜单 — 用户明确当前分支、本地提交，原基线失败按项目与计划单独记录，优先于通用技能全绿门槛 — 成本是结果不能宣称全绿可直接合并或部署。

- 延后完善：承租关系快照未保存/展示有效期，先后主付款人可能难以区分；本阶段应收按合同归属，未见金额或个人债务影响。
- Task 10 的数据库演练和实库增量菜单验收保持未勾选；其余完成项是代码与已执行的本地证据，不表示全部部署门槛已通过。

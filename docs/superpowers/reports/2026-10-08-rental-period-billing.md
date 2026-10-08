# 账期出账验收记录

计划：docs/superpowers/plans/2026-10-08-rental-period-billing.md。独立 Reviewer 使用 GPT‑6.1 Sol / high，完成一次整支评审；4 项 Important 已由主线程统一一轮测试驱动修复，无 Critical。没有再派发复评。

## 实现与修复

单空间合同账期/接续起点、每期收费快照、同日所属读数、下一期预览与生成、末期作废/读数回退、不可变普通账单、独立结算和现金投影，以及对应前端、限定本地清理和合成场景工具。

重要修复：今天真实底数允许提前生成未来首期；样例入口使用保留 Nest 元数据的编译产物；同空间保存采用差异删除和 upsert 保留关联 ID 及读数 FK；跨日样例恢复以持久合同的服务端默认读数日期为准。已使用表计的历史关联不能转移或删除。

## 验证

- shared 43/43、server 1419/1419，174 个服务端测试文件全部通过。
- 真实 PostgreSQL migration、现金/账期并发及关联 FK 在随机隔离 schema 实际执行，无跳过；开发库未因此改变。
- Web 全量 947/948：仅未改的 authenticated-layout 登录退出 toast 数量断言全量失败；单独相关组 15/15。账期业务前端通过。
- 类型检查 4/4、构建 3/3、整支改动 TS/TSX lint 和 git diff --check 通过。
- 全仓 lint 仍有未修改 UI/布局及旧 datetime snapshot 的既有问题；未擅改无关文件。
- 本地限定清理、3份 migration、权限/系统角色更新、5场景样例 apply 已实际执行；重复样例全部复用。
- 桌面浅深色、390×844移动视口实际验收；零用量生成/作废/重开、手动到期日、季付、接续、尾期水电及手动负费用、结算确认与移动补款归零通过。
- 实际退款、并发/权限/押金全流程由自动化E2E及隔离实库测试验证；未声称每种错误和超长金额均由浏览器逐一复测。

## 当前提交与待办

已有阶段提交：17d6743、377903f、0e6197e、f2b6f1a、de349b7、e6e7a7b、8727528。

任务8及评审修复已获明确本地提交授权。本地数据库切换及页面验收已完成，五组合成样例保留供检查；没有推送或创建PR。全量Web仍有1个既有失败，全仓lint有既有问题，不能称全仓全绿。

本地样例入口（2026-10-08创建）：

- [月付起租日与涨价](http://localhost:5173/rentals/contracts/50b7696f-bc44-4ee3-aa60-081c857e4b2d)：首期3400，涨价后二期3420；浏览器零用量第三期3100，作废后重开。
- [自然月季付、同日提前、零用量](http://localhost:5173/rentals/contracts/d6265389-ee08-4dce-acfd-fe96554a0dd3)：每期9100，固定费100/期，已提前到2027-01-31。
- [本月接续](http://localhost:5173/rentals/contracts/a61fd44d-0e6c-4454-b4d5-19d9ef8715ec)：2026-10-01起，历史线下结清，不伪造历史应收或收款。
- [收款阻断、撤销、作废重开](http://localhost:5173/rentals/contracts/ef1dac2f-f9c9-4d1c-8f5b-ceab11d71b31)：脚本已走撤销重开，最新账单有1元合成收款，页面无作废入口。
- [退租水电与手动退款事项](http://localhost:5173/rentals/settlements/4d260d4b-d667-4cd2-87aa-7f7d3a9e0f69)：终水3700、电50、手动负费用20元；最终7170.32元，浏览器确认结算并登记同额合成补款，已结清，实际退款0。

原有9份合同保留；清理只限授权组织的租赁账务和旧收费/底数。权限初始化没有执行用户或组织bootstrap；既有组织缺失的隐藏退租菜单通过原业务服务补齐并生成审计。迁移目录为20261008054606、20261008055426、20261008091410；历史SQL未改。

## 延后 Minor

M1：出账弹窗未显示计费锚点和付款周期；实际账期区间和预览金额已提供，只读收费依据展示待后续完善。

## 裁定（完整且按发生顺序）

- Ruling: 采用计划中用户已确认的集中测试、中文阶段提交及旧文件移除授权，覆盖技能逐步 RED→GREEN/每任务 task-done 测试要求 — 任务1–7只编写测试并核对 diff，任务8统一运行 — 成本：阶段提交可能存在未验证编译缺口。
- Task 2: Ruling: db:generate 动态读取 @xpense/shared 的 dist，必须先构建 shared — 仅将生成所必需的 shared build 提前，业务测试仍集中任务8 — 成本：提前发现类型缺口；不改变测试授权。
- Task 2: Ruling: Turborepo 不向 Drizzle 交互问题转发输入 — db:generate 已经通过 turbo 尝试，改用 pnpm --filter @xpense/server db:generate 完成相同 package script — 成本：这一次生成绕过编排，但不改变 SQL 生成器或依赖。
- Task 2: Ruling: Drizzle 生成 SQL 在末尾才移除引用 model_version 的旧 period_check，之前 DROP COLUMN 会自动删除该约束，末尾再次 DROP 将失败 — 将旧 period_check 的 DROP 提到字段/枚举变化之前，末尾只 ADD；未改历史 migration — 成本：需任务8实库验证生成器顺序修正。
- Task 4: Ruling: 已作废账单仍通过外键引用接续基准，边界更正不能删除旧起点或读数 — 增加起点 invalidatedAt 和有效记录部分唯一索引，旧记录保留、新边界可重新设置 — 成本：增加一份 lifecycle migration，任务8检查完整迁移链。
- Task 7: Ruling: 旧更正/整租期/按月补账测试与新不可变账单和独立结算直接矛盾 — 实现特有单元套件按 replaced-files.txt 迁移到新规则套件；仍有效的隔离、幂等、资金、HTTP和实库断言在任务8逐项迁移后执行，不靠排除目录通过 — 成本：集中验收需修复测试夹具/引用缺口，阶段7不代表可编译或测试通过。
- Task 8: Ruling: 新 CLI 的 shell if...fi 不能接收 pnpm/Turbo 追加的参数，干跑在 shell 层失败 — 改为直接 dotenv -e ../../.env -- node --import tsx 脚本调用，使范围参数原样传递且不依赖 tsx CLI 的 IPC — 成本：这些本地工具要求存在根 .env，符合计划配置来源。
- Task 8: Ruling: .env fallback 让旧 migration 测试首次实跑并暴露跨 schema 目录查询与 postgres.js 错误字段不匹配 — 查询限定到当前 schema、核对 constraint_name，历史升级用例固定到对应 migration 并使用历史原始 SQL — 成本：测试设施修正不能说明旧开发账务可直接兼容新枚举。
- Task 8: Ruling: 完整测试显式加载 .env，Web 默认配置测试不应假设环境未配置 — 直接验证 undefined 纯函数回退，并验证导出值与实际配置一致 — 成本：测试不再要求运行环境缺少 VITE_API_PREFIX。
- Task 8: Ruling: BillsRepository统一事务持久化及编号分配保留348行，拆出依赖主仓储的头/行写入会增加相互引用 — 按单一职责例外保留；纯账期上下文移入规则后服务269行 — 成本：仓储仍是未来阅读热点。
- Final: Ruling: 未授权的开发库切换及浏览器结果 — 不能从dry-run或隔离测试推断，保留验收待办并等待明确许可 — 成本：现阶段无法宣称完整计划交付。
- Final: Ruling: 既有全量toast失败及全仓lint问题 — 项目规则禁止擅改无关实现，只记录实测失败，相关组单独通过不冒充全量通过 — 成本：仓库全量尚非完全绿色。
- Final: Ruling: 开始后核心更正 — 保留既有生命周期限制；I3只恢复允许的开始前更正 — 成本：无法扩展任意在租合同编辑。
- Final: Ruling: 换表、归零、估算和独立水电 — 遵守spec 2.2.7，不新增未授权交接流程 — 成本：此类业务仍不支持。
- Final: Ruling: 生产历史账务转换 — 新枚举切换仍要求限定清理，不提供历史兼容转换，不推广为生产升级策略 — 成本：不得保留旧账务直接升级。
- Final: Ruling: 更换空间的已用表计历史 — 同空间upsert保留外键目标；开始前跨空间只清未使用底数，有所属历史读数时明确409阻断，不新增换表/表值转接 — 成本：已用表计的合同不能直接改空间，须另走业务建约而非抹除历史。
- Final: Ruling: 编译入口的可重现性 — 样例和server test依赖本包build，沿用tsc emitDecoratorMetadata；只在server test传DB环境，未放到全局或前端 — 成本：首次服务端测试多一次编译，保证fresh checkout与dist加载一致。

- Task 8: Ruling: 既有RBAC入口同时含bootstrap用户与组织初始化 — 调用现有函数时只在当前进程取消4个bootstrap变量，限定权限和系统角色更新 — 成本：用户/default业务初始化不会自动执行，需要已有有效成员。
- Task 8: Ruling: 既有组织缺少隐藏退租菜单，RBAC种子不更新旧组织菜单 — 核对数据库和既有route guard后通过MenuService追加该组织的RentalSettlement隐藏菜单及确认按钮，沿用模板权限和审计，不重置树 — 成本：其他旧组织仍须按文档核对注册，不能只刷新权限。
- Final: Ruling: 全量已有toast/lint失败与finishing技能绿色套件门槛冲突 — 根AGENTS禁止擅改无关代码，计划要求如实交付；完成已授权本地提交，保留feature/rental-billing，不合并/推送/PR — 成本：仓库全范围仍非绿色，不能承诺集成门槛通过。
- Final: Ruling: sdd工作区清理要求与项目删除授权、失败证据保留冲突 — 将交付与裁定固化到正式报告，保留本计划忽略工作区日志；不扩大删除授权 — 成本：本地仍占有少量验收日志空间。

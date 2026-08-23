import {
  deriveDefaultAccountId,
  deriveDefaultCategoryId,
  deriveDefaultLedgerId,
} from "./bookkeeping-default-identities.js";

/** 默认记账数据初始化所需的组织与操作者上下文。 */
export type BookkeepingDefaultsContext = {
  organizationId: string;
  actorUserId: string;
};

/** 默认个人账本的持久化输入。 */
export type BookkeepingDefaultLedgerInsert = {
  id: string;
  organizationId: string;
  name: string;
  type: "personal";
  isDefault: true;
  createdByUserId: string;
};

/** 默认现金账户的持久化输入。 */
export type BookkeepingDefaultAccountInsert = {
  id: string;
  organizationId: string;
  name: string;
  type: "cash";
  sortOrder: number;
  createdByUserId: string;
};

/** 默认一级收支分类的持久化输入。 */
export type BookkeepingDefaultCategoryInsert = {
  id: string;
  organizationId: string;
  ledgerId: string;
  type: "income" | "expense";
  parentId: null;
  name: string;
  sortOrder: number;
  createdByUserId: string;
};

/** 默认记账数据初始化器依赖的最小持久化能力。 */
export type BookkeepingDefaultsExecutor = {
  /** 查询组织当前未删除的默认个人账本。 */
  findActiveDefaultPersonalLedger(organizationId: string): Promise<{ id: string } | undefined>;
  /** 尝试插入默认个人账本；冲突时不覆盖既有记录。 */
  insertDefaultPersonalLedger(
    input: BookkeepingDefaultLedgerInsert,
  ): Promise<{ id: string } | undefined>;
  /** 按确定性主键或 legacy 名称查询默认账户，查询范围必须包含软删除记录。 */
  findExistingDefaultAccount(input: {
    organizationId: string;
    id: string;
    name: string;
  }): Promise<{ id: string } | undefined>;
  /** 尝试插入默认现金账户；冲突时不覆盖既有记录。 */
  insertDefaultAccount(input: BookkeepingDefaultAccountInsert): Promise<void>;
  /** 按确定性主键或 legacy 名称查询账本内曾存在的默认一级分类，查询范围必须包含软删除记录。 */
  findExistingRootCategories(input: {
    organizationId: string;
    ledgerId: string;
    type: "income" | "expense";
    ids: readonly string[];
    names: readonly string[];
  }): Promise<Array<{ id: string; name: string }>>;
  /** 批量尝试插入缺失的默认一级分类；冲突时不覆盖既有记录。 */
  insertRootCategories(inputs: BookkeepingDefaultCategoryInsert[]): Promise<void>;
};

const expenseCategoryDefinitions = [
  { key: "dining", name: "餐饮" },
  { key: "transport", name: "交通" },
  { key: "shopping", name: "购物" },
  { key: "housing", name: "居住" },
  { key: "entertainment", name: "娱乐" },
  { key: "medical", name: "医疗" },
  { key: "education", name: "教育" },
  { key: "gifts", name: "人情" },
  { key: "other", name: "其他" },
] as const;

const incomeCategoryDefinitions = [
  { key: "salary", name: "工资" },
  { key: "bonus", name: "奖金" },
  { key: "freelance", name: "兼职" },
  { key: "investment", name: "理财" },
  { key: "other", name: "其他" },
] as const;

/** 新组织需要补齐的默认数据计划；分类 key 是与可变显示名称解耦的稳定身份。 */
export const BOOKKEEPING_DEFAULTS = {
  ledger: {
    name: "个人账本",
    type: "personal",
    isDefault: true,
  },
  account: {
    name: "现金",
    type: "cash",
    sortOrder: 0,
  },
  expenseCategories: expenseCategoryDefinitions.map((category, sortOrder) => ({
    ...category,
    type: "expense" as const,
    sortOrder,
  })),
  incomeCategories: incomeCategoryDefinitions.map((category, sortOrder) => ({
    ...category,
    type: "income" as const,
    sortOrder,
  })),
} as const;

/**
 * 为一个组织补齐默认个人账本、现金账户和一级收支分类。
 *
 * @param executor 提供查询、冲突感知插入能力的持久化执行器。
 * @param context 目标组织 ID 与用于写入创建人字段的操作者用户 ID。
 * @returns 初始化完成后无返回值；重复调用不会重复创建仍可识别的默认数据。
 * @throws 当默认账本在插入冲突后仍无法解析，或任一持久化操作失败时抛出异常。
 * @remarks 本函数不自行开启或提交事务；调用方负责事务边界。传入事务执行器时，全部写入属于该事务。
 */
export async function initializeBookkeepingDefaults(
  executor: BookkeepingDefaultsExecutor,
  context: BookkeepingDefaultsContext,
): Promise<void> {
  const { organizationId, actorUserId } = context;
  let ledger = await executor.findActiveDefaultPersonalLedger(organizationId);

  if (!ledger) {
    ledger = await executor.insertDefaultPersonalLedger({
      id: deriveDefaultLedgerId(organizationId),
      organizationId,
      createdByUserId: actorUserId,
      ...BOOKKEEPING_DEFAULTS.ledger,
    });
  }

  if (!ledger) {
    ledger = await executor.findActiveDefaultPersonalLedger(organizationId);
  }

  if (!ledger) {
    throw new Error(
      `Failed to resolve default personal ledger for organization: ${organizationId}`,
    );
  }

  const defaultAccountId = deriveDefaultAccountId(organizationId);
  const existingAccount = await executor.findExistingDefaultAccount({
    organizationId,
    id: defaultAccountId,
    name: BOOKKEEPING_DEFAULTS.account.name,
  });

  if (!existingAccount) {
    await executor.insertDefaultAccount({
      id: defaultAccountId,
      organizationId,
      createdByUserId: actorUserId,
      ...BOOKKEEPING_DEFAULTS.account,
    });
  }

  await ensureDefaultCategories(
    executor,
    context,
    ledger.id,
    "expense",
    BOOKKEEPING_DEFAULTS.expenseCategories,
  );
  await ensureDefaultCategories(
    executor,
    context,
    ledger.id,
    "income",
    BOOKKEEPING_DEFAULTS.incomeCategories,
  );
}

/**
 * 按确定性主键补齐某一收支类型缺失的默认一级分类。
 *
 * @param executor 提供包含软删除行的主键查询与冲突感知插入能力的执行器。
 * @param context 目标组织与写入创建人的上下文。
 * @param ledgerId 默认分类所属的已解析默认账本 ID。
 * @param type 需要补齐的收入或支出分类类型。
 * @param plan 包含稳定业务 key、显示名称和排序的默认分类计划。
 * @returns 补齐完成后无返回值；已存在、已改名或已软删除的稳定主键不会被覆盖。
 * @throws 查询或插入失败时原样传播持久化异常。
 * @remarks 本函数不创建事务，沿用调用方传入 executor 的事务边界。
 */
async function ensureDefaultCategories(
  executor: BookkeepingDefaultsExecutor,
  context: BookkeepingDefaultsContext,
  ledgerId: string,
  type: "income" | "expense",
  plan: readonly { key: string; name: string; sortOrder: number }[],
): Promise<void> {
  const plannedCategories = plan.map((category) => ({
    id: deriveDefaultCategoryId(context.organizationId, ledgerId, type, category.key),
    organizationId: context.organizationId,
    ledgerId,
    type,
    parentId: null,
    name: category.name,
    sortOrder: category.sortOrder,
    createdByUserId: context.actorUserId,
  }));
  const existingCategories = await executor.findExistingRootCategories({
    organizationId: context.organizationId,
    ledgerId,
    type,
    ids: plannedCategories.map((category) => category.id),
    names: plannedCategories.map((category) => category.name),
  });
  const existingIds = new Set(existingCategories.map((category) => category.id));
  const existingNames = new Set(existingCategories.map((category) => category.name));
  const missingCategories = plannedCategories.filter(
    (category) => !existingIds.has(category.id) && !existingNames.has(category.name),
  );

  await executor.insertRootCategories(missingCategories);
}

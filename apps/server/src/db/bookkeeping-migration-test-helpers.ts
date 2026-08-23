export const bookkeepingTables = [
  "ledgers",
  "accounts",
  "categories",
  "transactions",
  "account_movements",
] as const;

export const bookkeepingTypes = [
  "ledger_type",
  "account_type",
  "category_type",
  "transaction_type",
] as const;

export const commentedColumns = {
  ledgers: [
    "id",
    "organization_id",
    "name",
    "type",
    "is_default",
    "created_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
  accounts: [
    "id",
    "organization_id",
    "name",
    "type",
    "icon",
    "color",
    "sort_order",
    "created_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
  categories: [
    "id",
    "organization_id",
    "ledger_id",
    "type",
    "parent_id",
    "name",
    "icon",
    "color",
    "sort_order",
    "created_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
  transactions: [
    "id",
    "organization_id",
    "ledger_id",
    "type",
    "category_id",
    "amount_minor",
    "occurred_at",
    "occurred_on",
    "payee",
    "note",
    "created_by_user_id",
    "updated_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
  account_movements: [
    "id",
    "organization_id",
    "transaction_id",
    "account_id",
    "amount_minor",
    "created_at",
  ],
  organizations: ["base_currency", "timezone"],
} as const;

export const bookkeepingPermissions = [
  "ledgers:read",
  "accounts:read",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
  "categories:read",
  "categories:create",
  "categories:update",
  "categories:delete",
  "transactions:read",
  "transactions:create",
  "transactions:update",
  "transactions:delete",
  "statistics:read",
] as const;

export const defaultCategoryTuples = [
  "('expense', 'dining', '餐饮', 0)",
  "('expense', 'transport', '交通', 1)",
  "('expense', 'shopping', '购物', 2)",
  "('expense', 'housing', '居住', 3)",
  "('expense', 'entertainment', '娱乐', 4)",
  "('expense', 'medical', '医疗', 5)",
  "('expense', 'education', '教育', 6)",
  "('expense', 'gifts', '人情', 7)",
  "('expense', 'other', '其他', 8)",
  "('income', 'salary', '工资', 0)",
  "('income', 'bonus', '奖金', 1)",
  "('income', 'freelance', '兼职', 2)",
  "('income', 'investment', '理财', 3)",
  "('income', 'other', '其他', 4)",
] as const;

/**
 * 剥离 SQL 行注释和块注释，同时保留字符串及双引号标识符中的注释符号。
 *
 * @param source 原始 migration SQL。
 * @returns 仅包含可执行 SQL 的字符串。
 */
export function stripSqlComments(source: string): string {
  let result = "";
  let index = 0;
  let quote: "'" | '"' | undefined;

  while (index < source.length) {
    const current = source[index] as string;
    const next = source[index + 1];

    if (quote !== undefined) {
      result += current;
      if (current === quote) {
        if (next === quote) {
          result += next;
          index += 2;
          continue;
        }
        quote = undefined;
      }
      index += 1;
      continue;
    }

    if (current === "'" || current === '"') {
      quote = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === "-" && next === "-") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      result += "\n";
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") {
          result += "\n";
        }
        index += 1;
      }
      index += 2;
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

/**
 * 将 SQL 空白规范化，便于对完整表达式做稳定的精确匹配。
 *
 * @param source SQL 片段。
 * @returns 合并连续空白并移除首尾空白后的 SQL。
 */
export function normalizeSql(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

/**
 * 统计规范化 SQL 中完整片段的出现次数。
 *
 * @param source 已剥离注释的 SQL。
 * @param fragment 需要精确匹配的 SQL 片段。
 * @returns 片段出现次数。
 */
export function countNormalizedSqlFragment(source: string, fragment: string): number {
  const normalizedSource = normalizeSql(source);
  const normalizedFragment = normalizeSql(fragment);
  let count = 0;
  let offset = 0;

  while (normalizedFragment.length > 0) {
    const index = normalizedSource.indexOf(normalizedFragment, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + normalizedFragment.length;
  }

  return count;
}

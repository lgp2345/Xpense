import { and, count, desc, eq, ilike, isNull, ne, or, type SQL } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalTenants } from "../../db/schema.js";
import { tenantRecordFields, tenantSummaryFields } from "./tenants.repository.select-fields.js";
import type { TenantListInput } from "./tenants.repository.types.js";

type TenantSelectExecutor = Pick<AppDbExecutor, "select">;

/** 构建条目与总数共用的组织、软删除和已归一化筛选边界。 */
export function buildTenantListConditions(organizationId: string, input: TenantListInput): SQL[] {
  const conditions: SQL[] = [
    eq(rentalTenants.organizationId, organizationId),
    isNull(rentalTenants.deletedAt),
  ];

  if (input.type !== undefined) conditions.push(eq(rentalTenants.type, input.type));
  if (input.isActive !== undefined) conditions.push(eq(rentalTenants.isActive, input.isActive));
  if (input.documentCountryCode !== undefined) {
    conditions.push(eq(rentalTenants.documentCountryCode, input.documentCountryCode));
  }
  if (input.documentType !== undefined) {
    conditions.push(eq(rentalTenants.documentType, input.documentType));
  }
  if (input.documentNumberLookupHash !== undefined) {
    conditions.push(eq(rentalTenants.documentNumberLookupHash, input.documentNumberLookupHash));
  }
  if (input.keyword !== undefined) {
    const keyword = `%${input.keyword}%`;
    const keywordCondition = or(
      ilike(rentalTenants.name, keyword),
      ilike(rentalTenants.phone, keyword),
      ilike(rentalTenants.email, keyword),
      ilike(rentalTenants.primaryContactName, keyword),
      ilike(rentalTenants.primaryContactPhone, keyword),
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }

  return conditions;
}

/** 构建组织内租户分页条目查询，按最近更新和标识稳定排序。 */
export function buildTenantListQuery(
  executor: TenantSelectExecutor,
  organizationId: string,
  input: TenantListInput,
) {
  return executor
    .select(tenantSummaryFields)
    .from(rentalTenants)
    .where(and(...buildTenantListConditions(organizationId, input)))
    .orderBy(desc(rentalTenants.updatedAt), desc(rentalTenants.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
}

/** 构建与分页条目完全一致的组织内租户总数查询。 */
export function buildTenantCountQuery(
  executor: TenantSelectExecutor,
  organizationId: string,
  input: TenantListInput,
) {
  return executor
    .select({ total: count().mapWith(Number) })
    .from(rentalTenants)
    .where(and(...buildTenantListConditions(organizationId, input)));
}

/** 构建组织内未软删除租户的行锁查询。 */
export function buildActiveTenantForUpdateQuery(
  executor: TenantSelectExecutor,
  organizationId: string,
  id: string,
) {
  return executor
    .select(tenantRecordFields)
    .from(rentalTenants)
    .where(buildActiveTenantCondition(organizationId, id))
    .for("update")
    .limit(1);
}

/** 构建组织内未软删除租户的标识条件。 */
export function buildActiveTenantCondition(organizationId: string, id: string): SQL {
  const condition = and(
    eq(rentalTenants.organizationId, organizationId),
    eq(rentalTenants.id, id),
    isNull(rentalTenants.deletedAt),
  );
  if (condition === undefined)
    throw new Error("Tenant active ownership conditions must not be empty");

  return condition;
}

/** 构建组织内未软删除证件检索摘要冲突条件，可排除当前租户。 */
export function buildActiveTenantDocumentConflictCondition(
  organizationId: string,
  documentNumberLookupHash: string,
  excludeId?: string,
): SQL {
  const conditions: SQL[] = [
    eq(rentalTenants.organizationId, organizationId),
    eq(rentalTenants.documentNumberLookupHash, documentNumberLookupHash),
    isNull(rentalTenants.deletedAt),
  ];
  if (excludeId !== undefined) conditions.push(ne(rentalTenants.id, excludeId));

  const condition = and(...conditions);
  if (condition === undefined)
    throw new Error("Tenant document conflict conditions must not be empty");

  return condition;
}

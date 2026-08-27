import { and, asc, count, desc, eq, ilike, isNull, ne, or, type SQL } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalProperties } from "../../db/schema.js";
import {
  propertyRecordFields,
  propertySummaryFields,
} from "./properties.repository.select-fields.js";
import type { PropertyListInput } from "./properties.repository.types.js";

type PropertySelectExecutor = Pick<AppDbExecutor, "select">;

/** 构建条目查询和计数查询共用的组织、软删除与筛选条件。 */
export function buildPropertyListConditions(
  organizationId: string,
  input: PropertyListInput,
): SQL[] {
  const conditions: SQL[] = [
    eq(rentalProperties.organizationId, organizationId),
    isNull(rentalProperties.deletedAt),
  ];

  if (input.type !== undefined) conditions.push(eq(rentalProperties.type, input.type));
  if (input.isActive !== undefined) conditions.push(eq(rentalProperties.isActive, input.isActive));
  if (input.province !== undefined) conditions.push(eq(rentalProperties.province, input.province));
  if (input.city !== undefined) conditions.push(eq(rentalProperties.city, input.city));
  if (input.district !== undefined) conditions.push(eq(rentalProperties.district, input.district));
  if (input.keyword !== undefined) {
    const keyword = `%${input.keyword}%`;
    const keywordCondition = or(
      ilike(rentalProperties.name, keyword),
      ilike(rentalProperties.countryCode, keyword),
      ilike(rentalProperties.province, keyword),
      ilike(rentalProperties.city, keyword),
      ilike(rentalProperties.district, keyword),
      ilike(rentalProperties.addressLine, keyword),
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }

  return conditions;
}

/** 构建组织内房产分页条目查询。 */
export function buildPropertyListQuery(
  executor: PropertySelectExecutor,
  organizationId: string,
  input: PropertyListInput,
) {
  return executor
    .select(propertySummaryFields)
    .from(rentalProperties)
    .where(and(...buildPropertyListConditions(organizationId, input)))
    .orderBy(desc(rentalProperties.updatedAt), asc(rentalProperties.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
}

/** 构建与条目查询使用相同筛选条件的总数查询。 */
export function buildPropertyCountQuery(
  executor: PropertySelectExecutor,
  organizationId: string,
  input: PropertyListInput,
) {
  return executor
    .select({ total: count().mapWith(Number) })
    .from(rentalProperties)
    .where(and(...buildPropertyListConditions(organizationId, input)));
}

/** 构建组织内活动房产的稳定行锁查询。 */
export function buildActivePropertyForUpdateQuery(
  executor: PropertySelectExecutor,
  organizationId: string,
  id: string,
) {
  return executor
    .select(propertyRecordFields)
    .from(rentalProperties)
    .where(
      and(
        eq(rentalProperties.organizationId, organizationId),
        eq(rentalProperties.id, id),
        isNull(rentalProperties.deletedAt),
      ),
    )
    .for("update")
    .limit(1);
}

/** 构建活动房产名称冲突条件，并可排除当前房产。 */
export function buildActivePropertyNameConflictCondition(
  organizationId: string,
  name: string,
  excludeId?: string,
): SQL {
  const conditions: SQL[] = [
    eq(rentalProperties.organizationId, organizationId),
    eq(rentalProperties.name, name),
    eq(rentalProperties.isActive, true),
    isNull(rentalProperties.deletedAt),
  ];
  if (excludeId !== undefined) conditions.push(ne(rentalProperties.id, excludeId));

  const condition = and(...conditions);
  if (condition === undefined) {
    throw new Error("Active property name conflict conditions must not be empty");
  }

  return condition;
}

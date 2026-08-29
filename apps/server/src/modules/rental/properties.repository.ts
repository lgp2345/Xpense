import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { rentalProperties, rentalSpaces } from "../../db/schema.js";
import {
  buildActivePropertyForUpdateQuery,
  buildActivePropertyNameConflictCondition,
  buildPropertyCountQuery,
  buildPropertyListQuery,
} from "./properties.queries.js";
import {
  propertyDetailFields,
  propertyRecordFields,
} from "./properties.repository.select-fields.js";
import type {
  ActivePropertyNameConflictInput,
  CreateRentalPropertyInput,
  PropertyListInput,
  RentalPropertyDetailRecord,
  RentalPropertyPageRecord,
  RentalPropertyRecord,
  SetRentalPropertyStatusInput,
  SoftDeleteRentalPropertyInput,
  UpdateRentalPropertyInput,
} from "./properties.repository.types.js";

export type { RentalPropertyRecord } from "./properties.repository.types.js";

/** 负责租赁房产的组织作用域查询、空间数量映射与持久化。 */
@Injectable()
export class PropertiesRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 查询组织内未软删除房产的分页摘要及空间计数。 */
  async list(organizationId: string, input: PropertyListInput): Promise<RentalPropertyPageRecord> {
    const [items, totals] = await Promise.all([
      buildPropertyListQuery(this.db, organizationId, input),
      buildPropertyCountQuery(this.db, organizationId, input),
    ]);

    return {
      items,
      total: totals[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 查询组织内未软删除的房产。 */
  async findActiveOwned(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalPropertyDetailRecord | null> {
    const [property] = await executor
      .select(propertyDetailFields)
      .from(rentalProperties)
      .where(
        and(
          eq(rentalProperties.organizationId, organizationId),
          eq(rentalProperties.id, id),
          isNull(rentalProperties.deletedAt),
        ),
      )
      .limit(1);

    return property ?? null;
  }

  /** 在调用方事务中锁定组织内未软删除的房产。 */
  async findActiveOwnedForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord | null> {
    const [property] = await buildActivePropertyForUpdateQuery(executor, organizationId, id);

    return property ?? null;
  }

  /** 查询同组织内未软删除的同名房产。 */
  async findActiveNameConflict(
    input: ActivePropertyNameConflictInput,
    executor: AppDbExecutor = this.db,
  ): Promise<{ id: string } | null> {
    const [property] = await executor
      .select({ id: rentalProperties.id })
      .from(rentalProperties)
      .where(
        buildActivePropertyNameConflictCondition(input.organizationId, input.name, input.excludeId),
      )
      .limit(1);

    return property ?? null;
  }

  /** 在指定执行器中创建房产。 */
  async create(
    input: CreateRentalPropertyInput,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const [property] = await executor
      .insert(rentalProperties)
      .values(input)
      .returning(propertyRecordFields);
    if (!property) throw new Error("Failed to create rental property");

    return property;
  }

  /** 更新组织内未软删除房产的全部可变资料。 */
  async update(
    input: UpdateRentalPropertyInput,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const [property] = await executor
      .update(rentalProperties)
      .set({
        name: input.name,
        type: input.type,
        customTypeName: input.customTypeName,
        countryCode: input.countryCode,
        province: input.province,
        city: input.city,
        district: input.district,
        addressLine: input.addressLine,
        note: input.note,
        isActive: input.isActive,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(this.activeOwnedCondition(input.organizationId, input.id))
      .returning(propertyRecordFields);
    if (!property) throw new Error("Failed to update active rental property");

    return property;
  }

  /** 仅更新组织内未软删除房产的启用状态。 */
  async setStatus(
    input: SetRentalPropertyStatusInput,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const [property] = await executor
      .update(rentalProperties)
      .set({
        isActive: input.isActive,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(this.activeOwnedCondition(input.organizationId, input.id))
      .returning(propertyRecordFields);
    if (!property) throw new Error("Failed to set rental property status");

    return property;
  }

  /** 判断房产是否仍包含未软删除空间。 */
  async hasActiveSpace(
    organizationId: string,
    propertyId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [space] = await executor
      .select({ id: rentalSpaces.id })
      .from(rentalSpaces)
      .where(
        and(
          eq(rentalSpaces.organizationId, organizationId),
          eq(rentalSpaces.propertyId, propertyId),
          isNull(rentalSpaces.deletedAt),
        ),
      )
      .limit(1);

    return space !== undefined;
  }

  /** 软删除组织内未软删除房产并记录操作者。 */
  async softDelete(input: SoftDeleteRentalPropertyInput, executor: AppDbExecutor): Promise<void> {
    const now = new Date();
    await executor
      .update(rentalProperties)
      .set({
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      })
      .where(this.activeOwnedCondition(input.organizationId, input.id));
  }

  /** 生成所有房产写入操作共用的组织、标识和软删除边界。 */
  private activeOwnedCondition(organizationId: string, id: string) {
    return and(
      eq(rentalProperties.organizationId, organizationId),
      eq(rentalProperties.id, id),
      isNull(rentalProperties.deletedAt),
    );
  }
}

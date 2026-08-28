import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { rentalSpaces } from "../../db/schema.js";
import {
  buildActiveOwnedSpaceCondition,
  buildActiveSpaceForUpdateQuery,
  buildSpaceAncestorsQuery,
  buildSpaceChildrenCountQuery,
  buildSpaceChildrenQuery,
  buildSpaceSearchCountQuery,
  buildSpaceSearchQuery,
  buildSpaceSiblingConflictCondition,
  buildSpaceSubtreeDepthQuery,
} from "./spaces.queries.js";
import { spaceRecordFields } from "./spaces.repository.select-fields.js";
import type {
  CreateRentalSpaceInput,
  FindSpaceSiblingConflictsInput,
  MoveRentalSpaceInput,
  RentalSpaceChildrenPageRecord,
  RentalSpacePathNodeRecord,
  RentalSpaceRecord,
  RentalSpaceSearchPageRecord,
  RentalSpaceSiblingConflictRecord,
  SetRentalSpaceStatusInput,
  SoftDeleteRentalSpaceInput,
  SpaceChildrenListInput,
  SpaceSearchInput,
  UpdateRentalSpaceInput,
} from "./spaces.repository.types.js";

export type { RentalSpaceRecord } from "./spaces.repository.types.js";

/** 负责租赁空间的双重作用域查询、四层递归读取与基础持久化。 */
@Injectable()
export class SpacesRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 懒加载直属子节点，并在一次有界查询中批量计算祖先有效状态。 */
  async listChildren(
    organizationId: string,
    propertyId: string,
    input: SpaceChildrenListInput,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpaceChildrenPageRecord> {
    const [items, totals] = await Promise.all([
      buildSpaceChildrenQuery(executor, organizationId, propertyId, input),
      buildSpaceChildrenCountQuery(executor, organizationId, propertyId, input),
    ]);

    return {
      items,
      total: totals[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 在四层空间树内搜索，并返回可从根节点逐级定位的路径。 */
  async search(
    organizationId: string,
    propertyId: string,
    input: SpaceSearchInput,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpaceSearchPageRecord> {
    const [items, totals] = await Promise.all([
      buildSpaceSearchQuery(executor, organizationId, propertyId, input),
      buildSpaceSearchCountQuery(executor, organizationId, propertyId, input),
    ]);

    return {
      items,
      total: totals[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 查询组织与房产范围内未软删除的空间。 */
  async findActiveOwned(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpaceRecord | null> {
    const [space] = await executor
      .select(spaceRecordFields)
      .from(rentalSpaces)
      .where(buildActiveOwnedSpaceCondition(organizationId, propertyId, id))
      .limit(1);

    return space ?? null;
  }

  /** 按可信组织解析未软删除空间的房产归属，供无 propertyId 的写 DTO 建立锁顺序。 */
  async findActiveOwnedById(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpaceRecord | null> {
    const [space] = await executor
      .select(spaceRecordFields)
      .from(rentalSpaces)
      .where(
        and(
          eq(rentalSpaces.organizationId, organizationId),
          eq(rentalSpaces.id, id),
          isNull(rentalSpaces.deletedAt),
        ),
      )
      .limit(1);

    return space ?? null;
  }

  /** 在调用方事务中锁定组织与房产范围内未软删除的空间。 */
  async findActiveOwnedForUpdate(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord | null> {
    const [space] = await buildActiveSpaceForUpdateQuery(executor, organizationId, propertyId, id);

    return space ?? null;
  }

  /** 返回当前空间到根节点的路径，顺序为根到当前节点。 */
  async listAncestors(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpacePathNodeRecord[]> {
    const rows = await buildSpaceAncestorsQuery(executor, organizationId, propertyId, id);

    return rows.map(({ id: ancestorId, name }) => ({ id: ancestorId, name }));
  }

  /** 返回包含当前节点为零的最大子树相对深度，最多递归三条边。 */
  async getSubtreeRelativeDepth(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<number> {
    const [row] = await buildSpaceSubtreeDepthQuery(executor, organizationId, propertyId, id);

    return row?.maxDepth ?? 0;
  }

  /** 判断当前空间是否包含未软删除直属子节点。 */
  async hasActiveChildren(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [child] = await executor
      .select({ id: rentalSpaces.id })
      .from(rentalSpaces)
      .where(
        and(
          eq(rentalSpaces.organizationId, organizationId),
          eq(rentalSpaces.propertyId, propertyId),
          eq(rentalSpaces.parentId, id),
          isNull(rentalSpaces.deletedAt),
        ),
      )
      .limit(1);

    return child !== undefined;
  }

  /** 判断当前空间是否包含任何直属子节点，包括已软删除历史行。 */
  async hasAnyChildren(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [child] = await executor
      .select({ id: rentalSpaces.id })
      .from(rentalSpaces)
      .where(
        and(
          eq(rentalSpaces.organizationId, organizationId),
          eq(rentalSpaces.propertyId, propertyId),
          eq(rentalSpaces.parentId, id),
        ),
      )
      .limit(1);

    return child !== undefined;
  }

  /** 一次查询同父节点下所有活动名称、编码冲突。 */
  async findSiblingConflicts(
    input: FindSpaceSiblingConflictsInput,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalSpaceSiblingConflictRecord[]> {
    if (input.names.length === 0 && input.codes.length === 0) return [];

    return executor
      .select({ id: rentalSpaces.id, name: rentalSpaces.name, code: rentalSpaces.code })
      .from(rentalSpaces)
      .where(buildSpaceSiblingConflictCondition(input))
      .orderBy(asc(rentalSpaces.name), asc(rentalSpaces.id));
  }

  /** 在指定执行器中创建空间。 */
  async create(input: CreateRentalSpaceInput, executor: AppDbExecutor): Promise<RentalSpaceRecord> {
    const [space] = await executor.insert(rentalSpaces).values(input).returning(spaceRecordFields);
    if (!space) throw new Error("Failed to create rental space");

    return space;
  }

  /** 批量创建空间，并拒绝数据库未返回全部插入行的异常结果。 */
  async createMany(
    inputs: readonly CreateRentalSpaceInput[],
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord[]> {
    if (inputs.length === 0) return [];

    const spaces = await executor
      .insert(rentalSpaces)
      .values([...inputs])
      .returning(spaceRecordFields);
    if (spaces.length !== inputs.length) throw new Error("Failed to create every rental space");

    return spaces;
  }

  /** 更新组织与房产范围内未软删除空间的完整可变资料。 */
  async update(input: UpdateRentalSpaceInput, executor: AppDbExecutor): Promise<RentalSpaceRecord> {
    const [space] = await executor
      .update(rentalSpaces)
      .set({
        name: input.name,
        code: input.code,
        type: input.type,
        customTypeName: input.customTypeName,
        isRentable: input.isRentable,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(buildActiveOwnedSpaceCondition(input.organizationId, input.propertyId, input.id))
      .returning(spaceRecordFields);
    if (!space) throw new Error("Failed to update active rental space");

    return space;
  }

  /** 移动空间并更新其同级排序值；层级与环规则由服务层校验。 */
  async move(input: MoveRentalSpaceInput, executor: AppDbExecutor): Promise<RentalSpaceRecord> {
    const [space] = await executor
      .update(rentalSpaces)
      .set({ parentId: input.parentId, sortOrder: input.sortOrder, updatedAt: new Date() })
      .where(buildActiveOwnedSpaceCondition(input.organizationId, input.propertyId, input.id))
      .returning(spaceRecordFields);
    if (!space) throw new Error("Failed to move active rental space");

    return space;
  }

  /** 设置空间自身启用状态；后代有效状态在读取时动态收敛。 */
  async setStatus(
    input: SetRentalSpaceStatusInput,
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord> {
    const [space] = await executor
      .update(rentalSpaces)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(buildActiveOwnedSpaceCondition(input.organizationId, input.propertyId, input.id))
      .returning(spaceRecordFields);
    if (!space) throw new Error("Failed to set rental space status");

    return space;
  }

  /** 软删除空间并记录操作者；是否允许删除由服务层决定。 */
  async softDelete(input: SoftDeleteRentalSpaceInput, executor: AppDbExecutor): Promise<void> {
    const now = new Date();
    await executor
      .update(rentalSpaces)
      .set({ deletedAt: now, deletedByUserId: input.deletedByUserId, updatedAt: now })
      .where(buildActiveOwnedSpaceCondition(input.organizationId, input.propertyId, input.id));
  }
}

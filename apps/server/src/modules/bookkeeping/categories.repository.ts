import { Inject, Injectable } from "@nestjs/common";
import type { CategoryType } from "@xpense/shared";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { categories, ledgers } from "../../db/schema.js";
import {
  buildAnyCategoryChildrenQuery,
  buildAnyCategoryTransactionReferenceQuery,
} from "./categories.queries.js";
import {
  type ActiveSiblingNameInput,
  type CategoryRecord,
  type CreateCategoryInput,
  categoryRecordFields,
  categoryTreeFields,
  type SoftDeleteCategoryInput,
  type UpdateCategoryInput,
} from "./categories.repository.types.js";
import type { CategoryTreeRecord } from "./categories.tree.js";

export type { CategoryRecord } from "./categories.repository.types.js";

/** 负责分类的组织作用域查询和持久化。 */
@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 查询账本内未软删除分类，并按同级展示字段排序。 */
  listActive(
    organizationId: string,
    ledgerId: string,
    type?: CategoryType,
  ): Promise<CategoryTreeRecord[]> {
    const conditions = [
      eq(categories.organizationId, organizationId),
      eq(categories.ledgerId, ledgerId),
      isNull(categories.deletedAt),
    ];
    if (type !== undefined) conditions.push(eq(categories.type, type));

    return this.db
      .select(categoryTreeFields)
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id));
  }

  /** 查询当前组织所属且未软删除的账本。 */
  async findActiveOwnedLedger(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<{ id: string } | null> {
    const [ledger] = await executor
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(
        and(
          eq(ledgers.organizationId, organizationId),
          eq(ledgers.id, id),
          isNull(ledgers.deletedAt),
        ),
      )
      .limit(1);

    return ledger ?? null;
  }

  /** 查询当前组织所属且未软删除的分类，供本任务及交易事务复用。 */
  async findActiveOwnedCategory(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<CategoryRecord | null> {
    const [category] = await executor
      .select(categoryRecordFields)
      .from(categories)
      .where(
        and(
          eq(categories.organizationId, organizationId),
          eq(categories.id, id),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    return category ?? null;
  }

  /** 查询完全相同作用域内的未删除同名分类。 */
  async findActiveSiblingByName(
    input: ActiveSiblingNameInput,
    executor: AppDbExecutor = this.db,
  ): Promise<{ id: string } | null> {
    const conditions = [
      eq(categories.organizationId, input.organizationId),
      eq(categories.ledgerId, input.ledgerId),
      eq(categories.type, input.type),
      input.parentId === null
        ? isNull(categories.parentId)
        : eq(categories.parentId, input.parentId),
      eq(categories.name, input.name),
      isNull(categories.deletedAt),
    ];
    if (input.excludeId !== undefined) conditions.push(ne(categories.id, input.excludeId));

    const [category] = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(and(...conditions))
      .limit(1);

    return category ?? null;
  }

  /** 判断分类是否仍有未软删除的直属子分类。 */
  async hasActiveChildren(
    organizationId: string,
    parentId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [child] = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.organizationId, organizationId),
          eq(categories.parentId, parentId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    return child !== undefined;
  }

  /** 判断分类是否存在任何直属子分类，包括已软删除的历史子分类。 */
  async hasAnyChildren(
    organizationId: string,
    parentId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [child] = await buildAnyCategoryChildrenQuery(executor, organizationId, parentId);

    return child !== undefined;
  }

  /** 判断分类是否被任意历史交易引用，包括已软删除交易。 */
  async hasAnyTransactionReference(
    organizationId: string,
    categoryId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [transaction] = await buildAnyCategoryTransactionReferenceQuery(
      executor,
      organizationId,
      categoryId,
    );

    return transaction !== undefined;
  }

  /** 在指定事务执行器中创建分类。 */
  async create(
    input: CreateCategoryInput,
    executor: AppDbExecutor = this.db,
  ): Promise<CategoryRecord> {
    const [category] = await executor
      .insert(categories)
      .values(input)
      .returning(categoryRecordFields);
    if (!category) throw new Error("Failed to create category");

    return category;
  }

  /** 更新当前组织内的未软删除分类。 */
  async update(
    input: UpdateCategoryInput,
    executor: AppDbExecutor = this.db,
  ): Promise<CategoryRecord> {
    const [category] = await executor
      .update(categories)
      .set({
        ledgerId: input.ledgerId,
        type: input.type,
        parentId: input.parentId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(categories.organizationId, input.organizationId),
          eq(categories.id, input.id),
          isNull(categories.deletedAt),
        ),
      )
      .returning(categoryRecordFields);
    if (!category) throw new Error("Failed to update active category");

    return category;
  }

  /** 仅软删除目标分类，以保留历史交易的分类引用。 */
  async softDelete(
    input: SoftDeleteCategoryInput,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    const now = new Date();
    await executor
      .update(categories)
      .set({ deletedAt: now, deletedByUserId: input.deletedByUserId, updatedAt: now })
      .where(
        and(
          eq(categories.organizationId, input.organizationId),
          eq(categories.id, input.id),
          isNull(categories.deletedAt),
        ),
      );
  }
}

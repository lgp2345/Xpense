import { Injectable, NotFoundException } from "@nestjs/common";
import type { CategoryNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CategoriesRepository } from "./categories.repository.js";
import { mergeCategoryUpdate, toCategoryNode } from "./categories.rules.js";
import { buildCategoryTree } from "./categories.tree.js";
import { CategoriesPolicyService } from "./categories-policy.service.js";
import type { CreateCategoryDto } from "./dto/create-category.dto.js";
import type { DeleteCategoryDto } from "./dto/delete-category.dto.js";
import type { ListCategoriesDto } from "./dto/list-categories.dto.js";
import type { UpdateCategoryDto } from "./dto/update-category.dto.js";

/** 承担分类两级结构、组织隔离、事务与必需审计规则。 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly policy: CategoriesPolicyService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 列出当前组织指定有效账本下的两级分类树。 */
  async list(authContext: AuthContext, dto: ListCategoriesDto): Promise<CategoryNode[]> {
    await this.policy.requireActiveLedger(authContext.organizationId, dto.ledgerId);
    const records = await this.repository.listActive(
      authContext.organizationId,
      dto.ledgerId,
      dto.type,
    );

    return buildCategoryTree(records);
  }

  /** 创建根分类或一个有效根分类的直属子分类。 */
  create(authContext: AuthContext, dto: CreateCategoryDto): Promise<CategoryNode> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      await this.policy.requireActiveLedger(authContext.organizationId, dto.ledgerId, transaction);
      const parentId = dto.parentId ?? null;
      if (parentId !== null) {
        await this.policy.requireValidParent(
          authContext.organizationId,
          parentId,
          dto.ledgerId,
          dto.type,
          undefined,
          transaction,
        );
      }
      await this.policy.assertUniqueSibling(
        authContext.organizationId,
        dto.ledgerId,
        dto.type,
        parentId,
        dto.name,
        undefined,
        transaction,
      );

      try {
        const created = await this.repository.create(
          {
            organizationId: authContext.organizationId,
            ledgerId: dto.ledgerId,
            type: dto.type,
            parentId,
            name: dto.name,
            icon: dto.icon,
            color: dto.color,
            sortOrder: dto.sortOrder,
            createdByUserId: authContext.userId,
          },
          transaction,
        );
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "category.created",
            targetType: "category",
            targetId: created.id,
            result: "succeeded",
            metadata: {
              ledgerId: created.ledgerId,
              type: created.type,
              parentId: created.parentId,
            },
          },
          transaction,
        );

        return toCategoryNode(created);
      } catch (error) {
        this.policy.rethrowNameConflict(error);
      }
    });
  }

  /** 更新分类，并验证更新后的账本、类型、父级及两级深度。 */
  update(authContext: AuthContext, dto: UpdateCategoryDto): Promise<CategoryNode> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const current = await this.repository.findActiveOwnedCategory(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (!current) throw this.notFound("分类不存在");

      await this.policy.requireActiveLedger(
        authContext.organizationId,
        current.ledgerId,
        transaction,
      );
      const next = mergeCategoryUpdate(current, dto);
      await this.policy.requireActiveLedger(authContext.organizationId, next.ledgerId, transaction);
      await this.policy.assertUpdateAllowed(current, next, transaction);
      if (next.parentId !== null) {
        await this.policy.requireValidParent(
          authContext.organizationId,
          next.parentId,
          next.ledgerId,
          next.type,
          current.id,
          transaction,
        );
      }
      await this.policy.assertUniqueSibling(
        authContext.organizationId,
        next.ledgerId,
        next.type,
        next.parentId,
        next.name,
        current.id,
        transaction,
      );

      try {
        const updated = await this.repository.update(next, transaction);
        const changedFields = [
          "ledgerId",
          "type",
          "parentId",
          "name",
          "icon",
          "color",
          "sortOrder",
        ].filter((field) => dto[field as keyof UpdateCategoryDto] !== undefined);
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "category.updated",
            targetType: "category",
            targetId: current.id,
            result: "succeeded",
            metadata: { changedFields },
          },
          transaction,
        );

        return toCategoryNode(updated);
      } catch (error) {
        this.policy.rethrowNameConflict(error);
      }
    });
  }

  /** 软删除无有效子分类的目标，并与必需审计在同一事务提交。 */
  delete(authContext: AuthContext, dto: DeleteCategoryDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const category = await this.repository.findActiveOwnedCategory(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (!category) throw this.notFound("分类不存在");
      await this.policy.requireActiveLedger(
        authContext.organizationId,
        category.ledgerId,
        transaction,
      );
      await this.policy.assertDeletable(category, transaction);

      await this.repository.softDelete(
        {
          organizationId: authContext.organizationId,
          id: category.id,
          deletedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "category.deleted",
          targetType: "category",
          targetId: category.id,
          result: "succeeded",
          metadata: {},
        },
        transaction,
      );
    });
  }

  /** 创建不泄露资源存在性的未找到异常。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }
}

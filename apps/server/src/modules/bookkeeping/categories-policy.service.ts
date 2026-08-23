import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CategoryType } from "@xpense/shared";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { CategoriesRepository } from "./categories.repository.js";
import type { CategoryRecord, UpdateCategoryInput } from "./categories.repository.types.js";
import { changesActiveParentScope, isCategoryNameUniqueViolation } from "./categories.rules.js";

/** 集中执行分类写入前的并发锁、层级、引用与冲突策略。 */
@Injectable()
export class CategoriesPolicyService {
  constructor(private readonly repository: CategoriesRepository) {}

  /** 在任何分类写规则读取前锁定当前组织的稳定竞争行。 */
  async lockWriteScope(organizationId: string, executor: AppDbExecutor): Promise<void> {
    const locked = await this.repository.lockOrganizationForCategoryWrite(organizationId, executor);
    if (!locked) throw this.notFound("组织不存在");
  }

  /** 验证账本属于当前组织且未软删除。 */
  async requireActiveLedger(
    organizationId: string,
    ledgerId: string,
    executor?: AppDbExecutor,
  ): Promise<void> {
    const ledger = executor
      ? await this.repository.findActiveOwnedLedger(organizationId, ledgerId, executor)
      : await this.repository.findActiveOwnedLedger(organizationId, ledgerId);
    if (!ledger) throw this.notFound("账本不存在");
  }

  /** 验证父分类属于同组织、同账本、同类型且自身为根分类。 */
  async requireValidParent(
    organizationId: string,
    parentId: string,
    ledgerId: string,
    type: CategoryType,
    categoryId: string | undefined,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (parentId === categoryId) throw this.badRequest("分类不能成为自己的父分类");
    const parent = await this.repository.findActiveOwnedCategory(
      organizationId,
      parentId,
      executor,
    );
    if (!parent) throw this.notFound("父分类不存在");
    if (parent.ledgerId !== ledgerId || parent.type !== type) {
      throw this.badRequest("父子分类必须属于同一账本和收支类型");
    }
    if (parent.parentId !== null) throw this.badRequest("分类最多只能有两级");
  }

  /** 拒绝同账本、类型及父级下的活动同名分类。 */
  async assertUniqueSibling(
    organizationId: string,
    ledgerId: string,
    type: CategoryType,
    parentId: string | null,
    name: string,
    excludeId: string | undefined,
    executor: AppDbExecutor,
  ): Promise<void> {
    const duplicate = await this.repository.findActiveSiblingByName(
      { organizationId, ledgerId, type, parentId, name, excludeId },
      executor,
    );
    if (duplicate) throw this.conflict("同级分类名称已存在");
  }

  /**
   * 验证更新不会破坏活动树、历史交易引用或软删除子分类复合外键。
   * @param current 当前组织内的活动分类。
   * @param next 合并后的完整更新快照。
   * @param executor 已持有组织分类写锁的事务执行器。
   */
  async assertUpdateAllowed(
    current: CategoryRecord,
    next: UpdateCategoryInput,
    executor: AppDbExecutor,
  ): Promise<void> {
    const hasActiveChildren = await this.repository.hasActiveChildren(
      current.organizationId,
      current.id,
      executor,
    );
    if (hasActiveChildren && changesActiveParentScope(current, next)) {
      throw this.badRequest("存在子分类时不能改变父级、账本或收支类型");
    }

    const changesLedgerOrType = next.ledgerId !== current.ledgerId || next.type !== current.type;
    if (!changesLedgerOrType) return;

    if (
      await this.repository.hasAnyTransactionReference(current.organizationId, current.id, executor)
    ) {
      throw this.conflict("分类已有历史交易，不能改变账本或收支类型");
    }
    if (await this.repository.hasAnyChildren(current.organizationId, current.id, executor)) {
      throw this.conflict("分类仍有历史子分类，不能改变账本或收支类型");
    }
  }

  /** 验证目标分类没有活动子分类，可安全执行软删除。 */
  async assertDeletable(category: CategoryRecord, executor: AppDbExecutor): Promise<void> {
    if (await this.repository.hasActiveChildren(category.organizationId, category.id, executor)) {
      throw this.conflict("分类仍有未删除的子分类");
    }
  }

  /** 将并发写入触发的分类唯一约束转换为稳定的冲突异常。 */
  rethrowNameConflict(error: unknown): never {
    if (isCategoryNameUniqueViolation(error)) throw this.conflict("同级分类名称已存在");
    throw error;
  }

  /** 创建输入语义不合法异常。 */
  private badRequest(message: string): BadRequestException {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }

  /** 创建不泄露资源存在性的未找到异常。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }

  /** 创建分类状态冲突异常。 */
  private conflict(message: string): ConflictException {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

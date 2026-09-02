import { Injectable } from "@nestjs/common";
import type {
  RentalSpaceChildrenPage,
  RentalSpaceNode,
  RentalSpaceSearchPage,
  RentalSpaceSearchResult,
  RentalSpaceSubtreeDepth,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { ContractReferenceService } from "./contract-reference.service.js";
import type { BatchCreateSpacesDto } from "./dto/batch-create-spaces.dto.js";
import type { CreateSpaceDto } from "./dto/create-space.dto.js";
import type { DeleteSpaceDto } from "./dto/delete-space.dto.js";
import type { ListSpaceChildrenDto } from "./dto/list-space-children.dto.js";
import type { MoveSpaceDto } from "./dto/move-space.dto.js";
import type { SearchSpacesDto } from "./dto/search-spaces.dto.js";
import type { SetSpaceStatusDto } from "./dto/set-space-status.dto.js";
import type { SpaceSubtreeDepthDto } from "./dto/space-subtree-depth.dto.js";
import type { UpdateSpaceDto } from "./dto/update-space.dto.js";
import type { RentalPropertyRecord } from "./properties.repository.types.js";
import type { RentalSpaceUpdateValues } from "./rental.types.js";
import { SpacesRepository } from "./spaces.repository.js";
import type {
  CreateRentalSpaceInput,
  RentalSpaceNodeRecord,
  RentalSpaceRecord,
  RentalSpaceSearchRecord,
} from "./spaces.repository.types.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";

export type RentalSpaceMutationResult = { id: string };
export type RentalSpaceBatchMutationResult = { ids: string[] };

type LockedSpaceScope = {
  property: RentalPropertyRecord;
  space: RentalSpaceRecord;
};

/** 编排空间懒加载、组织隔离、树规则、事务与必需审计。 */
@Injectable()
export class SpacesService {
  constructor(
    private readonly repository: SpacesRepository,
    private readonly policy: SpacesPolicyService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly contractReference: ContractReferenceService,
  ) {}

  /** 返回已验证房产及父节点作用域内的直属子空间分页。 */
  async listChildren(
    authContext: AuthContext,
    dto: ListSpaceChildrenDto,
  ): Promise<RentalSpaceChildrenPage> {
    await this.policy.requireReadableProperty(authContext.organizationId, dto.propertyId);
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      await this.policy.requireReadableParent(authContext.organizationId, dto.propertyId, parentId);
    }
    const page = await this.repository.listChildren(authContext.organizationId, dto.propertyId, {
      parentId,
      page: dto.page,
      pageSize: dto.pageSize,
    });
    return this.withLeaseStates(
      authContext,
      dto.propertyId,
      page,
      toChildrenPage,
    ) as Promise<RentalSpaceChildrenPage>;
  }

  /** 返回当前组织指定房产内可定位路径的空间搜索分页。 */
  async search(authContext: AuthContext, dto: SearchSpacesDto): Promise<RentalSpaceSearchPage> {
    await this.policy.requireReadableProperty(authContext.organizationId, dto.propertyId);
    const page = await this.repository.search(authContext.organizationId, dto.propertyId, {
      keyword: dto.keyword,
      page: dto.page,
      pageSize: dto.pageSize,
    });
    return this.withLeaseStates(
      authContext,
      dto.propertyId,
      page,
      toSearchPage,
    ) as Promise<RentalSpaceSearchPage>;
  }

  /** 在已验证房产与空间作用域内读取精确子树深度，供移动候选按需判断。 */
  async getSubtreeDepth(
    authContext: AuthContext,
    dto: SpaceSubtreeDepthDto,
  ): Promise<RentalSpaceSubtreeDepth> {
    await this.policy.requireReadableProperty(authContext.organizationId, dto.propertyId);
    await this.policy.requireReadableParent(authContext.organizationId, dto.propertyId, dto.id);
    const relativeDepth = await this.repository.getSubtreeRelativeDepth(
      authContext.organizationId,
      dto.propertyId,
      dto.id,
    );
    return { relativeDepth };
  }

  /** 在活动房产内创建根空间或子空间。 */
  async create(authContext: AuthContext, dto: CreateSpaceDto): Promise<RentalSpaceMutationResult> {
    const input = normalizeCreateDto(dto);
    this.policy.assertType(input.type, input.customTypeName);
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const property = await this.policy.requirePropertyForUpdate(
        authContext.organizationId,
        input.propertyId,
        transaction,
      );
      this.policy.assertPropertyAllowsTreeMutation(property);
      const targetParentLevel = await this.lockParentAndGetLevel(
        authContext.organizationId,
        input.propertyId,
        input.parentId,
        transaction,
      );
      this.policy.assertTargetDepth(targetParentLevel);
      await this.policy.assertSiblingAvailable(
        siblingInput(authContext.organizationId, input.propertyId, input.parentId, [input]),
        transaction,
      );
      let space: RentalSpaceRecord;
      try {
        space = await this.repository.create(
          {
            ...input,
            organizationId: authContext.organizationId,
            createdByUserId: authContext.userId,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowSiblingConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.created",
          targetType: "rental_space",
          targetId: space.id,
          result: "succeeded",
          metadata: {
            propertyId: input.propertyId,
            parentId: input.parentId,
            type: input.type,
          },
        },
        transaction,
      );
      return { id: space.id };
    });
  }

  /** 规范化并在单一事务中批量创建最多 500 个同级空间。 */
  async batchCreate(
    authContext: AuthContext,
    dto: BatchCreateSpacesDto,
  ): Promise<RentalSpaceBatchMutationResult> {
    const input = normalizeBatchDto(dto);
    this.policy.assertBatchInput(input.items);
    this.policy.assertType(input.type, input.customTypeName);
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const property = await this.policy.requirePropertyForUpdate(
        authContext.organizationId,
        input.propertyId,
        transaction,
      );
      this.policy.assertPropertyAllowsTreeMutation(property);
      const targetParentLevel = await this.lockParentAndGetLevel(
        authContext.organizationId,
        input.propertyId,
        input.parentId,
        transaction,
      );
      this.policy.assertTargetDepth(targetParentLevel);
      await this.policy.assertSiblingAvailable(
        siblingInput(authContext.organizationId, input.propertyId, input.parentId, input.items),
        transaction,
      );
      const createInputs = input.items.map<CreateRentalSpaceInput>((item) => ({
        organizationId: authContext.organizationId,
        propertyId: input.propertyId,
        parentId: input.parentId,
        name: item.name,
        code: item.code,
        type: input.type,
        customTypeName: input.customTypeName,
        isRentable: input.isRentable,
        sortOrder: item.sortOrder,
        note: input.note,
        createdByUserId: authContext.userId,
        updatedByUserId: authContext.userId,
      }));

      let spaces: RentalSpaceRecord[];
      try {
        spaces = await this.repository.createMany(createInputs, transaction);
      } catch (error) {
        this.policy.rethrowSiblingConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.batch_created",
          targetType: "rental_property",
          targetId: input.propertyId,
          result: "succeeded",
          metadata: {
            propertyId: input.propertyId,
            parentId: input.parentId,
            count: spaces.length,
          },
        },
        transaction,
      );
      return { ids: spaces.map(({ id }) => id) };
    });
  }

  /** 更新空间资料，不改变父节点或自身状态。 */
  update(authContext: AuthContext, dto: UpdateSpaceDto): Promise<RentalSpaceMutationResult> {
    const { id, changes, changedFields } = normalizeUpdateDto(dto);
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const { space: current } = await this.lockCurrentScope(
        authContext.organizationId,
        id,
        transaction,
      );
      const next = this.policy.mergeUpdate(current, changes);
      next.updatedByUserId = authContext.userId;
      const siblingIdentityChanged = next.name !== current.name || next.code !== current.code;
      if (siblingIdentityChanged) {
        await this.policy.assertSiblingAvailable(
          siblingInput(
            authContext.organizationId,
            current.propertyId,
            current.parentId,
            [next],
            current.id,
          ),
          transaction,
        );
      }

      try {
        await this.repository.update(next, transaction);
      } catch (error) {
        this.policy.rethrowSiblingConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.updated",
          targetType: "rental_space",
          targetId: current.id,
          result: "succeeded",
          metadata: { changedFields },
        },
        transaction,
      );
      return { id: current.id };
    });
  }

  /** 在同房产四层树内移动空间，并验证环与整个子树深度。 */
  move(authContext: AuthContext, dto: MoveSpaceDto): Promise<RentalSpaceMutationResult> {
    const parentId = dto.parentId ?? null;
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const { property, space: current } = await this.lockCurrentScope(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      this.policy.assertPropertyAllowsTreeMutation(property);

      let targetParentLevel = 0;
      if (parentId !== null) {
        const target = await this.policy.requireParentForMutation(
          authContext.organizationId,
          current.propertyId,
          parentId,
          transaction,
        );
        const ancestors = await this.repository.listAncestors(
          authContext.organizationId,
          current.propertyId,
          target.id,
          transaction,
        );
        this.policy.assertAcyclicMove(
          current.id,
          target.id,
          ancestors.map(({ id }) => id),
        );
        targetParentLevel = ancestors.length;
      }
      const subtreeRelativeDepth = await this.repository.getSubtreeRelativeDepth(
        authContext.organizationId,
        current.propertyId,
        current.id,
        transaction,
      );
      this.policy.assertTargetDepth(targetParentLevel, subtreeRelativeDepth);
      await this.policy.assertSiblingAvailable(
        siblingInput(
          authContext.organizationId,
          current.propertyId,
          parentId,
          [current],
          current.id,
        ),
        transaction,
      );

      if (parentId !== current.parentId) {
        await this.contractReference.assertSpaceCanMove(
          authContext.organizationId,
          current.propertyId,
          current.id,
          current.parentId,
          parentId,
          transaction,
        );
      }

      try {
        await this.repository.move(
          {
            id: current.id,
            organizationId: authContext.organizationId,
            propertyId: current.propertyId,
            parentId,
            sortOrder: dto.sortOrder,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowSiblingConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.moved",
          targetType: "rental_space",
          targetId: current.id,
          result: "succeeded",
          metadata: {
            propertyId: current.propertyId,
            fromParentId: current.parentId,
            toParentId: parentId,
          },
        },
        transaction,
      );
      return { id: current.id };
    });
  }

  /** 只改变选中空间自身状态，不改写任何后代。 */
  setStatus(authContext: AuthContext, dto: SetSpaceStatusDto): Promise<RentalSpaceMutationResult> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const { space: current } = await this.lockCurrentScope(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (dto.isActive && !current.isActive) {
        await this.policy.assertSiblingAvailable(
          siblingInput(
            authContext.organizationId,
            current.propertyId,
            current.parentId,
            [current],
            current.id,
          ),
          transaction,
        );
      }
      if (!dto.isActive && current.isActive) {
        await this.contractReference.assertSpaceCanDeactivate(
          authContext.organizationId,
          current.propertyId,
          current.id,
          transaction,
        );
      }
      try {
        await this.repository.setStatus(
          {
            id: current.id,
            organizationId: authContext.organizationId,
            propertyId: current.propertyId,
            isActive: dto.isActive,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowSiblingConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.status_changed",
          targetType: "rental_space",
          targetId: current.id,
          result: "succeeded",
          metadata: { isActive: dto.isActive },
        },
        transaction,
      );
      return { id: current.id };
    });
  }

  /** 仅在没有未删除直属子空间时软删除选中空间。 */
  delete(authContext: AuthContext, dto: DeleteSpaceDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const { space: current } = await this.lockCurrentScope(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      await this.policy.assertNoActiveChildren(current, transaction);
      await this.repository.softDelete(
        {
          id: current.id,
          organizationId: authContext.organizationId,
          propertyId: current.propertyId,
          deletedByUserId: authContext.userId,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_space.deleted",
          targetType: "rental_space",
          targetId: current.id,
          result: "succeeded",
          metadata: { propertyId: current.propertyId, parentId: current.parentId },
        },
        transaction,
      );
    });
  }

  private async lockParentAndGetLevel(
    organizationId: string,
    propertyId: string,
    parentId: string | null,
    executor: AppDbExecutor,
  ): Promise<number> {
    if (parentId === null) return 0;
    const parent = await this.policy.requireParentForMutation(
      organizationId,
      propertyId,
      parentId,
      executor,
    );
    const ancestors = await this.repository.listAncestors(
      organizationId,
      propertyId,
      parent.id,
      executor,
    );
    return ancestors.length;
  }

  private async lockCurrentScope(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<LockedSpaceScope> {
    const resolved = await this.policy.resolveActiveSpace(organizationId, id, executor);
    const property = await this.policy.requirePropertyForUpdate(
      organizationId,
      resolved.propertyId,
      executor,
    );
    const space = await this.policy.requireSpaceForUpdate(
      organizationId,
      resolved.propertyId,
      id,
      executor,
    );
    return { property, space };
  }

  private async withLeaseStates<
    T extends {
      items: Array<RentalSpaceNodeRecord | RentalSpaceSearchRecord>;
      total: number;
      page: number;
      pageSize: number;
    },
  >(
    authContext: AuthContext,
    propertyId: string,
    page: T,
    mapPage: (page: T) => RentalSpaceChildrenPage | RentalSpaceSearchPage,
  ): Promise<RentalSpaceChildrenPage | RentalSpaceSearchPage> {
    if (page.items.length === 0) return mapPage(page);
    const today = await this.contractReference.organizationToday(authContext.organizationId);
    const facts = await this.contractReference.listSpaceLeaseStates(
      authContext.organizationId,
      propertyId,
      page.items.map(({ id }) => id),
      today,
    );
    const items = page.items.map((item) => ({
      ...item,
      ...ContractReferenceService.toLeaseState(
        facts.get(item.id) ?? {
          spaceId: item.id,
          hasOwnActive: false,
          hasOwnExpiringSoon: false,
          hasOwnUpcoming: false,
          hasAncestorCurrentOrUpcoming: false,
          hasDescendantCurrentOrUpcoming: false,
        },
      ),
    }));
    return mapPage({ ...page, items } as T);
  }
}

function normalizeCreateDto(dto: CreateSpaceDto) {
  return {
    propertyId: dto.propertyId,
    parentId: dto.parentId ?? null,
    name: dto.name.trim(),
    code: normalizeOptionalText(dto.code),
    type: dto.type,
    customTypeName: normalizeOptionalText(dto.customTypeName),
    isRentable: dto.isRentable,
    sortOrder: dto.sortOrder ?? 0,
    note: normalizeOptionalText(dto.note),
  };
}

function normalizeBatchDto(dto: BatchCreateSpacesDto) {
  return {
    propertyId: dto.propertyId,
    parentId: dto.parentId ?? null,
    type: dto.type,
    customTypeName: normalizeOptionalText(dto.customTypeName),
    isRentable: dto.isRentable,
    note: normalizeOptionalText(dto.note),
    items: dto.items.map((item) => ({
      name: item.name.trim(),
      code: normalizeOptionalText(item.code),
      sortOrder: item.sortOrder ?? 0,
    })),
  };
}

function normalizeUpdateDto(dto: UpdateSpaceDto): {
  id: string;
  changes: Partial<RentalSpaceUpdateValues>;
  changedFields: string[];
} {
  const { id, ...rawChanges } = dto;
  const changes: Partial<RentalSpaceUpdateValues> = { ...rawChanges };
  if (rawChanges.name !== undefined) changes.name = rawChanges.name.trim();
  if (rawChanges.code !== undefined) changes.code = normalizeOptionalText(rawChanges.code);
  if (rawChanges.customTypeName !== undefined) {
    changes.customTypeName = normalizeOptionalText(rawChanges.customTypeName);
  }
  if (rawChanges.note !== undefined) changes.note = normalizeOptionalText(rawChanges.note);
  return { id, changes, changedFields: Object.keys(rawChanges) };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function siblingInput(
  organizationId: string,
  propertyId: string,
  parentId: string | null,
  items: readonly { name: string; code?: string | null }[],
  excludeId?: string,
) {
  return {
    organizationId,
    propertyId,
    parentId,
    names: items.map(({ name }) => name),
    codes: items.flatMap(({ code }) => (code ? [code] : [])),
    ...(excludeId === undefined ? {} : { excludeId }),
  };
}

function toChildrenPage(page: {
  items: RentalSpaceNodeRecord[];
  total: number;
  page: number;
  pageSize: number;
}): RentalSpaceChildrenPage {
  return {
    items: page.items.map((item) => toSpaceNode(item)),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

function toSearchPage(page: {
  items: RentalSpaceSearchRecord[];
  total: number;
  page: number;
  pageSize: number;
}): RentalSpaceSearchPage {
  return {
    items: page.items.map((item) => toSearchResult(item)),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

function toSpaceNode(space: RentalSpaceNodeRecord): RentalSpaceNode {
  const node = {
    id: space.id,
    propertyId: space.propertyId,
    parentId: space.parentId,
    name: space.name,
    code: space.code,
    type: space.type,
    customTypeName: space.customTypeName,
    isRentable: space.isRentable,
    isActive: space.isActive,
    note: space.note,
    isEffectivelyActive: space.isEffectivelyActive,
    sortOrder: space.sortOrder,
    hasChildren: space.hasChildren,
  };
  if (space.leaseStatus !== undefined) {
    return {
      ...node,
      leaseStatus: space.leaseStatus,
      leaseBlockedReason: space.leaseBlockedReason ?? null,
      hasUpcomingContract: space.hasUpcomingContract ?? false,
    };
  }
  return node as RentalSpaceNode;
}

function toSearchResult(space: RentalSpaceSearchRecord): RentalSpaceSearchResult {
  return {
    ...toSpaceNode(space),
    path: space.path.map(({ id, name }) => ({ id, name })),
  };
}

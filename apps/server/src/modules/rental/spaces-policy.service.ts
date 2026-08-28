import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RentalPropertyType, RentalSpaceType } from "@xpense/shared";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { PropertiesRepository } from "./properties.repository.js";
import type {
  RentalPropertyDetailRecord,
  RentalPropertyRecord,
} from "./properties.repository.types.js";
import { assertCustomTypeName, findBatchConflicts, mergeSpaceUpdate } from "./rental.rules.js";
import type { RentalBatchSpaceItem, RentalSpaceUpdateValues } from "./rental.types.js";
import { SpacesRepository } from "./spaces.repository.js";
import type { RentalSpaceRecord, UpdateRentalSpaceInput } from "./spaces.repository.types.js";

const MAX_SPACE_LEVELS = 4;
const SPACE_SIBLING_UNIQUE_CONSTRAINTS = new Set([
  "rental_spaces_active_root_name_unique",
  "rental_spaces_active_child_name_unique",
  "rental_spaces_active_root_code_unique",
  "rental_spaces_active_child_code_unique",
]);

/** 集中执行空间写锁、归属、树深度、同级冲突与删除策略。 */
@Injectable()
export class SpacesPolicyService {
  constructor(
    private readonly repository: SpacesRepository,
    private readonly propertiesRepository: PropertiesRepository,
    private readonly writeLockRepository: BookkeepingWriteLockRepository,
  ) {}

  /** 在所有空间写规则读取前锁定可信认证组织。 */
  async lockWriteScope(organizationId: string, executor: AppDbExecutor): Promise<void> {
    if (!(await this.writeLockRepository.lockOrganization(organizationId, executor))) {
      throw this.notFound("组织不存在");
    }
  }

  /** 读取当前组织内未软删除房产。 */
  async requireReadableProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<RentalPropertyDetailRecord> {
    const property = await this.propertiesRepository.findActiveOwned(organizationId, propertyId);
    if (!property) throw this.notFound("租赁房产不存在");
    return property;
  }

  /** 读取指定房产内未软删除父空间。 */
  async requireReadableParent(
    organizationId: string,
    propertyId: string,
    parentId: string,
  ): Promise<RentalSpaceRecord> {
    const parent = await this.repository.findActiveOwned(organizationId, propertyId, parentId);
    if (!parent) throw this.notFound("租赁空间不存在");
    return parent;
  }

  /** 锁定当前组织内未软删除房产。 */
  async requirePropertyForUpdate(
    organizationId: string,
    propertyId: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const property = await this.propertiesRepository.findActiveOwnedForUpdate(
      organizationId,
      propertyId,
      executor,
    );
    if (!property) throw this.notFound("租赁房产不存在");
    return property;
  }

  /** 按组织解析空间所属房产，不泄露其他组织的资源。 */
  async resolveActiveSpace(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord> {
    const space = await this.repository.findActiveOwnedById(organizationId, id, executor);
    if (!space) throw this.notFound("租赁空间不存在");
    return space;
  }

  /** 在房产锁之后锁定当前空间。 */
  async requireSpaceForUpdate(
    organizationId: string,
    propertyId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord> {
    const space = await this.repository.findActiveOwnedForUpdate(
      organizationId,
      propertyId,
      id,
      executor,
    );
    if (!space) throw this.notFound("租赁空间不存在");
    return space;
  }

  /** 解析、校验同房产并锁定目标父空间。 */
  async requireParentForMutation(
    organizationId: string,
    propertyId: string,
    parentId: string,
    executor: AppDbExecutor,
  ): Promise<RentalSpaceRecord> {
    const resolved = await this.resolveActiveSpace(organizationId, parentId, executor);
    if (resolved.propertyId !== propertyId) {
      throw this.badRequest("父空间必须与目标空间属于同一房产");
    }
    return this.requireSpaceForUpdate(organizationId, propertyId, parentId, executor);
  }

  /** 停用房产禁止新增、批量创建和移动空间。 */
  assertPropertyAllowsTreeMutation(property: RentalPropertyRecord): void {
    if (!property.isActive) throw this.badRequest("租赁房产已停用，不能新增或移动空间");
  }

  /** 校验创建或批量创建后的最大层级。 */
  assertTargetDepth(targetParentLevel: number, subtreeRelativeDepth = 0): void {
    if (targetParentLevel + 1 + subtreeRelativeDepth > MAX_SPACE_LEVELS) {
      throw this.badRequest("租赁空间树最多允许四层");
    }
  }

  /** 拒绝移动到自身或自身后代。 */
  assertAcyclicMove(
    currentId: string,
    targetParentId: string,
    ancestorIds: readonly string[],
  ): void {
    if (targetParentId === currentId || ancestorIds.includes(currentId)) {
      throw this.badRequest("租赁空间不能移动到自身或自身后代");
    }
  }

  /** 拒绝同父节点下启用且未删除的同名或同编码空间。 */
  async assertSiblingAvailable(
    input: {
      organizationId: string;
      propertyId: string;
      parentId: string | null;
      names: readonly string[];
      codes: readonly string[];
      excludeId?: string;
    },
    executor: AppDbExecutor,
  ): Promise<void> {
    if ((await this.repository.findSiblingConflicts(input, executor)).length > 0) {
      throw this.conflict("同级启用空间的名称或编号已存在");
    }
  }

  /** 批量输入必须为 1..500 项，且规范化后不得同名或同编码。 */
  assertBatchInput(items: readonly RentalBatchSpaceItem[]): void {
    if (items.length < 1 || items.length > 500) {
      throw this.badRequest("批量创建空间数量必须在 1 到 500 之间");
    }
    if (items.some(({ name }) => name.trim().length === 0)) {
      throw this.badRequest("批量创建空间名称不能为空");
    }
    if (findBatchConflicts(items).length > 0) {
      throw this.conflict("批量创建中存在重复的空间名称或编号");
    }
  }

  /** 在服务边界再次校验类型与自定义类型名称关系。 */
  assertType(
    type: RentalPropertyType | RentalSpaceType,
    customTypeName: string | null | undefined,
  ): void {
    try {
      assertCustomTypeName(type, customTypeName);
    } catch (error) {
      if (error instanceof Error) throw this.badRequest(error.message);
      throw error;
    }
  }

  /** 合并部分空间资料并将跨字段类型错误转换为稳定校验异常。 */
  mergeUpdate(
    current: RentalSpaceRecord,
    update: Partial<RentalSpaceUpdateValues>,
  ): UpdateRentalSpaceInput {
    try {
      const merged = mergeSpaceUpdate(current, update);
      return {
        id: current.id,
        organizationId: current.organizationId,
        propertyId: current.propertyId,
        name: merged.name,
        code: merged.code,
        type: merged.type,
        customTypeName: merged.customTypeName,
        isRentable: merged.isRentable,
        isActive: current.isActive,
        sortOrder: merged.sortOrder,
      };
    } catch (error) {
      if (error instanceof Error) throw this.badRequest(error.message);
      throw error;
    }
  }

  /** 拒绝仍包含未软删除直属子节点的空间删除。 */
  async assertNoActiveChildren(space: RentalSpaceRecord, executor: AppDbExecutor): Promise<void> {
    if (
      await this.repository.hasActiveChildren(
        space.organizationId,
        space.propertyId,
        space.id,
        executor,
      )
    ) {
      throw this.conflict("租赁空间仍有未删除子空间，请改为停用");
    }
  }

  /** 将四个活动同级唯一约束映射为稳定 409。 */
  rethrowSiblingConflict(error: unknown): never {
    if (isSpaceSiblingUniqueViolation(error)) {
      throw this.conflict("同级启用空间的名称或编号已存在");
    }
    throw error;
  }

  private badRequest(message: string): BadRequestException {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

/** 识别空间活动同级唯一约束，包括数据库驱动包装的 cause 链。 */
function isSpaceSiblingUniqueViolation(error: unknown, visited = new Set<object>()): boolean {
  if (error === null || typeof error !== "object" || visited.has(error)) return false;
  visited.add(error);
  const constraint =
    ("constraint" in error && error.constraint) ||
    ("constraint_name" in error && error.constraint_name);
  if (
    "code" in error &&
    error.code === "23505" &&
    typeof constraint === "string" &&
    SPACE_SIBLING_UNIQUE_CONSTRAINTS.has(constraint)
  ) {
    return true;
  }
  return "cause" in error && isSpaceSiblingUniqueViolation(error.cause, visited);
}

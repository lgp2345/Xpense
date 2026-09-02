import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import type { ContractReferenceSummary } from "./contracts.repository.types.js";
import { PropertiesRepository } from "./properties.repository.js";
import type {
  RentalPropertyRecord,
  UpdateRentalPropertyInput,
} from "./properties.repository.types.js";
import { mergePropertyUpdate } from "./rental.rules.js";
import type { RentalPropertyUpdateValues } from "./rental.types.js";

const PROPERTY_NAME_UNIQUE_CONSTRAINT = "rental_properties_active_name_unique";

/** 集中执行房产写入的组织锁、归属、名称冲突与删除策略。 */
@Injectable()
export class PropertiesPolicyService {
  constructor(
    private readonly repository: PropertiesRepository,
    private readonly writeLockRepository: BookkeepingWriteLockRepository,
  ) {}

  /** 在任何房产写规则读取前锁定当前组织的稳定竞争行。 */
  async lockWriteScope(organizationId: string, executor: AppDbExecutor): Promise<void> {
    const locked = await this.writeLockRepository.lockOrganization(organizationId, executor);
    if (!locked) throw this.notFound("组织不存在");
  }

  /** 锁定并返回当前组织内未软删除房产，不泄露其他组织记录。 */
  async requireActiveForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyRecord> {
    const property = await this.repository.findActiveOwnedForUpdate(organizationId, id, executor);
    if (!property) throw this.notFound("租赁房产不存在");

    return property;
  }

  /** 拒绝同组织中仍未软删除的同名房产。 */
  async assertActiveNameAvailable(
    organizationId: string,
    name: string,
    excludeId: string | undefined,
    executor: AppDbExecutor,
  ): Promise<void> {
    const conflict = await this.repository.findActiveNameConflict(
      { organizationId, name, excludeId },
      executor,
    );
    if (conflict) throw this.conflict("租赁房产名称已存在");
  }

  /** 合并部分更新并把跨字段类型错误转换为稳定校验异常。 */
  mergeUpdate(
    current: RentalPropertyRecord,
    update: Partial<RentalPropertyUpdateValues>,
  ): UpdateRentalPropertyInput {
    try {
      const merged = mergePropertyUpdate(current, update);

      return {
        id: current.id,
        organizationId: current.organizationId,
        name: merged.name,
        type: merged.type,
        customTypeName: merged.customTypeName,
        countryCode: merged.countryCode,
        province: merged.province,
        city: merged.city,
        district: merged.district,
        addressLine: merged.addressLine,
        note: merged.note,
        isActive: current.isActive,
        updatedByUserId: current.updatedByUserId,
      };
    } catch (error) {
      if (error instanceof Error) throw this.badRequest(error.message);
      throw error;
    }
  }

  /** 拒绝仍包含未软删除空间的房产删除。 */
  async assertNoActiveSpaces(
    property: RentalPropertyRecord,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (await this.repository.hasActiveSpace(property.organizationId, property.id, executor)) {
      throw this.conflict("租赁房产仍有未删除空间，请改为停用");
    }
  }

  /** 拒绝存在当前或未来合同引用的房产停用。 */
  assertCanDeactivate(summary: ContractReferenceSummary): void {
    if (summary.own) throw this.conflict("租赁房产存在当前或未来合同，不能停用");
  }

  /** 将并发写入触发的未删除房产同名约束转换为稳定冲突异常。 */
  rethrowNameConflict(error: unknown): never {
    if (isPropertyNameUniqueViolation(error)) {
      throw this.conflict("租赁房产名称已存在");
    }
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

  /** 创建房产状态冲突异常。 */
  private conflict(message: string): ConflictException {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

/** 识别房产未删除名称唯一约束，包括数据库驱动包装的 cause 链。 */
function isPropertyNameUniqueViolation(error: unknown, visited = new Set<object>()): boolean {
  if (error === null || typeof error !== "object" || visited.has(error)) return false;
  visited.add(error);
  const constraint =
    ("constraint" in error && error.constraint) ||
    ("constraint_name" in error && error.constraint_name);
  if ("code" in error && error.code === "23505" && constraint === PROPERTY_NAME_UNIQUE_CONSTRAINT) {
    return true;
  }

  return "cause" in error && isPropertyNameUniqueViolation(error.cause, visited);
}

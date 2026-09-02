import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { mergeTenantUpdate, type RentalTenantMutableValues } from "./tenant.rules.js";
import { TenantsRepository } from "./tenants.repository.js";
import type { RentalTenantDetailRecord, RentalTenantRecord } from "./tenants.repository.types.js";

const TENANT_DOCUMENT_UNIQUE_CONSTRAINT = "rental_tenants_active_document_hash_unique";

/** 集中转换租户归属、证件冲突、字段组合和删除引用领域错误。 */
@Injectable()
export class TenantsPolicyService {
  constructor(private readonly repository: TenantsRepository) {}

  /** 返回当前组织内未软删除租户，不泄露其他组织或已删除记录。 */
  async requireActiveOwned(
    organizationId: string,
    id: string,
    executor?: AppDbExecutor,
  ): Promise<RentalTenantDetailRecord> {
    const tenant = executor
      ? await this.repository.findActiveOwned(organizationId, id, executor)
      : await this.repository.findActiveOwned(organizationId, id);
    if (!tenant) throw this.notFound();
    return tenant;
  }

  /** 在事务中锁定当前组织内未软删除租户。 */
  async requireActiveForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord> {
    const tenant = await this.repository.findActiveOwnedForUpdate(organizationId, id, executor);
    if (!tenant) throw this.notFound();
    return tenant;
  }

  /** 拒绝同组织内未软删除租户使用相同证件摘要。 */
  async assertDocumentAvailable(
    organizationId: string,
    lookupHash: string | null,
    excludeId: string | undefined,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (lookupHash === null) return;
    const conflict = await this.repository.findDocumentConflict(
      organizationId,
      lookupHash,
      excludeId,
      executor,
    );
    if (conflict) throw this.conflict("租户证件号码已存在");
  }

  /** 合并部分更新，并把完整快照的字段组合错误转换为稳定校验异常。 */
  mergeUpdate(
    current: RentalTenantMutableValues,
    update: Partial<RentalTenantMutableValues>,
  ): RentalTenantMutableValues {
    try {
      return mergeTenantUpdate(current, update);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      }
      throw error;
    }
  }

  /** 拒绝删除仍被未删除合同引用的租户。 */
  async assertNoContractReference(
    tenant: RentalTenantRecord,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (await this.repository.hasContractReference(tenant.organizationId, tenant.id, executor)) {
      throw this.conflict("租户仍被租赁合同引用，请改为停用");
    }
  }

  /** 将租户持久化异常转换为稳定的领域错误，避免数据库参数进入全局日志。 */
  rethrowPersistenceFailure(error: unknown): never {
    if (isTenantDocumentUniqueViolation(error)) {
      throw this.conflict("租户证件号码已存在");
    }
    throw new Error("Rental tenant persistence failed");
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁租户不存在" });
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

/** 识别租户有效证件摘要唯一约束及数据库驱动包装的 cause 链。 */
function isTenantDocumentUniqueViolation(error: unknown, visited = new Set<object>()): boolean {
  if (error === null || typeof error !== "object" || visited.has(error)) return false;
  visited.add(error);
  const constraint =
    ("constraint" in error && error.constraint) ||
    ("constraint_name" in error && error.constraint_name);
  if (
    "code" in error &&
    error.code === "23505" &&
    constraint === TENANT_DOCUMENT_UNIQUE_CONSTRAINT
  ) {
    return true;
  }
  return "cause" in error && isTenantDocumentUniqueViolation(error.cause, visited);
}

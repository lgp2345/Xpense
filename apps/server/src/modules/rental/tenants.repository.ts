import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { rentalContractPartyPeriods, rentalContracts, rentalTenants } from "../../db/schema.js";
import {
  buildActiveTenantCondition,
  buildActiveTenantDocumentConflictCondition,
  buildActiveTenantForUpdateQuery,
  buildTenantCountQuery,
  buildTenantListQuery,
} from "./tenants.queries.js";
import { tenantDetailFields, tenantRecordFields } from "./tenants.repository.select-fields.js";
import type {
  CreateRentalTenantInput,
  RentalTenantDetailRecord,
  RentalTenantPageRecord,
  RentalTenantRecord,
  SetRentalTenantStatusInput,
  SoftDeleteRentalTenantInput,
  TenantListInput,
  UpdateRentalTenantInput,
} from "./tenants.repository.types.js";

export type { RentalTenantRecord } from "./tenants.repository.types.js";

/** 负责租户组织作用域查询、合同引用检查与基础持久化。 */
@Injectable()
export class TenantsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 查询组织内未软删除租户的分页摘要及合同数量。 */
  async list(organizationId: string, input: TenantListInput): Promise<RentalTenantPageRecord> {
    const [items, totals] = await Promise.all([
      buildTenantListQuery(this.db, organizationId, input),
      buildTenantCountQuery(this.db, organizationId, input),
    ]);

    return {
      items,
      total: totals[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 查询组织内未软删除租户，供详情和受控敏感资料映射使用。 */
  async findActiveOwned(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalTenantDetailRecord | null> {
    const [tenant] = await executor
      .select(tenantDetailFields)
      .from(rentalTenants)
      .where(buildActiveTenantCondition(organizationId, id))
      .limit(1);

    return tenant ?? null;
  }

  /** 在调用方事务中锁定组织内未软删除租户。 */
  async findActiveOwnedForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord | null> {
    const [tenant] = await buildActiveTenantForUpdateQuery(executor, organizationId, id);

    return tenant ?? null;
  }

  /** 按不可逆证件检索摘要检查组织内未软删除租户冲突。 */
  async findDocumentConflict(
    organizationId: string,
    documentNumberLookupHash: string,
    excludeId?: string,
    executor: AppDbExecutor = this.db,
  ): Promise<{ id: string } | null> {
    const [tenant] = await executor
      .select({ id: rentalTenants.id })
      .from(rentalTenants)
      .where(
        buildActiveTenantDocumentConflictCondition(
          organizationId,
          documentNumberLookupHash,
          excludeId,
        ),
      )
      .limit(1);

    return tenant ?? null;
  }

  /** 在指定执行器中创建租户。 */
  async create(
    input: CreateRentalTenantInput,
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord> {
    const [tenant] = await executor
      .insert(rentalTenants)
      .values(input)
      .returning(tenantRecordFields);
    if (!tenant) throw new Error("Failed to create rental tenant");

    return tenant;
  }

  /** 更新组织内未软删除租户的全部可变持久化资料。 */
  async update(
    input: UpdateRentalTenantInput,
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord> {
    const [tenant] = await executor
      .update(rentalTenants)
      .set({
        type: input.type,
        name: input.name,
        phone: input.phone,
        email: input.email,
        primaryContactName: input.primaryContactName,
        documentCountryCode: input.documentCountryCode,
        documentType: input.documentType,
        documentTypeOtherName: input.documentTypeOtherName,
        documentNumberLookupHash: input.documentNumberLookupHash,
        maskedDocumentNumber: input.maskedDocumentNumber,
        sensitiveIdentityCiphertext: input.sensitiveIdentityCiphertext,
        sensitiveIdentityKeyVersion: input.sensitiveIdentityKeyVersion,
        isActive: input.isActive,
        note: input.note,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(buildActiveTenantCondition(input.organizationId, input.id))
      .returning(tenantRecordFields);
    if (!tenant) throw new Error("Failed to update active rental tenant");

    return tenant;
  }

  /** 仅更新组织内未软删除租户的启用状态。 */
  async setStatus(
    input: SetRentalTenantStatusInput,
    executor: AppDbExecutor,
  ): Promise<RentalTenantRecord> {
    const [tenant] = await executor
      .update(rentalTenants)
      .set({
        isActive: input.isActive,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(buildActiveTenantCondition(input.organizationId, input.id))
      .returning(tenantRecordFields);
    if (!tenant) throw new Error("Failed to set rental tenant status");

    return tenant;
  }

  /** 判断租户是否仍被组织内未软删除合同引用。 */
  async hasContractReference(
    organizationId: string,
    tenantId: string,
    executor: AppDbExecutor,
  ): Promise<boolean> {
    const [reference] = await executor
      .select({ id: rentalContractPartyPeriods.id })
      .from(rentalContractPartyPeriods)
      .innerJoin(
        rentalContracts,
        and(
          eq(rentalContractPartyPeriods.organizationId, rentalContracts.organizationId),
          eq(rentalContractPartyPeriods.contractId, rentalContracts.id),
        ),
      )
      .where(
        and(
          eq(rentalContractPartyPeriods.organizationId, organizationId),
          eq(rentalContractPartyPeriods.tenantId, tenantId),
          isNull(rentalContracts.deletedAt),
        ),
      )
      .limit(1);

    return reference !== undefined;
  }

  /** 软删除组织内未软删除租户并记录操作者。 */
  async softDelete(input: SoftDeleteRentalTenantInput, executor: AppDbExecutor): Promise<void> {
    const now = new Date();
    await executor
      .update(rentalTenants)
      .set({
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      })
      .where(buildActiveTenantCondition(input.organizationId, input.id));
  }
}

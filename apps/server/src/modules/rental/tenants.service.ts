import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  RentalTenantDetail,
  RentalTenantPage,
  RentalTenantSensitiveDetail,
  RentalTenantSummary,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { CreateTenantDto } from "./dto/create-tenant.dto.js";
import type { DeleteTenantDto } from "./dto/delete-tenant.dto.js";
import type { ListTenantsDto } from "./dto/list-tenants.dto.js";
import type { RevealTenantSensitiveDto } from "./dto/reveal-tenant-sensitive.dto.js";
import type { SetTenantStatusDto } from "./dto/set-tenant-status.dto.js";
import type { TenantDetailDto } from "./dto/tenant-detail.dto.js";
import type { UpdateTenantDto } from "./dto/update-tenant.dto.js";
import { type RentalTenantMutableValues, toSensitiveIdentity } from "./tenant.rules.js";
import type { RentalSensitiveIdentity } from "./tenant-identity.types.js";
import {
  maskDocumentNumber,
  normalizeDocumentNumber,
  TenantIdentityCryptoService,
} from "./tenant-identity-crypto.service.js";
import { TenantsRepository } from "./tenants.repository.js";
import type {
  RentalTenantDetailRecord,
  RentalTenantRecord,
  RentalTenantSummaryRecord,
  TenantListInput,
} from "./tenants.repository.types.js";
import { TenantsPolicyService } from "./tenants-policy.service.js";

const SENSITIVE_KEY_VERSION = 1;
const EMPTY_SENSITIVE_IDENTITY: RentalSensitiveIdentity = {
  documentNumber: null,
  birthDate: null,
  gender: null,
  ethnicity: null,
  documentAddress: null,
};

/** 编排租户组织隔离、身份加密、事务写入、软删除和必需审计。 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly repository: TenantsRepository,
    private readonly policy: TenantsPolicyService,
    private readonly crypto: TenantIdentityCryptoService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 返回组织内未软删除租户分页，不读取身份密文。 */
  async list(authContext: AuthContext, dto: ListTenantsDto): Promise<RentalTenantPage> {
    const page = await this.repository.list(
      authContext.organizationId,
      this.toListInput(authContext.organizationId, dto),
    );
    return { ...page, items: page.items.map(toTenantSummary) };
  }

  /** 返回普通详情，直接读取持久化证件掩码。 */
  async detail(authContext: AuthContext, dto: TenantDetailDto): Promise<RentalTenantDetail> {
    const tenant = await this.policy.requireActiveOwned(authContext.organizationId, dto.id);
    return this.toTenantDetail(tenant);
  }

  /** 在事务内生成组织摘要和密文后创建租户。 */
  create(authContext: AuthContext, dto: CreateTenantDto): Promise<RentalTenantDetail> {
    return this.transactions.run(async (transaction) => {
      const values = normalizeMutableValues(toCreateValues(dto));
      const identity = toSensitiveIdentity(values);
      const lookupHash = this.lookupHash(authContext.organizationId, values);
      await this.policy.assertDocumentAvailable(
        authContext.organizationId,
        lookupHash,
        undefined,
        transaction,
      );

      let tenant: RentalTenantRecord;
      try {
        tenant = await this.repository.create(
          {
            organizationId: authContext.organizationId,
            ...toPersistedValues(values, identity, lookupHash, this.crypto),
            createdByUserId: authContext.userId,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowPersistenceFailure(error);
      }
      await this.auditService.appendRequired(
        tenantAudit(authContext, tenant.id, "created", { type: tenant.type }),
        transaction,
      );
      return this.readDetail(authContext.organizationId, tenant.id, transaction);
    });
  }

  /** 在事务内合并完整快照并重新生成摘要和密文。 */
  update(authContext: AuthContext, dto: UpdateTenantDto): Promise<RentalTenantDetail> {
    return this.transactions.run(async (transaction) => {
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      const { id: _id, ...changes } = dto;
      const currentValues = toMutableValues(current, this.decryptIdentity(current));
      const values = normalizeMutableValues(this.policy.mergeUpdate(currentValues, changes));
      const identity = toSensitiveIdentity(values);
      const lookupHash = this.lookupHash(authContext.organizationId, values);
      await this.policy.assertDocumentAvailable(
        authContext.organizationId,
        lookupHash,
        current.id,
        transaction,
      );

      let tenant: RentalTenantRecord;
      try {
        tenant = await this.repository.update(
          {
            id: current.id,
            organizationId: authContext.organizationId,
            ...toPersistedValues(values, identity, lookupHash, this.crypto),
            isActive: current.isActive,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowPersistenceFailure(error);
      }
      await this.auditService.appendRequired(
        tenantAudit(authContext, current.id, "updated", {
          changedFields: Object.keys(changes).filter((field) => !sensitiveAuditFields.has(field)),
        }),
        transaction,
      );
      return this.readDetail(authContext.organizationId, tenant.id, transaction);
    });
  }

  /** 在事务内更新租户状态并写入必需审计。 */
  setStatus(authContext: AuthContext, dto: SetTenantStatusDto): Promise<RentalTenantDetail> {
    return this.transactions.run(async (transaction) => {
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (current.isActive === dto.isActive) {
        return this.readDetail(authContext.organizationId, current.id, transaction);
      }
      let tenant: RentalTenantRecord;
      try {
        tenant = await this.repository.setStatus(
          {
            organizationId: authContext.organizationId,
            id: current.id,
            isActive: dto.isActive,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowPersistenceFailure(error);
      }
      await this.auditService.appendRequired(
        tenantAudit(authContext, current.id, "status_changed", { isActive: dto.isActive }),
        transaction,
      );
      return this.readDetail(authContext.organizationId, tenant.id, transaction);
    });
  }

  /** 仅软删除未被合同引用的租户。 */
  delete(authContext: AuthContext, dto: DeleteTenantDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      await this.policy.assertNoContractReference(current, transaction);
      try {
        await this.repository.softDelete(
          {
            organizationId: authContext.organizationId,
            id: current.id,
            deletedByUserId: authContext.userId,
            updatedByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowPersistenceFailure(error);
      }
      await this.auditService.appendRequired(
        tenantAudit(authContext, current.id, "deleted", {}),
        transaction,
      );
    });
  }

  /** 必需审计成功后才解密并返回完整身份资料。 */
  async revealSensitive(
    authContext: AuthContext,
    dto: RevealTenantSensitiveDto,
  ): Promise<RentalTenantSensitiveDetail> {
    const tenant = await this.policy.requireActiveOwned(authContext.organizationId, dto.id);
    await this.auditService.appendRequired(
      tenantAudit(authContext, tenant.id, "sensitive_revealed", {}),
    );
    return { tenantId: tenant.id, ...this.decryptIdentity(tenant) };
  }

  private toListInput(organizationId: string, dto: ListTenantsDto): TenantListInput {
    const { documentNumber, ...input } = dto;
    if (documentNumber === undefined) return input;
    if (!dto.documentCountryCode || !dto.documentType) {
      throw new BadRequestException({
        code: apiErrorCodes.validationFailed,
        message: "按证件号码查询时必须同时提供证件国家和类型",
      });
    }
    const normalized = normalizeDocumentNumber(
      dto.documentCountryCode,
      dto.documentType,
      documentNumber,
    );
    return {
      ...input,
      documentNumberLookupHash: this.crypto.lookupHash(organizationId, {
        countryCode: dto.documentCountryCode,
        type: dto.documentType,
        documentNumber: normalized,
      }),
    };
  }

  private lookupHash(organizationId: string, values: RentalTenantMutableValues): string | null {
    if (!values.documentCountryCode || !values.documentType || !values.documentNumber) return null;
    return this.crypto.lookupHash(organizationId, {
      countryCode: values.documentCountryCode,
      type: values.documentType,
      documentNumber: values.documentNumber,
    });
  }

  private decryptIdentity(tenant: RentalTenantRecord): RentalSensitiveIdentity {
    return tenant.sensitiveIdentityCiphertext
      ? this.crypto.decrypt(tenant.sensitiveIdentityCiphertext)
      : EMPTY_SENSITIVE_IDENTITY;
  }

  private async readDetail(
    organizationId: string,
    id: string,
    executor: Parameters<TenantsRepository["findActiveOwned"]>[2],
  ): Promise<RentalTenantDetail> {
    return this.toTenantDetail(await this.policy.requireActiveOwned(organizationId, id, executor));
  }

  private toTenantDetail(tenant: RentalTenantDetailRecord): RentalTenantDetail {
    return {
      ...toTenantSummary(tenant),
      note: tenant.note,
      createdAt: tenant.createdAt.toISOString(),
    };
  }
}

const sensitiveAuditFields = new Set([
  "documentNumber",
  "documentAddress",
  "birthDate",
  "gender",
  "ethnicity",
  "phone",
  "email",
  "note",
  "reason",
]);

function toCreateValues(dto: CreateTenantDto): RentalTenantMutableValues {
  return {
    type: dto.type,
    name: dto.name,
    phone: dto.phone ?? null,
    email: dto.email ?? null,
    primaryContactName: dto.primaryContactName ?? null,
    documentCountryCode: dto.documentCountryCode ?? null,
    documentType: dto.documentType ?? null,
    documentTypeOtherName: dto.documentTypeOtherName ?? null,
    documentNumber: dto.documentNumber ?? null,
    birthDate: dto.birthDate ?? null,
    gender: dto.gender ?? null,
    ethnicity: dto.ethnicity ?? null,
    documentAddress: dto.documentAddress ?? null,
    note: dto.note ?? null,
  };
}

function normalizeMutableValues(values: RentalTenantMutableValues): RentalTenantMutableValues {
  if (!values.documentCountryCode || !values.documentType || !values.documentNumber) return values;
  return {
    ...values,
    documentNumber: normalizeDocumentNumber(
      values.documentCountryCode,
      values.documentType,
      values.documentNumber,
    ),
  };
}

function toMutableValues(
  tenant: RentalTenantRecord,
  identity: RentalSensitiveIdentity,
): RentalTenantMutableValues {
  return {
    type: tenant.type,
    name: tenant.name,
    phone: tenant.phone,
    email: tenant.email,
    primaryContactName: tenant.primaryContactName,
    documentCountryCode: tenant.documentCountryCode,
    documentType: tenant.documentType,
    documentTypeOtherName: tenant.documentTypeOtherName,
    ...identity,
    note: tenant.note,
  };
}

function toPersistedValues(
  values: RentalTenantMutableValues,
  identity: RentalSensitiveIdentity | null,
  lookupHash: string | null,
  crypto: TenantIdentityCryptoService,
) {
  return {
    type: values.type,
    name: values.name,
    phone: values.phone,
    email: values.email,
    primaryContactName: values.primaryContactName,
    documentCountryCode: values.documentCountryCode,
    documentType: values.documentType,
    documentTypeOtherName: values.documentTypeOtherName,
    documentNumberLookupHash: lookupHash,
    maskedDocumentNumber: identity?.documentNumber
      ? maskDocumentNumber(identity.documentNumber)
      : null,
    sensitiveIdentityCiphertext: identity ? crypto.encrypt(identity) : null,
    sensitiveIdentityKeyVersion: identity ? SENSITIVE_KEY_VERSION : null,
    note: values.note,
  };
}

function toTenantSummary(tenant: RentalTenantSummaryRecord): RentalTenantSummary {
  return {
    id: tenant.id,
    type: tenant.type,
    name: tenant.name,
    phone: tenant.phone,
    email: tenant.email,
    primaryContactName: tenant.primaryContactName,
    documentCountryCode: tenant.documentCountryCode,
    documentType: tenant.documentType,
    documentTypeOtherName: tenant.documentTypeOtherName,
    maskedDocumentNumber: tenant.maskedDocumentNumber ?? null,
    isActive: tenant.isActive,
    contractCount: tenant.contractCount,
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function tenantAudit(
  authContext: AuthContext,
  targetId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  return {
    organizationId: authContext.organizationId,
    actorUserId: authContext.userId,
    action: `rental_tenant.${action}`,
    targetType: "rental_tenant",
    targetId,
    result: "succeeded" as const,
    metadata,
  };
}

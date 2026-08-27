import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  RentalPropertyDetail,
  RentalPropertyPage,
  RentalPropertySummary,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { RentalLedgerBoundaryService } from "../bookkeeping/rental-ledger-boundary.service.js";
import type { CreatePropertyDto } from "./dto/create-property.dto.js";
import type { DeletePropertyDto } from "./dto/delete-property.dto.js";
import type { ListPropertiesDto } from "./dto/list-properties.dto.js";
import type { PropertyDetailDto } from "./dto/property-detail.dto.js";
import type { SetPropertyStatusDto } from "./dto/set-property-status.dto.js";
import type { UpdatePropertyDto } from "./dto/update-property.dto.js";
import { PropertiesRepository } from "./properties.repository.js";
import type {
  RentalPropertyDetailRecord,
  RentalPropertyRecord,
  RentalPropertySummaryRecord,
} from "./properties.repository.types.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";

/** 编排租赁房产、伴生账本、组织隔离、事务和必需审计。 */
@Injectable()
export class PropertiesService {
  constructor(
    private readonly repository: PropertiesRepository,
    private readonly policy: PropertiesPolicyService,
    private readonly ledgerBoundary: RentalLedgerBoundaryService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 返回当前组织内未软删除房产的分页摘要。 */
  async list(authContext: AuthContext, dto: ListPropertiesDto): Promise<RentalPropertyPage> {
    const page = await this.repository.list(authContext.organizationId, dto);

    return {
      items: page.items.map(toPropertySummary),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  /** 返回当前组织内未软删除的房产详情。 */
  async detail(authContext: AuthContext, dto: PropertyDetailDto): Promise<RentalPropertyDetail> {
    const property = await this.repository.findActiveOwned(authContext.organizationId, dto.id);
    if (!property) throw this.notFound("租赁房产不存在");

    return toPropertyDetail(property);
  }

  /** 在同一事务中创建伴生租赁账本、房产和必需审计。 */
  create(authContext: AuthContext, dto: CreatePropertyDto): Promise<RentalPropertyDetail> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      await this.policy.assertActiveNameAvailable(
        authContext.organizationId,
        dto.name,
        undefined,
        transaction,
      );
      const ledger = await this.ledgerBoundary.create(
        {
          organizationId: authContext.organizationId,
          name: dto.name,
          actorUserId: authContext.userId,
        },
        transaction,
      );

      let property: RentalPropertyRecord;
      try {
        property = await this.repository.create(
          {
            organizationId: authContext.organizationId,
            ledgerId: ledger.id,
            name: dto.name,
            type: dto.type,
            customTypeName: dto.customTypeName ?? null,
            countryCode: dto.countryCode,
            province: dto.province ?? null,
            city: dto.city ?? null,
            district: dto.district ?? null,
            addressLine: dto.addressLine,
            note: dto.note ?? null,
            createdByUserId: authContext.userId,
          },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowNameConflict(error);
      }

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_property.created",
          targetType: "rental_property",
          targetId: property.id,
          result: "succeeded",
          metadata: { ledgerId: ledger.id, type: property.type },
        },
        transaction,
      );

      return this.readDetail(authContext.organizationId, property.id, transaction);
    });
  }

  /** 更新房产资料，并仅在名称变化时同步伴生账本名称。 */
  update(authContext: AuthContext, dto: UpdatePropertyDto): Promise<RentalPropertyDetail> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      const { id: _id, ...changes } = dto;
      const next = this.policy.mergeUpdate(current, changes);
      const nameChanged = next.name !== current.name;
      if (nameChanged && current.isActive) {
        await this.policy.assertActiveNameAvailable(
          authContext.organizationId,
          next.name,
          current.id,
          transaction,
        );
      }
      if (nameChanged) {
        await this.ledgerBoundary.rename(
          {
            organizationId: authContext.organizationId,
            id: current.ledgerId,
            name: next.name,
          },
          transaction,
        );
      }

      try {
        await this.repository.update(next, transaction);
      } catch (error) {
        this.policy.rethrowNameConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_property.updated",
          targetType: "rental_property",
          targetId: current.id,
          result: "succeeded",
          metadata: { changedFields: Object.keys(changes) },
        },
        transaction,
      );

      return this.readDetail(authContext.organizationId, current.id, transaction);
    });
  }

  /** 只改变房产自身状态，不改写账本或空间状态。 */
  setStatus(authContext: AuthContext, dto: SetPropertyStatusDto): Promise<RentalPropertyDetail> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (dto.isActive && !current.isActive) {
        await this.policy.assertActiveNameAvailable(
          authContext.organizationId,
          current.name,
          current.id,
          transaction,
        );
      }

      try {
        await this.repository.setStatus(
          { organizationId: authContext.organizationId, id: current.id, isActive: dto.isActive },
          transaction,
        );
      } catch (error) {
        this.policy.rethrowNameConflict(error);
      }
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_property.status_changed",
          targetType: "rental_property",
          targetId: current.id,
          result: "succeeded",
          metadata: { isActive: dto.isActive },
        },
        transaction,
      );

      return this.readDetail(authContext.organizationId, current.id, transaction);
    });
  }

  /** 仅在无活动空间和账本历史交易时软删除房产及伴生账本。 */
  delete(authContext: AuthContext, dto: DeletePropertyDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockWriteScope(authContext.organizationId, transaction);
      const current = await this.policy.requireActiveForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      await this.policy.assertNoActiveSpaces(current, transaction);
      await this.ledgerBoundary.assertDeletable(
        authContext.organizationId,
        current.ledgerId,
        transaction,
      );
      await this.repository.softDelete(
        {
          organizationId: authContext.organizationId,
          id: current.id,
          deletedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.ledgerBoundary.softDelete(
        {
          organizationId: authContext.organizationId,
          id: current.ledgerId,
          actorUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "rental_property.deleted",
          targetType: "rental_property",
          targetId: current.id,
          result: "succeeded",
          metadata: { ledgerId: current.ledgerId },
        },
        transaction,
      );
    });
  }

  /** 在当前事务中读取与共享契约对齐的房产详情。 */
  private async readDetail(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalPropertyDetail> {
    const property = await this.repository.findActiveOwned(organizationId, id, executor);
    if (!property) throw this.notFound("租赁房产不存在");

    return toPropertyDetail(property);
  }

  /** 创建不泄露资源存在性的未找到异常。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }
}

/** 将持久化摘要映射为共享 API 契约。 */
function toPropertySummary(property: RentalPropertySummaryRecord): RentalPropertySummary {
  return {
    id: property.id,
    ledgerId: property.ledgerId,
    name: property.name,
    type: property.type,
    customTypeName: property.customTypeName,
    countryCode: property.countryCode,
    province: property.province,
    city: property.city,
    district: property.district,
    addressLine: property.addressLine,
    isActive: property.isActive,
    spaceCount: property.spaceCount,
    rentableSpaceCount: property.rentableSpaceCount,
    updatedAt: property.updatedAt.toISOString(),
  };
}

/** 将持久化详情映射为共享 API 契约。 */
function toPropertyDetail(property: RentalPropertyDetailRecord): RentalPropertyDetail {
  return {
    ...toPropertySummary(property),
    note: property.note,
    createdAt: property.createdAt.toISOString(),
  };
}

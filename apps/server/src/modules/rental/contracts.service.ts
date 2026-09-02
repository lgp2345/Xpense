import { Injectable } from "@nestjs/common";
import type {
  RentalContractAvailability,
  RentalContractDetail,
  RentalContractPage,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import {
  contractAudit,
  createContractAggregate,
  type MutableContractAggregate,
  mergeContractAggregate,
  toContractDetail,
  toContractSummary,
} from "./contract-lifecycle.service.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { CheckContractAvailabilityDto } from "./dto/check-contract-availability.dto.js";
import type { DeleteContractDto } from "./dto/contract-action.dto.js";
import type { ContractDetailDto } from "./dto/contract-detail.dto.js";
import type { CreateContractDto } from "./dto/create-contract.dto.js";
import type { ListContractsDto } from "./dto/list-contracts.dto.js";
import type { UpdateContractDto } from "./dto/update-contract.dto.js";

/** 编排合同读取、草稿保存、开始前修正、可用性和草稿删除。 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly relations: ContractRelationsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 返回组织时区下派生状态的合同分页。 */
  async list(authContext: AuthContext, dto: ListContractsDto): Promise<RentalContractPage> {
    const today = await this.policy.organizationToday(authContext.organizationId);
    const page = await this.repository.list(authContext.organizationId, today, dto);
    return { ...page, items: page.items.map(toContractSummary) };
  }

  /** 返回组织内未删除合同的脱敏聚合详情。 */
  async detail(authContext: AuthContext, dto: ContractDetailDto): Promise<RentalContractDetail> {
    const today = await this.policy.organizationToday(authContext.organizationId);
    const detail = this.policy.requireContract(
      await this.repository.detail(authContext.organizationId, dto.id, today),
    );
    return toContractDetail(detail);
  }

  /** 创建只要求启用房产的合同草稿，并永久分配组织年度编号。 */
  create(authContext: AuthContext, dto: CreateContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { today } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const property = await this.policy.requireActivePropertyForUpdate(
        authContext.organizationId,
        dto.propertyId,
        transaction,
      );
      const aggregate = createContractAggregate(dto);
      await this.policy.validateDraftRelations(
        { organizationId: authContext.organizationId, property, status: "draft", ...aggregate },
        transaction,
      );
      const contractNumber = await this.repository.nextContractNumber(
        authContext.organizationId,
        Number(today.slice(0, 4)),
        transaction,
      );
      const { parties: _parties, spaces: _spaces, depositTerms: _deposits, ...header } = aggregate;
      const contract = await this.repository.createDraft(
        {
          organizationId: authContext.organizationId,
          ...header,
          contractNumber,
          renewedFromContractId: null,
          createdByUserId: authContext.userId,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.replaceRelations(
        authContext.organizationId,
        contract.id,
        aggregate,
        dto,
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "draft_created", {}),
        transaction,
      );
      return this.readDetail(authContext.organizationId, contract.id, today, transaction);
    });
  }

  /** 更新草稿，或在组织本地开始日前执行确认级核心修正。 */
  update(authContext: AuthContext, dto: UpdateContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { today } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const found = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      const property = await this.policy.requireOwnedPropertyForUpdate(
        authContext.organizationId,
        dto.propertyId ?? found.propertyId,
        transaction,
      );
      const current = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      const currentDetail = this.policy.requireContract(
        await this.repository.detail(authContext.organizationId, current.id, today, transaction),
      );
      const aggregate = mergeContractAggregate(currentDetail, dto);
      const changedFields = Object.keys(dto).filter((key) => key !== "id");

      if (current.status === "draft") {
        this.policy.assertPropertyActive(property);
        await this.policy.validateDraftRelations(
          { organizationId: authContext.organizationId, property, status: "draft", ...aggregate },
          transaction,
        );
        await this.writeHeader(authContext, current, aggregate, transaction);
        await this.replaceRelations(
          authContext.organizationId,
          current.id,
          aggregate,
          dto,
          transaction,
        );
        await this.auditService.appendRequired(
          contractAudit(authContext, current.id, "draft_updated", { changedFields }),
          transaction,
        );
      } else {
        const correctionMode = this.policy.assertPreStartCorrection(current, today, dto);
        if (correctionMode !== "metadata_only") {
          this.policy.assertPropertyActive(property);
          await this.policy.validateConfirmationScope(
            {
              organizationId: authContext.organizationId,
              contractId: current.id,
              property,
              status: "confirmed",
              terminationDate: null,
              ...aggregate,
            },
            transaction,
          );
        }
        await this.writeHeader(authContext, current, aggregate, transaction);
        if (correctionMode !== "metadata_only") {
          await this.replaceRelations(
            authContext.organizationId,
            current.id,
            aggregate,
            undefined,
            transaction,
          );
          await this.relations.confirmSnapshots(
            { organizationId: authContext.organizationId, contractId: current.id },
            transaction,
          );
        }
        await this.auditService.appendRequired(
          contractAudit(
            authContext,
            current.id,
            correctionMode === "metadata_only" ? "updated" : "corrected",
            { changedFields },
          ),
          transaction,
        );
      }
      return this.readDetail(authContext.organizationId, current.id, today, transaction);
    });
  }

  /** 在事务锁下提供空间日期冲突的提前反馈。 */
  checkAvailability(
    authContext: AuthContext,
    dto: CheckContractAvailabilityDto,
  ): Promise<RentalContractAvailability> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockOrganizationContext(authContext.organizationId, transaction);
      const property = await this.policy.requireActivePropertyForUpdate(
        authContext.organizationId,
        dto.propertyId,
        transaction,
      );
      if (dto.excludeContractId) {
        const excluded = this.policy.requireContract(
          await this.repository.findForUpdate(
            authContext.organizationId,
            dto.excludeContractId,
            transaction,
          ),
        );
        if (excluded.propertyId !== property.id) {
          throw this.policy.conflict("排除合同与待检查房产不一致");
        }
      }
      const conflicts = await this.policy.checkSpaceAvailability(
        { organizationId: authContext.organizationId, property, ...dto },
        transaction,
      );
      return { available: conflicts.length === 0, conflicts };
    });
  }

  /** 仅软删除草稿，并要求审计与删除处于同一事务。 */
  delete(authContext: AuthContext, dto: DeleteContractDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.policy.lockOrganizationContext(authContext.organizationId, transaction);
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      this.policy.assertLifecycle(contract, "draft");
      await this.repository.softDelete(
        {
          organizationId: authContext.organizationId,
          id: contract.id,
          deletedByUserId: authContext.userId,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "draft_deleted", {}),
        transaction,
      );
    });
  }

  private writeHeader(
    authContext: AuthContext,
    current: { id: string },
    aggregate: MutableContractAggregate,
    executor: AppDbExecutor,
  ) {
    const { parties: _parties, spaces: _spaces, depositTerms: _deposits, ...header } = aggregate;
    return this.repository.updateHeader(
      {
        organizationId: authContext.organizationId,
        id: current.id,
        ...header,
        updatedByUserId: authContext.userId,
      },
      executor,
    );
  }

  private async replaceRelations(
    organizationId: string,
    contractId: string,
    aggregate: MutableContractAggregate,
    provided: Partial<CreateContractDto & UpdateContractDto> | undefined,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (!provided || provided.spaces)
      await this.relations.replaceDraftSpaces(
        { organizationId, contractId, propertyId: aggregate.propertyId, spaces: aggregate.spaces },
        executor,
      );
    if (!provided || provided.parties)
      await this.relations.replaceDraftParties(
        { organizationId, contractId, parties: aggregate.parties },
        executor,
      );
    if (!provided || provided.depositTerms)
      await this.relations.replaceDraftDeposits(
        { organizationId, contractId, deposits: aggregate.depositTerms },
        executor,
      );
  }

  private async readDetail(
    organizationId: string,
    id: string,
    today: string,
    executor: AppDbExecutor,
  ) {
    return toContractDetail(
      this.policy.requireContract(
        await this.repository.detail(organizationId, id, today, executor),
      ),
    );
  }
}

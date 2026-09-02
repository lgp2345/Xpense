import { Injectable, NotFoundException } from "@nestjs/common";
import type { RentalContractDetail, RentalContractPartySensitiveDetail } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { actualContractEnd } from "./contract-date.rules.js";
import { contractAudit, toContractDetail } from "./contract-lifecycle.service.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { ChangeContractPartiesDto } from "./dto/change-contract-parties.dto.js";
import type { RevealContractPartySensitiveDto } from "./dto/reveal-contract-party-sensitive.dto.js";
import { TenantIdentityCryptoService } from "./tenant-identity-crypto.service.js";

/** 编排合同承租方有效期替换与历史身份快照的受控查看。 */
@Injectable()
export class ContractPartiesService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly relations: ContractRelationsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly crypto: TenantIdentityCryptoService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 在组织、房产、合同及关联锁下替换生效日之后的承租方区段。 */
  changeParties(
    authContext: AuthContext,
    dto: ChangeContractPartiesDto,
  ): Promise<RentalContractDetail> {
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
        found.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      if (contract.status !== "confirmed" && contract.status !== "terminated")
        throw this.policy.conflict("仅可变更已确认合同承租方");
      const actualEnd = contract.endDate
        ? actualContractEnd(contract.endDate, contract.terminationDate)
        : null;
      if (
        !contract.startDate ||
        !actualEnd ||
        dto.effectiveDate < contract.startDate ||
        dto.effectiveDate > actualEnd
      ) {
        throw this.policy.conflict("承租方生效日期必须位于合同实际租期内");
      }
      const parties = [...dto.parties].sort((left, right) =>
        left.tenantId.localeCompare(right.tenantId),
      );
      const primaryCount = parties.filter((party) => party.isPrimaryPayer).length;
      if (
        parties.length === 0 ||
        new Set(parties.map((party) => party.tenantId)).size !== parties.length ||
        primaryCount !== 1
      ) {
        throw this.policy.conflict("合同必须且只能有一名主付款人，且承租方不能重复");
      }
      const current = this.policy.requireContract(
        await this.repository.detail(authContext.organizationId, contract.id, today, transaction),
      );
      await this.policy.validateDraftRelations(
        {
          organizationId: authContext.organizationId,
          property,
          status: "confirmed",
          startDate: current.startDate,
          endDate: current.endDate,
          rentAmountMinor: current.rentAmountMinor,
          billingAnchor: current.billingAnchor,
          paymentIntervalMonths: current.paymentIntervalMonths,
          dueDaysBefore: current.dueDaysBefore,
          parties,
          spaces: current.spaces.map(({ spaceId, rentAllocationMinor }) => ({
            spaceId,
            ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
          })),
          depositTerms: current.depositTerms.map(
            ({ id: _id, finalAmountMinor: _final, ...term }) => term,
          ),
        },
        transaction,
      );
      const before = current.parties
        .filter(
          (party) =>
            party.validFrom !== null &&
            party.validTo !== null &&
            party.validFrom <= dto.effectiveDate &&
            dto.effectiveDate <= party.validTo,
        )
        .map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer }));
      await this.relations.replacePartyPeriods(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          effectiveDate: dto.effectiveDate,
          parties,
        },
        transaction,
      );
      await this.relations.appendChange(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          type: "parties_changed",
          effectiveDate: dto.effectiveDate,
          reason: dto.reason,
          beforePartyRefs: before,
          afterPartyRefs: parties,
          createdByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "parties_changed", {
          parties: parties.map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer })),
        }),
        transaction,
      );
      return toContractDetail(
        await this.repository
          .detail(authContext.organizationId, contract.id, today, transaction)
          .then(this.policy.requireContract.bind(this.policy)),
      );
    });
  }

  /** 必需审计提交完成后，才解密并返回精确历史身份快照。 */
  async revealSensitive(
    authContext: AuthContext,
    dto: RevealContractPartySensitiveDto,
  ): Promise<RentalContractPartySensitiveDetail> {
    const snapshot = await this.transactions.run(async (transaction) => {
      const found = await this.relations.findPartySensitiveSnapshot(
        {
          organizationId: authContext.organizationId,
          contractId: dto.contractId,
          tenantId: dto.tenantId,
          validFrom: dto.validFrom,
        },
        transaction,
      );
      if (!found?.validFrom || !found.validTo || !found.identitySnapshotCiphertext)
        throw new NotFoundException("租赁合同历史身份快照不存在");
      await this.auditService.appendRequired(
        contractAudit(authContext, dto.contractId, "party_sensitive_revealed", {
          contractId: dto.contractId,
          tenantId: dto.tenantId,
          validFrom: dto.validFrom,
        }),
        transaction,
      );
      return found;
    });
    const ciphertext = snapshot.identitySnapshotCiphertext;
    if (!ciphertext) throw new NotFoundException("租赁合同历史身份快照不存在");
    const identity = this.crypto.decrypt(ciphertext);
    return {
      contractId: snapshot.contractId,
      tenantId: snapshot.tenantId,
      validFrom: snapshot.validFrom as string,
      validTo: snapshot.validTo as string,
      ...identity,
    };
  }
}

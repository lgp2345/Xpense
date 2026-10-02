import { ConflictException, Injectable } from "@nestjs/common";
import type { RentalChargeTerms, UpdateRentalChargeTermsRequest } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

const action = "charge_terms.update";

function defaultTerms(snapshot: RentalFinanceSnapshot): RentalChargeTerms {
  return (
    snapshot.terms ?? {
      contractId: snapshot.context.contractId,
      version: "0",
      waterUnitPrice: "0.0000",
      electricityUnitPrice: "0.0000",
      fixedFees: [],
    }
  );
}

function currentTerms(snapshot: RentalFinanceSnapshot): RentalChargeTerms {
  return { ...defaultTerms(snapshot), version: financeSourceVersion(snapshot, {}) };
}

/** 合同默认收费标准的组织锁、来源版本、审计和幂等事务编排。 */
@Injectable()
export class ChargeTermsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly terms: ChargeTermsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly bills: BillsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  detail(auth: AuthContext, dto: { contractId: string }): Promise<RentalChargeTerms> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_charges:read");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(
        { organizationId: auth.organizationId, contractId: dto.contractId },
        tx,
      );
      this.assertMonthlyMode(snapshot);
      return currentTerms(snapshot);
    });
  }

  update(auth: AuthContext, dto: UpdateRentalChargeTermsRequest): Promise<RentalChargeTerms> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_charges:update");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = { organizationId: auth.organizationId, contractId: dto.contractId };
      const requestHash = financeRequestHash(action, dto);
      const previous = await this.financeRequests.find(scope, dto.idempotencyKey, tx);
      if (previous) {
        if (!isFinanceRequestReplay(previous, { ...scope, action, requestHash }))
          throw this.conflict("请求标识已用于其他租赁财务操作或内容");
        await this.lockContract(auth, dto.contractId, tx);
        const replayed = await this.sources.read(scope, tx);
        this.assertMonthlyMode(replayed);
        return currentTerms(replayed);
      }
      const previousGeneration = await this.bills.findGeneration(
        auth.organizationId,
        dto.idempotencyKey,
        tx,
      );
      if (previousGeneration) throw this.conflict("请求标识已用于其他租赁财务操作");

      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(scope, tx);
      this.assertMonthlyContract(snapshot);
      if (financeSourceVersion(snapshot, {}) !== dto.expectedVersion)
        throw this.conflict("收费标准已变化，请重新读取后再保存");

      const saved = await this.terms.save(
        scope,
        {
          waterUnitPrice: dto.waterUnitPrice,
          electricityUnitPrice: dto.electricityUnitPrice,
          fixedFees: dto.fixedFees,
        },
        dto.reason,
        { userId: auth.userId },
        tx,
      );
      const changedSnapshot: RentalFinanceSnapshot = {
        ...snapshot,
        terms: {
          contractId: dto.contractId,
          version: String(saved.version),
          waterUnitPrice: saved.waterUnitPrice,
          electricityUnitPrice: saved.electricityUnitPrice,
          fixedFees: saved.fixedFees,
        },
      };
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_charge_terms.updated",
          targetType: "rental_contract",
          targetId: dto.contractId,
          result: "succeeded",
          metadata: { reason: dto.reason, version: saved.version },
        },
        tx,
      );
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: dto.idempotencyKey,
          action,
          requestHash,
          result: { resourceId: dto.contractId, resourceKind: "terms" },
        },
        { userId: auth.userId },
        tx,
      );
      return currentTerms(changedSnapshot);
    });
  }

  private async lockContract(auth: AuthContext, contractId: string, tx: AppDbTransaction) {
    const header = this.policy.requireContract(
      await this.contracts.find(auth.organizationId, contractId, tx),
    );
    await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
    this.policy.requireContract(
      await this.contracts.findForUpdate(auth.organizationId, contractId, tx),
    );
  }

  private assertMonthlyContract(snapshot: RentalFinanceSnapshot) {
    this.assertMonthlyMode(snapshot);
    if (snapshot.contract.lifecycleStatus !== "confirmed")
      throw this.conflict("只有履行中的合同可以修改收费标准");
  }

  private assertMonthlyMode(snapshot: RentalFinanceSnapshot) {
    if (snapshot.contract.billingMode !== "monthly_settlement")
      throw this.conflict("存量合同仍使用旧账单模式");
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

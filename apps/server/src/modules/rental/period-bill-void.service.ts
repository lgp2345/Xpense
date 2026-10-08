import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { RentalBillDetail, VoidRentalPeriodBillRequest } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { assertPeriodBillVoidable } from "./period-bill-lifecycle.rules.js";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
const action = "period_bill.void";
@Injectable()
export class PeriodBillVoidService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly bills: BillsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly requests: FinanceRequestsRepository,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  void(auth: AuthContext, dto: VoidRentalPeriodBillRequest): Promise<RentalBillDetail> {
    for (const key of [
      "rental_contracts:read",
      "rental_bills:read",
      "rental_period_bills:void",
    ] as const)
      this.access.assertPermission(auth, key);
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const bill = await this.bills.detail(auth.organizationId, dto.billId, tx);
      if (!bill)
        throw new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁账单不存在" });
      const contract = this.policy.requireContract(
        await this.contracts.find(auth.organizationId, bill.contractId, tx),
      );
      await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, contract.propertyId, tx);
      this.policy.requireContract(
        await this.contracts.findForUpdate(auth.organizationId, bill.contractId, tx),
      );
      const scope = { organizationId: auth.organizationId, contractId: bill.contractId };
      const hash = financeRequestHash(action, dto);
      const previous = await this.requests.find(scope, dto.idempotencyKey, tx);
      if (previous) {
        if (
          !isFinanceRequestReplay(previous, { ...scope, action, requestHash: hash }) ||
          previous.result.resourceId !== bill.id ||
          previous.result.resourceKind !== "bill"
        )
          throw this.conflict("请求标识已用于其他财务操作或内容");
        return bill;
      }
      if (await this.bills.findGeneration(auth.organizationId, dto.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他账单操作");
      const source = await this.sources.read(scope, tx);
      if (financeSourceVersion(source, { billId: bill.id }) !== dto.expectedVersion)
        throw this.conflict("账单来源已变化，请重新读取");
      try {
        assertPeriodBillVoidable(source, bill.id);
      } catch (error) {
        if (error instanceof RangeError) throw this.conflict(error.message);
        throw error;
      }
      await this.bills.voidBills(
        { organizationId: auth.organizationId, userId: auth.userId, today },
        [bill.id],
        dto.reason,
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_period_bill.voided",
          targetType: "rental_bill",
          targetId: bill.id,
          result: "succeeded",
          metadata: { contractId: bill.contractId, reason: dto.reason },
        },
        tx,
      );
      await this.requests.complete(
        scope,
        {
          idempotencyKey: dto.idempotencyKey,
          action,
          requestHash: hash,
          result: { resourceId: bill.id, resourceKind: "bill" },
        },
        { userId: auth.userId },
        tx,
      );
      const result = await this.bills.detail(auth.organizationId, bill.id, tx);
      if (!result) throw new Error("Voided bill missing");
      return result;
    });
  }
  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

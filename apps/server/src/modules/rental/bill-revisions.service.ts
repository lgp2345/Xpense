import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RentalBillRevisionInput, RentalBillRevisionPreview } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { buildMeterCorrectionPlan } from "./meter-correction.rules.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import type { FinanceScope, RentalFinanceSnapshot, RequestResult } from "./rental-finance.types.js";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

const action = "bill.revision";
const maxSafeMinor = BigInt(Number.MAX_SAFE_INTEGER);

type BillRevisionRequestResult = RequestResult & { preview: RentalBillRevisionPreview };

/** 对账单与共享读数做组织、合同范围内的原子更正。 */
@Injectable()
export class BillRevisionsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly bills: BillsRepository,
    private readonly revisions: BillRevisionsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly settlements: RentalSettlementsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly projection: SettlementProjectionService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  preview(auth: AuthContext, input: RentalBillRevisionInput): Promise<RentalBillRevisionPreview> {
    this.assertBasePermissions(auth);
    return this.transactions.run(async (tx) => {
      const { scope } = await this.lockTarget(auth, input.billId, tx);
      const source = await this.sources.read(scope, tx);
      this.assertSourceScope(scope, source);
      this.assertUnpaidEdit(source, input);
      const plan = this.plan(source, input);
      const settlementBillIds = await this.settlementBillIds(scope, source, tx);
      this.assertSettlementPermission(auth, plan.affectedBillIds, settlementBillIds);
      return this.previewResult(source, input, plan.bills, settlementBillIds);
    });
  }

  adjust(
    auth: AuthContext,
    input: RentalBillRevisionInput & { idempotencyKey: string },
  ): Promise<RentalBillRevisionPreview> {
    this.assertBasePermissions(auth);
    return this.transactions.run(async (tx) => {
      const { scope } = await this.lockTarget(auth, input.billId, tx);
      const requestHash = financeRequestHash(action, input);
      const previous = await this.financeRequests.find(scope, input.idempotencyKey, tx);
      if (previous) {
        const preview = this.replay(previous, scope, requestHash);
        await this.assertReplaySettlementPermission(auth, scope, preview, tx);
        return preview;
      }
      if (await this.bills.findGeneration(auth.organizationId, input.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他租赁账单操作");

      const source = await this.sources.read(scope, tx);
      this.assertSourceScope(scope, source);
      const plan = this.plan(source, input);
      const settlementBillIds = await this.settlementBillIds(scope, source, tx);
      this.assertSettlementPermission(auth, plan.affectedBillIds, settlementBillIds);
      if (this.sourceVersion(source, input, settlementBillIds) !== input.expectedVersion)
        throw this.conflict("账单或读数来源已变化，请重新预览");
      this.assertUnpaidEdit(source, input);
      const preview = this.previewResult(source, input, plan.bills, settlementBillIds);

      for (const reading of plan.readings) {
        await this.readings.reviseBoundary(
          scope,
          reading.id,
          {
            kind: reading.kind,
            readingDate: reading.readingDate,
            reading: reading.reading,
            spaceId: reading.spaceId,
            predecessorId: reading.predecessorId,
          },
          input.reason,
          { userId: auth.userId },
          tx,
        );
      }
      for (const bill of plan.bills) {
        await this.revisions.append(
          scope,
          bill.billId,
          bill.lines,
          bill.amountMinor,
          input.reason,
          { userId: auth.userId },
          tx,
        );
      }

      await this.projection.refresh(scope, auth.userId, tx);
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.revised",
          targetType: "rental_bill",
          targetId: input.billId,
          result: "succeeded",
          metadata: {
            contractId: scope.contractId,
            reason: input.reason,
            affectedBillIds: plan.affectedBillIds,
            readingIds: plan.readings.map(({ id }) => id),
          },
        },
        tx,
      );
      const result: BillRevisionRequestResult = {
        resourceId: input.billId,
        resourceKind: "revision",
        preview,
      };
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: input.idempotencyKey,
          action,
          requestHash,
          result,
        },
        { userId: auth.userId },
        tx,
      );
      return preview;
    });
  }

  history(auth: AuthContext, input: { billId: string; page: number; pageSize: number }) {
    this.access.assertPermission(auth, "rental_bills:read");
    return this.transactions.run(async (tx) => {
      const { scope } = await this.lockTarget(auth, input.billId, tx);
      return this.revisions.history(
        scope,
        input.billId,
        {
          page: Math.max(1, Math.trunc(input.page)),
          pageSize: Math.min(100, Math.max(1, Math.trunc(input.pageSize))),
        },
        tx,
      );
    });
  }

  private assertBasePermissions(auth: AuthContext): void {
    this.access.assertPermission(auth, "rental_bills:read");
    this.access.assertPermission(auth, "rental_monthly_bills:adjust");
  }

  private async lockTarget(auth: AuthContext, billId: string, tx: AppDbTransaction) {
    await this.policy.lockOrganizationContext(auth.organizationId, tx);
    const target = await this.bills.detail(auth.organizationId, billId, tx);
    if (!target) throw this.notFound("租赁账单不存在");
    const header = this.policy.requireContract(
      await this.contracts.find(auth.organizationId, target.contractId, tx),
    );
    await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
    this.policy.requireContract(
      await this.contracts.findForUpdate(auth.organizationId, target.contractId, tx),
    );
    return {
      scope: { organizationId: auth.organizationId, contractId: target.contractId },
      target,
    };
  }

  // biome-ignore format: Keep the paired organization/contract scope guard visible as one rule.
  private assertSourceScope(scope: FinanceScope, source: RentalFinanceSnapshot): void { if (source.context.organizationId !== scope.organizationId || source.context.contractId !== scope.contractId) throw this.notFound("租赁账单不存在"); }

  private plan(source: RentalFinanceSnapshot, input: RentalBillRevisionInput) {
    try {
      return buildMeterCorrectionPlan(source, input);
    } catch (error) {
      if (error instanceof RangeError) throw this.badRequest(error.message);
      throw error;
    }
  }

  private assertUnpaidEdit(source: RentalFinanceSnapshot, input: RentalBillRevisionInput): void {
    if (
      input.mode === "edit_unpaid" &&
      source.cashEntries.some(
        (entry) =>
          entry.kind === "receipt" &&
          entry.revokedAt === null &&
          entry.target.kind === "bill" &&
          entry.target.billId === input.billId,
      )
    )
      throw this.conflict("账单已有有效收款，请使用账单更正");
  }

  private async settlementBillIds(
    scope: FinanceScope,
    source: RentalFinanceSnapshot,
    tx: AppDbTransaction,
  ): Promise<string[]> {
    if (!source.settlement) return [];
    return this.settlements.billIds(scope, source.settlement.id, tx);
  }

  private async assertReplaySettlementPermission(
    auth: AuthContext,
    scope: FinanceScope,
    preview: RentalBillRevisionPreview,
    tx: AppDbTransaction,
  ): Promise<void> {
    const settlement = await this.settlements.findCurrent(scope, tx);
    if (!settlement) return;
    const settlementBillIds = await this.settlements.billIds(scope, settlement.id, tx);
    this.assertSettlementPermission(
      auth,
      preview.affectedBills.map(({ billId }) => billId),
      settlementBillIds,
    );
  }

  private assertSettlementPermission(
    auth: AuthContext,
    affectedBillIds: string[],
    settlementBillIds: string[],
  ): void {
    const affected = new Set(affectedBillIds);
    if (settlementBillIds.some((billId) => affected.has(billId)))
      this.access.assertPermission(auth, "rental_settlements:confirm");
  }

  private assertCandidateBalances(
    source: RentalFinanceSnapshot,
    affectedBills: Array<{ billId: string; beforeAmountMinor: number; afterAmountMinor: number }>,
  ): void {
    const currentBills = new Map(source.bills.map((bill) => [bill.id, bill]));
    try {
      for (const bill of affectedBills) {
        const current = currentBills.get(bill.billId);
        if (!current) throw this.conflict("账单来源已变化，请重新预览");
        calculateRentalCashBalance(
          source.cashEntries,
          { kind: "bill", billId: bill.billId },
          bill.afterAmountMinor,
          current.dueDate,
          source.context.today,
        );
      }
    } catch (error) {
      if (error instanceof RangeError) throw this.badRequest(error.message);
      throw error;
    }
  }

  private previewResult(
    source: RentalFinanceSnapshot,
    input: RentalBillRevisionInput,
    plan: Array<{ billId: string; amountMinor: number }>,
    settlementBillIds: string[],
  ): RentalBillRevisionPreview {
    const currentBills = new Map(source.bills.map((bill) => [bill.id, bill]));
    const affectedBills = plan.map(({ billId, amountMinor }) => {
      const current = currentBills.get(billId);
      if (!current) throw this.conflict("账单来源已变化，请重新预览");
      return {
        billId,
        beforeAmountMinor: current.amountMinor,
        afterAmountMinor: amountMinor,
      };
    });
    this.assertCandidateBalances(source, affectedBills);
    const linked = new Set(settlementBillIds);
    const linkedDelta = affectedBills.reduce(
      (total, bill) =>
        linked.has(bill.billId)
          ? total + BigInt(bill.afterAmountMinor) - BigInt(bill.beforeAmountMinor)
          : total,
      0n,
    );
    let settlementDifferenceMinor: number | null = null;
    if (source.settlement) {
      const difference =
        BigInt(source.settlement.finalCostMinor) +
        linkedDelta -
        BigInt(source.settlement.balance.netReceivedMinor);
      if (difference < -maxSafeMinor || difference > maxSafeMinor)
        throw this.badRequest("结算差额超出安全整数范围");
      settlementDifferenceMinor = Number(difference);
    }
    return {
      version: this.sourceVersion(source, input, settlementBillIds),
      affectedBills,
      settlementDifferenceMinor,
    };
  }

  private replay(
    previous: Awaited<ReturnType<FinanceRequestsRepository["find"]>> & {},
    scope: FinanceScope,
    requestHash: string,
  ): RentalBillRevisionPreview {
    if (!isFinanceRequestReplay(previous, { ...scope, action, requestHash }))
      throw this.conflict("请求标识已用于其他租赁财务操作或内容");
    const result = previous.result as unknown as Partial<BillRevisionRequestResult>;
    if (result.resourceKind !== "revision" || !result.preview)
      throw this.conflict("幂等请求记录与账单更正不一致");
    return result.preview;
  }

  private sourceVersion(
    source: RentalFinanceSnapshot,
    input: RentalBillRevisionInput,
    settlementBillIds: string[],
  ): string {
    return financeSourceVersion({ ...source, settlementBillIds }, input);
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }

  private badRequest(message: string): BadRequestException {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

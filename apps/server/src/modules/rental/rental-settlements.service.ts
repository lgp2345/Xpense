import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  ConfirmRentalSettlementRequest,
  PreviewRentalSettlementRequest,
  RentalSettlementDetail,
  RentalSettlementPreview,
} from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { resolvePeriodMeterBaselines } from "./period-meter.rules.js";
import { buildPeriodSettlementPlan } from "./period-settlement.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash, isFinanceRequestReplay } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { proposeSettlementReadings } from "./rental-settlement-readings.rules.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { assertSettlementCurrency } from "./settlement-currency.rules.js";
import { SettlementWriteService } from "./settlement-write.service.js";

const action = "rental_settlement.confirm";
/** 只在正式结束事件下确认独立结算快照，后续资金动作只刷新余额。 */
@Injectable()
export class RentalSettlementsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly settlements: RentalSettlementsRepository,
    private readonly writer: SettlementWriteService,
    private readonly bills: BillsRepository,
    private readonly requests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly projectionSources: RentalCashProjectionRepository,
  ) {}
  detail(
    auth: AuthContext,
    input: { contractId: string },
  ): Promise<{ settlement: RentalSettlementDetail | null }> {
    this.permissions(auth, false);
    return this.transactions.run(async (tx) => {
      const scope = await this.lock(auth, input.contractId, tx);
      const source = await this.sources.read(scope, tx);
      if (!source.settlement) return { settlement: null };
      this.calculate(() => assertSettlementCurrency(source));
      const [facts] = await this.projectionSources.readMany(
        auth.organizationId,
        [input.contractId],
        tx,
      );
      if (facts?.settlement?.id !== source.settlement.id)
        throw new Error("Settlement scope changed during detail");
      const version = rentalCashSourceVersion(facts, {
        kind: "settlement",
        settlementId: source.settlement.id,
      });
      return {
        settlement: {
          ...source.settlement,
          version,
          balance: { ...source.settlement.balance, version },
        },
      };
    });
  }
  preview(
    auth: AuthContext,
    input: PreviewRentalSettlementRequest,
  ): Promise<RentalSettlementPreview> {
    this.permissions(auth, true);
    return this.transactions.run(async (tx) => {
      const scope = await this.lock(auth, input.contractId, tx);
      return this.previewSource(await this.sources.read(scope, tx), input);
    });
  }
  confirm(
    auth: AuthContext,
    input: ConfirmRentalSettlementRequest,
  ): Promise<RentalSettlementDetail> {
    this.permissions(auth, true);
    return this.transactions.run(async (tx) => {
      const scope = await this.lock(auth, input.contractId, tx);
      const hash = financeRequestHash(action, input);
      const previous = await this.requests.find(scope, input.idempotencyKey, tx);
      const source = await this.sources.read(scope, tx);
      this.calculate(() => assertSettlementCurrency(source));
      if (previous) {
        if (
          !isFinanceRequestReplay(previous, { ...scope, action, requestHash: hash }) ||
          previous.result.resourceKind !== "settlement" ||
          previous.result.resourceId !== source.settlement?.id
        )
          throw this.conflict("请求标识已用于其他财务操作或内容");
        return source.settlement;
      }
      if (await this.bills.findGeneration(auth.organizationId, input.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他账单操作");
      const preview = this.previewSource(source, input);
      if (preview.version !== input.expectedVersion)
        throw this.conflict("结算预览已变化，请重新预览");
      if (!preview.canConfirm)
        throw this.badRequest(
          `结算信息未补齐或实际结束日尚未到达：${preview.missingFields.join("、")}`,
        );
      const plan = this.calculate(() => buildPeriodSettlementPlan(source, input));
      const candidates = this.calculate(() => proposeSettlementReadings(source, input));
      const saved = await this.writer.persist(scope, plan, candidates, { userId: auth.userId }, tx);
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_settlement.confirmed",
          targetType: "rental_settlement",
          targetId: saved.id,
          result: "succeeded",
          metadata: { contractId: input.contractId, kind: plan.kind },
        },
        tx,
      );
      await this.requests.complete(
        scope,
        {
          idempotencyKey: input.idempotencyKey,
          action,
          requestHash: hash,
          result: { resourceId: saved.id, resourceKind: "settlement" },
        },
        { userId: auth.userId },
        tx,
      );
      return saved;
    });
  }
  history(
    auth: AuthContext,
    input: { contractId: string; page: number; pageSize: number },
  ): Promise<unknown> {
    this.permissions(auth, false);
    return this.transactions.run(async (tx) => {
      const scope = await this.lock(auth, input.contractId, tx);
      const source = await this.sources.read(scope, tx);
      this.calculate(() => assertSettlementCurrency(source));
      const page = await this.settlements.history(scope, input, tx);
      return {
        ...page,
        items: page.items.map(
          ({ id, settlementId, revision, snapshot, reason, createdByUserId, createdAt }) => ({
            id,
            settlementId,
            revision,
            settlement: snapshot,
            reason,
            createdByUserId,
            createdAt: createdAt.toISOString(),
          }),
        ),
      };
    });
  }
  private previewSource(
    source: RentalFinanceSnapshot,
    input: PreviewRentalSettlementRequest,
  ): RentalSettlementPreview {
    if (source.settlement) throw this.conflict("合同已确认结算，不能重新修改结算费用");
    const plan = this.calculate(() => buildPeriodSettlementPlan(source, input));
    const missingFields: string[] = [];
    if (plan.kind !== "cancellation") {
      const baselines = this.calculate(() => resolvePeriodMeterBaselines(source));
      for (const kind of ["water", "electricity"] as const) {
        if (source.terms?.[`${kind}CollectionEnabled`] === false) continue;
        if (!baselines.some((reading) => reading.kind === kind))
          missingFields.push(`${kind}Baseline`);
        if (!input.finalReadings?.some((reading) => reading.kind === kind))
          missingFields.push(`${kind}Reading`);
      }
    }
    return {
      version: plan.version,
      canConfirm: !missingFields.length && plan.effectiveEndDate <= source.context.today,
      missingFields,
      effectiveEndDate: plan.effectiveEndDate,
      periodCharges: plan.periodCharges,
      terminalLines: plan.terminalLines,
      extraLines: plan.extraLines,
      finalCostMinor: plan.finalCostMinor,
      receivedMinor: plan.receivedMinor,
      refundedMinor: plan.refundedMinor,
      differenceMinor: plan.differenceMinor,
    };
  }
  private calculate<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof RangeError) throw this.badRequest(error.message);
      throw error;
    }
  }
  private async lock(auth: AuthContext, id: string, tx: AppDbTransaction) {
    await this.policy.lockOrganizationContext(auth.organizationId, tx);
    const header = this.policy.requireContract(
      await this.contracts.find(auth.organizationId, id, tx),
    );
    await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
    this.policy.requireContract(await this.contracts.findForUpdate(auth.organizationId, id, tx));
    return { organizationId: auth.organizationId, contractId: id };
  }
  private permissions(auth: AuthContext, confirm: boolean) {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(
      auth,
      confirm ? "rental_settlements:confirm" : "rental_settlements:read",
    );
    if (confirm) this.access.assertPermission(auth, "rental_bills:read");
  }
  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

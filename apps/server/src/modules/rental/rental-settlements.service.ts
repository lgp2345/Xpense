import { randomUUID } from "node:crypto";
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
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import type { PersistableBillingDraft } from "./billing.types.js";
import { billingDigest } from "./billing-source.rules.js";
import { BillsRepository } from "./bills.repository.js";
import { compareCalendarDates } from "./contract-date.rules.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { sourceForMonthlyBills } from "./monthly-bill-plan.rules.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type {
  FinanceScope,
  RentalFinanceSnapshot,
  RentalMeterReading,
  SettlementPlan,
} from "./rental-finance.types.js";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { buildRentalSettlementPlan } from "./rental-settlement.rules.js";
import {
  proposeSettlementReadings,
  settlementReadingEndsToRewire,
} from "./rental-settlement-readings.rules.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

const action = "rental_settlement.confirm";

/** 整合同一真实生命周期事件下的结算预览、稳定账单修订和资金投影。 */
@Injectable()
export class RentalSettlementsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly settlements: RentalSettlementsRepository,
    private readonly billRevisions: BillRevisionsRepository,
    private readonly meterReadings: MeterReadingsRepository,
    private readonly bills: BillsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly projection: SettlementProjectionService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly projectionSources: RentalCashProjectionRepository,
  ) {}

  detail(
    _auth: AuthContext,
    _input: { contractId: string },
  ): Promise<{ settlement: RentalSettlementDetail | null }> {
    this.access.assertPermission(_auth, "rental_contracts:read");
    this.access.assertPermission(_auth, "rental_settlements:read");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(_auth.organizationId, tx);
      const scope = await this.lockContract(_auth, _input.contractId, tx);
      const source = await this.sources.read(scope, tx);
      const settlement = source.settlement;
      if (!settlement) return { settlement: null };
      const [facts] = await this.projectionSources.readMany(
        scope.organizationId,
        [scope.contractId],
        tx,
      );
      if (!facts || facts.settlement?.id !== settlement.id)
        throw new Error("Rental settlement changed during detail read");
      const version = rentalCashSourceVersion(facts, {
        kind: "settlement",
        settlementId: settlement.id,
      });
      return {
        settlement: {
          ...settlement,
          version,
          balance: { ...settlement.balance, version },
        },
      };
    });
  }

  preview(
    _auth: AuthContext,
    _input: PreviewRentalSettlementRequest,
  ): Promise<RentalSettlementPreview> {
    this.access.assertPermission(_auth, "rental_contracts:read");
    this.access.assertPermission(_auth, "rental_bills:read");
    this.access.assertPermission(_auth, "rental_settlements:confirm");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(_auth.organizationId, tx);
      const scope = await this.lockContract(_auth, _input.contractId, tx);
      const source = await this.sources.read(scope, tx);
      return this.previewSource(source, _input);
    });
  }

  confirm(
    auth: AuthContext,
    input: ConfirmRentalSettlementRequest,
  ): Promise<RentalSettlementDetail> {
    this.assertConfirm(auth);
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = { organizationId: auth.organizationId, contractId: input.contractId };
      const requestHash = financeRequestHash(action, input);
      const previous = await this.financeRequests.find(scope, input.idempotencyKey, tx);
      if (previous) {
        if (!isFinanceRequestReplay(previous, { ...scope, action, requestHash }))
          throw this.conflict("请求标识已用于其他租赁财务操作或内容");
        await this.lockContract(auth, input.contractId, tx);
        const current = await this.settlements.findCurrent(scope, tx);
        if (!current || current.id !== previous.result.resourceId)
          throw this.conflict("已完成的结算请求缺少对应结算记录");
        const replay = await this.sources.read(scope, tx);
        if (!replay.settlement) throw this.conflict("已完成的结算请求缺少资金投影");
        return replay.settlement;
      }
      if (await this.bills.findGeneration(auth.organizationId, input.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他租赁账单操作");

      await this.lockContract(auth, input.contractId, tx);
      const source = await this.sources.read(scope, tx);
      const preview = this.previewSource(source, input);
      const event = this.event(source);
      if (event.effectiveEndDate > source.context.today)
        throw this.conflict("合同实际结束日前不能确认最终结算");
      if (preview.version !== input.expectedVersion)
        throw this.conflict("结算预览已变化，请重新预览");
      if (!preview.canConfirm)
        throw this.badRequest(`结算信息未补齐：${preview.missingFields.join("、")}`);
      const finalSource = await this.persistFinalReadings(scope, source, input, auth, tx);
      const plan = this.plan(finalSource, input);
      this.assertBillBalances(finalSource, plan);
      const readingEnds = this.readingEndsToRewire(finalSource, input, plan);
      const linkedBillIds = new Set(finalSource.bills.map(({ id }) => id));
      await this.persistWithdrawals(scope, finalSource, plan, auth, tx);
      const inserted = await this.persistPlan(
        scope,
        finalSource,
        plan,
        input.expectedVersion,
        auth,
        tx,
      );
      for (const bill of inserted) linkedBillIds.add(bill.id);
      await this.rewireReadingEnds(scope, readingEnds, auth, tx);

      const current = await this.settlements.findCurrent(scope, tx);
      if (
        current &&
        (current.kind !== event.kind || current.effectiveEndDate !== event.effectiveEndDate)
      )
        throw this.conflict("当前结算属于其他合同生命周期事件");
      let settlementId: string;
      if (current) {
        settlementId = current.id;
      } else {
        const created = await this.settlements.create(
          scope,
          plan,
          {
            settlementId: randomUUID(),
            eventId: randomUUID(),
            kind: event.kind,
            status: statusFor(plan.differenceMinor),
            version: input.expectedVersion,
          },
          { userId: auth.userId },
          tx,
        );
        settlementId = created.id;
      }
      await this.settlements.linkBills(scope, settlementId, [...linkedBillIds].sort(), tx);
      const projected = await this.projection.refresh(scope, auth.userId, tx);
      if (!projected) throw new Error("Rental settlement disappeared during projection");
      await this.finish(scope, auth.userId, input, requestHash, projected.id, tx);
      return projected;
    });
  }

  history(
    auth: AuthContext,
    input: { contractId: string; page: number; pageSize: number },
  ): Promise<unknown> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_settlements:read");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = await this.lockContract(auth, input.contractId, tx);
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

  private plan(
    source: RentalFinanceSnapshot,
    input: PreviewRentalSettlementRequest,
  ): SettlementPlan {
    try {
      if (source.contract.billingMode !== "monthly_settlement")
        throw new RangeError("旧版合同继续使用原账单生命周期");
      if (source.contract.lifecycleStatus === "cancelled" && !source.cancelledOn)
        throw new RangeError("取消结算缺少已保存的组织本地取消日期");
      return buildRentalSettlementPlan(source, input);
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      throw error;
    }
  }

  private assertBillBalances(source: RentalFinanceSnapshot, plan: SettlementPlan): void {
    try {
      for (const planned of plan.finalBills) {
        if (!planned.billId) continue;
        const original = source.bills.find(({ id }) => id === planned.billId);
        if (!original) throw new RangeError("待修订账单已不再有效，请重新预览");
        calculateRentalCashBalance(
          source.cashEntries,
          { kind: "bill", billId: original.id },
          planned.amountMinor,
          original.dueDate,
          source.context.today,
        );
      }
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      throw error;
    }
  }

  private missingFields(
    source: RentalFinanceSnapshot,
    input: PreviewRentalSettlementRequest,
    plan: SettlementPlan,
  ): string[] {
    if (source.contract.lifecycleStatus === "cancelled") return [];
    const missing: string[] = [];
    for (const kind of ["water", "electricity"] as const) {
      const requested = input.finalReadings?.some((reading) => reading.kind === kind) ?? false;
      const billedAtEnd = plan.finalBills.some((bill) =>
        bill.lines.some((line) => {
          const saved = line.feeSnapshot;
          return saved?.kind === kind && saved.endDate === plan.effectiveEndDate;
        }),
      );
      if (!requested && !billedAtEnd) missing.push(`${kind}Reading`);
    }
    return missing.sort();
  }

  private safeCashTotal(source: RentalFinanceSnapshot, kind: "receipt" | "refund"): number {
    try {
      return cashTotal(source, kind);
    } catch (error) {
      if (error instanceof RangeError && error.message === "合同有效资金超出安全整数范围") {
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      }
      throw error;
    }
  }

  private previewSource(
    source: RentalFinanceSnapshot,
    input: PreviewRentalSettlementRequest,
  ): RentalSettlementPreview {
    let sourceWithProposedReadings: RentalFinanceSnapshot;
    try {
      sourceWithProposedReadings = this.withProposedReadings(source, input);
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      throw error;
    }
    const plan = this.plan(sourceWithProposedReadings, input);
    this.assertBillBalances(source, plan);
    const missingFields = this.missingFields(source, input, plan);
    return {
      version: financeSourceVersion(source, input),
      canConfirm:
        missingFields.length === 0 &&
        compareCalendarDates(plan.effectiveEndDate, source.context.today) <= 0,
      missingFields,
      effectiveEndDate: plan.effectiveEndDate,
      billChanges: [
        ...plan.finalBills.map((planned) => {
          const existing = planned.billId
            ? source.bills.find(({ id }) => id === planned.billId)
            : null;
          return {
            ...planned,
            changeAmountMinor: planned.amountMinor - (existing?.amountMinor ?? 0),
          };
        }),
        ...plan.withdrawnBillIds.map((billId) => {
          const existing = source.bills.find(({ id }) => id === billId);
          if (!existing) throw new Error("Withdrawn settlement bill is missing from its source");
          return {
            billId,
            billingMonth: existing.billingMonth ?? existing.periodStart?.slice(0, 7) ?? "",
            lines: [],
            amountMinor: 0,
            changeAmountMinor: -existing.amountMinor,
          };
        }),
      ].toSorted(
        (left, right) =>
          left.billingMonth.localeCompare(right.billingMonth) ||
          (left.billId ?? "").localeCompare(right.billId ?? ""),
      ),
      finalCostMinor: plan.finalCostMinor,
      receivedMinor: this.safeCashTotal(source, "receipt"),
      refundedMinor: this.safeCashTotal(source, "refund"),
      differenceMinor: plan.differenceMinor,
    };
  }

  private withProposedReadings(
    source: RentalFinanceSnapshot,
    input: PreviewRentalSettlementRequest,
  ): RentalFinanceSnapshot {
    const candidates = this.proposedReadings(source, input);
    if (!candidates.length) return source;
    return {
      ...source,
      readings: [...source.readings, ...candidates.map(({ reading }) => reading)],
    };
  }

  private proposedReadings(source: RentalFinanceSnapshot, input: PreviewRentalSettlementRequest) {
    return proposeSettlementReadings(source, input);
  }

  private async persistFinalReadings(
    scope: FinanceScope,
    source: RentalFinanceSnapshot,
    input: ConfirmRentalSettlementRequest,
    auth: AuthContext,
    tx: AppDbTransaction,
  ): Promise<RentalFinanceSnapshot> {
    const candidates = this.proposedReadings(source, input);
    for (const { write } of candidates) {
      await this.meterReadings.appendBoundary(
        scope,
        write,
        "合同统一结算末次读数",
        { userId: auth.userId },
        tx,
      );
    }
    return candidates.length ? this.sources.read(scope, tx) : source;
  }

  private readingEndsToRewire(
    source: RentalFinanceSnapshot,
    input: ConfirmRentalSettlementRequest,
    plan: SettlementPlan,
  ): Array<{ current: RentalMeterReading; predecessorId: string }> {
    try {
      return settlementReadingEndsToRewire(source, input, plan);
    } catch (error) {
      if (error instanceof RangeError) throw this.conflict(error.message);
      throw error;
    }
  }

  private async rewireReadingEnds(
    scope: FinanceScope,
    updates: Array<{ current: RentalMeterReading; predecessorId: string }>,
    auth: AuthContext,
    tx: AppDbTransaction,
  ): Promise<void> {
    for (const { current, predecessorId } of updates) {
      await this.meterReadings.reviseBoundary(
        scope,
        current.id,
        {
          spaceId: current.spaceId,
          kind: current.kind,
          readingDate: current.readingDate,
          reading: current.reading,
          predecessorId,
        },
        "合同统一结算插入末次读数后更新后续边界",
        { userId: auth.userId },
        tx,
      );
    }
  }

  private event(source: RentalFinanceSnapshot) {
    if (source.contract.lifecycleStatus === "cancelled") {
      if (!source.cancelledOn) throw this.badRequest("取消结算缺少已保存的组织本地取消日期");
      return { kind: "cancellation" as const, effectiveEndDate: source.cancelledOn };
    }
    const effectiveEndDate = source.contract.terminationDate ?? source.contract.endDate;
    if (!effectiveEndDate) throw this.badRequest("合同缺少实际结束日期");
    return {
      kind: source.contract.terminationDate ? ("termination" as const) : ("expiry" as const),
      effectiveEndDate,
    };
  }

  private async persistPlan(
    scope: FinanceScope,
    source: RentalFinanceSnapshot,
    plan: SettlementPlan,
    sourceVersion: string,
    auth: AuthContext,
    tx: AppDbTransaction,
  ) {
    const activeById = new Map(
      source.bills.filter(({ status }) => status === "active").map((bill) => [bill.id, bill]),
    );
    const drafts: PersistableBillingDraft[] = [];
    for (const planned of plan.finalBills) {
      if (planned.billId) {
        const previous = activeById.get(planned.billId);
        if (!previous) throw this.conflict("待修订账单已不再有效，请重新预览");
        if (
          previous.amountMinor !== planned.amountMinor ||
          billingDigest(previous.lines) !== billingDigest(planned.lines)
        ) {
          await this.billRevisions.append(
            scope,
            previous.id,
            planned.lines,
            planned.amountMinor,
            "合同统一结算调整账期费用",
            { userId: auth.userId },
            tx,
          );
        }
        continue;
      }
      if (!planned.lines.length) continue;
      drafts.push({
        type: "monthly",
        modelVersion: 2,
        billingMonth: planned.billingMonth,
        revision: 1,
        sourceKey: `monthly:${planned.billingMonth}`,
        periodStart:
          planned.lines
            .map(({ periodStart }) => periodStart)
            .filter((date): date is string => date !== null)
            .sort()[0] ?? null,
        periodEnd:
          planned.lines
            .map(({ periodEnd }) => periodEnd)
            .filter((date): date is string => date !== null)
            .sort()
            .at(-1) ?? null,
        effectiveEnd: plan.effectiveEndDate,
        dueDate: plan.effectiveEndDate,
        amountMinor: planned.amountMinor,
        lines: planned.lines,
        depositSourceId: null,
        depositSnapshot: null,
        adjustmentId: null,
      });
    }
    if (!drafts.length) return [];
    const rentAmountMinor = drafts.reduce(
      (sum, draft) =>
        sum +
        draft.lines
          .filter(({ kind }) => kind === "rent_period")
          .reduce((amount, line) => amount + line.amountMinor, 0),
      0,
    );
    const generation = await this.bills.createGeneration(
      {
        organizationId: scope.organizationId,
        contractId: scope.contractId,
        idempotencyKey: randomUUID(),
        requestHash: billingDigest({ sourceVersion, settlement: plan }),
        sourceVersion,
        origin: "manual",
        createdCount: drafts.length,
        existingCount: 0,
        totals: {
          rentAmountMinor,
          depositAmountMinor: 0,
          monthlyAmountMinor: drafts.reduce((sum, draft) => sum + draft.amountMinor, 0),
        },
        createdByUserId: auth.userId,
      },
      tx,
    );
    return this.bills.insertBills(
      { organizationId: scope.organizationId, userId: auth.userId, today: source.context.today },
      sourceForMonthlyBills(source),
      generation.id,
      drafts,
      tx,
    );
  }

  private async persistWithdrawals(
    scope: FinanceScope,
    source: RentalFinanceSnapshot,
    plan: SettlementPlan,
    auth: AuthContext,
    tx: AppDbTransaction,
  ): Promise<void> {
    if (!plan.withdrawnBillIds.length) return;
    const activeById = new Map(
      source.bills.filter(({ status }) => status === "active").map((bill) => [bill.id, bill]),
    );
    for (const billId of plan.withdrawnBillIds) {
      if (!activeById.has(billId)) throw this.conflict("待撤回账单已不再有效，请重新预览");
      await this.billRevisions.append(
        scope,
        billId,
        [],
        0,
        "合同统一结算撤回实际结束月之后的账单",
        { userId: auth.userId },
        tx,
      );
    }
    await this.bills.voidBills(
      { organizationId: scope.organizationId, userId: auth.userId, today: source.context.today },
      plan.withdrawnBillIds,
      "合同统一结算撤回实际结束月之后的账单",
      tx,
    );
  }

  private async finish(
    scope: FinanceScope,
    actor: string,
    input: ConfirmRentalSettlementRequest,
    requestHash: string,
    settlementId: string,
    tx: AppDbTransaction,
  ) {
    await this.financeRequests.complete(
      scope,
      {
        idempotencyKey: input.idempotencyKey,
        action,
        requestHash,
        result: { resourceId: settlementId, resourceKind: "settlement" },
      },
      { userId: actor },
      tx,
    );
    await this.audit.appendRequired(
      {
        organizationId: scope.organizationId,
        actorUserId: actor,
        action: "rental_settlement.confirmed",
        targetType: "rental_settlement",
        targetId: settlementId,
        result: "succeeded",
        metadata: { contractId: scope.contractId },
      },
      tx,
    );
  }

  private async lockContract(
    auth: AuthContext,
    contractId: string,
    tx: AppDbTransaction,
  ): Promise<FinanceScope> {
    const header = this.policy.requireContract(
      await this.contracts.find(auth.organizationId, contractId, tx),
    );
    await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
    this.policy.requireContract(
      await this.contracts.findForUpdate(auth.organizationId, contractId, tx),
    );
    return { organizationId: auth.organizationId, contractId };
  }

  private assertConfirm(auth: AuthContext) {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_bills:read");
    this.access.assertPermission(auth, "rental_settlements:confirm");
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }

  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

function cashTotal(source: RentalFinanceSnapshot, kind: "receipt" | "refund"): number {
  const total = source.cashEntries
    .filter((entry) => entry.kind === kind && entry.revokedAt === null)
    .reduce((sum, entry) => {
      if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0)
        throw new RangeError("有效收退款必须为正安全整数");
      return sum + BigInt(entry.amountMinor);
    }, 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("合同有效资金超出安全整数范围");
  return Number(total);
}

function statusFor(differenceMinor: number) {
  if (differenceMinor < 0) return "pending_refund" as const;
  if (differenceMinor > 0) return "pending_collection" as const;
  return "settled" as const;
}

import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { RentalBillDetail, RentalBillLine } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import type { BillingSource } from "./billing.types.js";
import { billingDigest, buildDepositDrafts } from "./billing-source.rules.js";
import { BillsRepository } from "./bills.repository.js";
import {
  addCalendarDays,
  calendarDateToDayNumber,
  daysInMonth,
  parseCalendarDate,
} from "./contract-date.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { projectRentalRentThroughDate } from "./rental-rent-projection.rules.js";
import { buildRentalSettlementPlan } from "./rental-settlement.rules.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

/** 月度合同生命周期事件在调用方提供的事务内联动最终资金事实。 */
@Injectable()
export class MonthlyBillingLifecycleService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly billRevisions: BillRevisionsRepository,
    private readonly bills: BillsRepository,
    private readonly settlements: RentalSettlementsRepository,
    private readonly projection: SettlementProjectionService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** 预约终止只记录合同生命周期；租金结算由明确的结算流程处理。 */
  onTerminate(
    _auth: AuthContext,
    _before: BillingSource,
    _after: BillingSource,
    _tx: AppDbTransaction,
  ): Promise<void> {
    return Promise.resolve();
  }

  /** 撤销尚未生效的终止只恢复合同租期，不重写既有月结应收或现金。 */
  onRevokeTermination(
    _auth: AuthContext,
    _before: BillingSource,
    _after: BillingSource,
    _tx: AppDbTransaction,
  ): Promise<void> {
    return Promise.resolve();
  }

  async onCorrection(
    auth: AuthContext,
    before: BillingSource,
    after: BillingSource,
    tx: AppDbTransaction,
  ): Promise<void> {
    if (before.contract.billingMode !== "monthly_settlement") return;
    const scope = { organizationId: auth.organizationId, contractId: before.contract.id };
    const source = await this.sources.read(scope, tx);
    assertLifecycleScope(source, scope);
    const activeMonthlyBills = before.activeBills.filter(
      (bill) => bill.type === "monthly" && bill.modelVersion === 2,
    );
    const currentBills = new Map(source.bills.map((bill) => [bill.id, bill]));
    const terms = requiredBillingTerms(source);
    const contractEndDate = effectiveEndDate(source);
    const projectedRent = new Map(
      projectRentalRentThroughDate(terms, contractEndDate).map(({ billingMonth, lines }) => [
        billingMonth,
        lines,
      ]),
    );
    const revisions: Array<{
      bill: RentalBillDetail;
      lines: RentalBillLine[];
      amountMinor: number;
    }> = [];
    for (const original of activeMonthlyBills) {
      const current = currentBills.get(original.id);
      if (current?.status !== "active")
        throw this.conflict("合同修正期间月度账单已变化，请重新读取");
      if (!current.billingMonth) throw this.conflict("月度账单缺少稳定月份");
      const rentLines = projectedRent.get(current.billingMonth) ?? [];
      const lines = [
        ...current.lines.flatMap((line) => {
          if (line.kind === "rent_period") return [];
          const projected = reprojectFixedFeeLine(
            line,
            current.billingMonth as string,
            terms.startDate,
            contractEndDate,
          );
          return projected ? [projected] : [];
        }),
        ...rentLines,
      ].map((line, sortOrder) => ({ ...line, sortOrder }));
      let amountMinor: number;
      try {
        amountMinor = checkedBillAmount(lines);
      } catch (error) {
        if (error instanceof RangeError) {
          throw new BadRequestException({
            code: apiErrorCodes.validationFailed,
            message: error.message,
          });
        }
        throw error;
      }
      if (
        amountMinor !== current.amountMinor ||
        billingDigest(lines) !== billingDigest(current.lines)
      )
        revisions.push({ bill: current, lines, amountMinor });
    }

    const currentDeposits = buildDepositDrafts(after.contract.depositTerms, {});
    const nextDepositKeys = new Set(currentDeposits.map(({ sourceKey }) => sourceKey));
    const voidIds = before.activeBills
      .filter(
        (bill) =>
          bill.type === "deposit" &&
          bill.modelVersion === 2 &&
          !nextDepositKeys.has(bill.sourceKey),
      )
      .map(({ id }) => id)
      .sort();
    if (revisions.length || voidIds.length) {
      this.access.assertPermission(auth, "rental_bills:read");
      this.access.assertPermission(auth, "rental_bills:adjust");
    }

    for (const { bill, lines, amountMinor } of revisions) {
      const saved = await this.billRevisions.append(
        scope,
        bill.id,
        lines,
        amountMinor,
        "合同修正后同步已出账租金",
        { userId: auth.userId },
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.revised",
          targetType: "rental_bill",
          targetId: saved.bill.id,
          result: "succeeded",
          metadata: { contractId: scope.contractId, amountMinor: saved.bill.amountMinor },
        },
        tx,
      );
    }
    if (voidIds.length) {
      await this.bills.voidBills(
        { organizationId: auth.organizationId, userId: auth.userId, today: before.today },
        voidIds,
        "合同修正，原押金来源已变化",
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.voided",
          targetType: "rental_contract",
          targetId: scope.contractId,
          result: "succeeded",
          metadata: { count: voidIds.length, reason: "合同修正，原押金来源已变化" },
        },
        tx,
      );
    }
    if (source.settlement && (revisions.length || voidIds.length))
      await this.projection.refresh(scope, auth.userId, tx);
  }

  async onCancel(
    auth: AuthContext,
    before: BillingSource,
    after: BillingSource & { cancelledOn: string },
    tx: AppDbTransaction,
  ): Promise<void> {
    const scope = { organizationId: auth.organizationId, contractId: before.contract.id };
    const source = await this.sources.read(scope, tx);
    assertLifecycleScope(source, scope);
    const cancellationSource: RentalFinanceSnapshot = {
      ...source,
      contract: { ...source.contract, lifecycleStatus: "cancelled" },
      cancelledOn: after.cancelledOn,
    };
    const activeBillIds = source.bills
      .filter((bill) => bill.status === "active")
      .map((bill) => bill.id)
      .sort();
    const hasValidReceipt = source.cashEntries.some(
      (entry) => entry.kind === "receipt" && entry.revokedAt === null,
    );

    if (activeBillIds.length) {
      this.access.assertPermission(auth, "rental_bills:read");
      this.access.assertPermission(auth, "rental_bills:adjust");
    }
    if (hasValidReceipt) {
      this.access.assertPermission(auth, "rental_contracts:read");
      this.access.assertPermission(auth, "rental_bills:read");
      this.access.assertPermission(auth, "rental_settlements:confirm");
      if (await this.settlements.findCurrent(scope, tx))
        throw this.conflict("合同已有结算事件，不能重复生成取消结算");
    }

    if (activeBillIds.length) {
      await this.bills.voidBills(
        { organizationId: auth.organizationId, userId: auth.userId, today: before.today },
        activeBillIds,
        "合同取消",
        tx,
      );
    }

    if (hasValidReceipt) {
      const request = { contractId: scope.contractId, extraFees: [], finalReadings: [] };
      const plan = buildRentalSettlementPlan(cancellationSource, request);
      const created = await this.settlements.create(
        scope,
        plan,
        {
          settlementId: randomUUID(),
          eventId: randomUUID(),
          kind: "cancellation",
          status: statusFor(plan.differenceMinor),
          version: financeSourceVersion(cancellationSource, request),
        },
        { userId: auth.userId },
        tx,
      );
      await this.settlements.linkBills(
        scope,
        created.id,
        source.bills.map(({ id }) => id).sort(),
        tx,
      );
      const projected = await this.projection.refresh(scope, auth.userId, tx);
      if (!projected) throw new Error("Cancellation settlement disappeared during projection");
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_settlement.confirmed",
          targetType: "rental_settlement",
          targetId: projected.id,
          result: "succeeded",
          metadata: { contractId: scope.contractId, kind: "cancellation" },
        },
        tx,
      );
    }

    if (activeBillIds.length) {
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.voided",
          targetType: "rental_contract",
          targetId: scope.contractId,
          result: "succeeded",
          metadata: { count: activeBillIds.length, reason: "合同取消" },
        },
        tx,
      );
    }
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

function assertLifecycleScope(
  source: RentalFinanceSnapshot,
  scope: { organizationId: string; contractId: string },
) {
  if (
    source.context.organizationId !== scope.organizationId ||
    source.context.contractId !== scope.contractId ||
    source.contract.id !== scope.contractId ||
    source.contract.billingMode !== "monthly_settlement"
  ) {
    throw new Error("Monthly lifecycle source scope changed during cancellation");
  }
}

function statusFor(differenceMinor: number) {
  if (differenceMinor < 0) return "pending_refund" as const;
  if (differenceMinor > 0) return "pending_collection" as const;
  return "settled" as const;
}

function effectiveEndDate(source: RentalFinanceSnapshot): string {
  const date = source.contract.terminationDate ?? source.contract.endDate;
  if (!date) throw new RangeError("合同缺少实际结束日期");
  return date;
}

function requiredBillingTerms(source: RentalFinanceSnapshot) {
  const contract = source.contract;
  if (
    !contract.startDate ||
    !contract.endDate ||
    contract.rentAmountMinor === null ||
    contract.billingAnchor === null ||
    contract.paymentIntervalMonths === null ||
    contract.dueDaysBefore === null
  ) {
    throw new RangeError("合同租金账期信息不完整");
  }
  return {
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentAmountMinor: contract.rentAmountMinor,
    billingAnchor: contract.billingAnchor,
    paymentIntervalMonths: contract.paymentIntervalMonths,
    dueDaysBefore: contract.dueDaysBefore,
  };
}

function checkedBillAmount(lines: RentalBillLine[]): number {
  const amountMinor = lines.reduce((total, line) => total + BigInt(line.amountMinor), 0n);
  if (amountMinor < 0n) throw new RangeError("修正后的账单金额不能为负数");
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("修正后的账单金额超出安全范围");
  return Number(amountMinor);
}

function reprojectFixedFeeLine(
  line: RentalBillLine,
  billingMonth: string,
  contractStartDate: string,
  contractEndDate: string,
): RentalBillLine | null {
  const saved = line.feeSnapshot;
  if (saved?.kind !== "fixed_fee") return line;
  const referenceStart = `${billingMonth}-01`;
  const { year, month } = parseCalendarDate(referenceStart);
  const referenceDays = daysInMonth(year, month);
  const referenceEnd = addCalendarDays(referenceStart, referenceDays - 1);
  const periodStart = contractStartDate > referenceStart ? contractStartDate : referenceStart;
  const periodEnd = contractEndDate < referenceEnd ? contractEndDate : referenceEnd;
  if (periodStart > periodEnd) return null;
  if (!Number.isSafeInteger(saved.monthlyAmountMinor) || saved.monthlyAmountMinor < 0) {
    throw new RangeError("固定月费必须是非负安全整数");
  }
  const coveredDays =
    calendarDateToDayNumber(parseCalendarDate(periodEnd)) -
    calendarDateToDayNumber(parseCalendarDate(periodStart)) +
    1;
  const numerator = BigInt(saved.monthlyAmountMinor) * BigInt(coveredDays);
  const amountMinor = Number(
    (numerator * 2n + BigInt(referenceDays)) / (BigInt(referenceDays) * 2n),
  );
  return {
    ...line,
    amountMinor,
    periodStart,
    periodEnd,
    referenceStart,
    referenceEnd,
    coveredDays,
    referenceDays,
    feeSnapshot: { ...saved },
  };
}

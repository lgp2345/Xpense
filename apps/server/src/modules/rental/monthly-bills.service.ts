import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  GenerateRentalMonthlyBillRequest,
  PreviewRentalMonthlyBillRequest,
  RentalBillDetail,
  RentalMonthlyBillPreview,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { PersistableBillingDraft } from "./billing.types.js";
import { BillsRepository } from "./bills.repository.js";
import { daysInMonth, parseCalendarDate } from "./contract-date.rules.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import {
  buildMonthlyBillPlan,
  calculateMonthlyBillCharges,
  MonthlyBillPlanError,
  monthlyBillLinePeriod,
  monthlyMeterKinds,
  sourceForMonthlyBills,
} from "./monthly-bill-plan.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash, isFinanceRequestReplay } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

const action = "monthly_bill.generate";

/** 按一致财务来源预览；确认才写入真实读数、generation、账单、审计和幂等结果。 */
@Injectable()
export class MonthlyBillsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly bills: BillsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  preview(
    auth: AuthContext,
    dto: PreviewRentalMonthlyBillRequest,
  ): Promise<RentalMonthlyBillPreview> {
    this.assertPermissions(auth);
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(
        { organizationId: auth.organizationId, contractId: dto.contractId },
        tx,
      );
      const plan = this.plan(snapshot, dto);
      return {
        version: plan.version,
        canConfirm: plan.missingFields.length === 0 && !plan.existingBill,
        missingFields: plan.missingFields,
        defaults: plan.defaults,
        baselineReadings: plan.baselineReadings,
        lines: plan.lines,
        amountMinor: plan.amountMinor,
        billingMonth: dto.billingMonth,
        existingBillId: plan.existingBill?.id ?? null,
      };
    });
  }

  generate(auth: AuthContext, dto: GenerateRentalMonthlyBillRequest): Promise<RentalBillDetail> {
    this.assertPermissions(auth);
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = { organizationId: auth.organizationId, contractId: dto.contractId };
      const requestHash = financeRequestHash(action, dto);
      const previous = await this.financeRequests.find(scope, dto.idempotencyKey, tx);
      if (previous) {
        if (!isFinanceRequestReplay(previous, { ...scope, action, requestHash }))
          throw this.conflict("请求标识已用于其他租赁财务操作或内容");
        if (previous.result.resourceKind !== "bill")
          throw this.conflict("幂等请求记录与月度账单不一致");
        await this.lockContract(auth, dto.contractId, tx);
        const result = await this.bills.detail(auth.organizationId, previous.result.resourceId, tx);
        if (!result) throw this.conflict("已完成的账单请求缺少账单记录");
        return result;
      }
      if (await this.bills.findGeneration(auth.organizationId, dto.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他租赁账单操作");

      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(scope, tx);
      const plan = this.plan(snapshot, dto);
      if (plan.version !== dto.expectedVersion)
        throw this.conflict("月度账单预览已变化，请重新预览");
      if (plan.missingFields.length)
        throw this.badRequest(`月度账单信息未补齐：${plan.missingFields.join("、")}`);
      if (plan.existingBill) throw this.conflict("该月份已存在有效综合账单");

      for (const kind of monthlyMeterKinds) {
        const interval = plan.intervals[kind];
        if (!interval?.pending) continue;
        const saved = await this.readings.appendBoundary(
          scope,
          {
            ...interval.input,
            spaceId: interval.current.spaceId,
            predecessorId: interval.previous.id,
          },
          "月度综合账单抄表",
          { userId: auth.userId },
          tx,
        );
        interval.current = {
          ...interval.current,
          ...saved,
          id: saved.id,
          predecessorId: interval.previous.id,
        };
      }

      let calculated: ReturnType<typeof calculateMonthlyBillCharges>;
      let rentAmountMinor: number;
      try {
        calculated = calculateMonthlyBillCharges(snapshot, dto, plan.intervals);
        const rentTotal = calculated.lines
          .filter((line) => line.kind === "rent_period")
          .reduce((total, line) => total + BigInt(line.amountMinor), 0n);
        if (rentTotal < 0n || rentTotal > BigInt(Number.MAX_SAFE_INTEGER))
          throw new RangeError("月度租金分类金额超出安全整数范围");
        rentAmountMinor = Number(rentTotal);
      } catch (error) {
        if (error instanceof RangeError) throw this.badRequest(error.message);
        throw error;
      }
      const monthStart = `${dto.billingMonth}-01`;
      const monthEnd = `${dto.billingMonth}-${String(
        daysInMonth(
          parseCalendarDate(`${dto.billingMonth}-01`).year,
          parseCalendarDate(`${dto.billingMonth}-01`).month,
        ),
      ).padStart(2, "0")}`;
      const effectiveEnd = snapshot.contract.terminationDate ?? snapshot.contract.endDate;
      if (!effectiveEnd) throw this.badRequest("合同缺少结束日期");
      const draft: PersistableBillingDraft = {
        type: "monthly",
        modelVersion: 2,
        billingMonth: dto.billingMonth,
        revision: 1,
        sourceKey: `monthly:${dto.billingMonth}`,
        periodStart: monthlyBillLinePeriod(calculated.lines, "start", monthStart),
        periodEnd: monthlyBillLinePeriod(calculated.lines, "end", monthEnd),
        effectiveEnd,
        dueDate: dto.dueDate,
        amountMinor: calculated.amountMinor,
        lines: calculated.lines,
        depositSourceId: null,
        depositSnapshot: null,
        adjustmentId: null,
      };
      const generation = await this.bills.createGeneration(
        {
          organizationId: auth.organizationId,
          contractId: dto.contractId,
          idempotencyKey: dto.idempotencyKey,
          requestHash,
          sourceVersion: dto.expectedVersion,
          origin: "manual",
          createdCount: 1,
          existingCount: 0,
          totals: {
            rentAmountMinor,
            depositAmountMinor: 0,
            monthlyAmountMinor: draft.amountMinor,
          },
          createdByUserId: auth.userId,
        },
        tx,
      );
      const [inserted] = await this.bills.insertBills(
        { organizationId: auth.organizationId, userId: auth.userId, today },
        sourceForMonthlyBills(snapshot),
        generation.id,
        [draft],
        tx,
      );
      if (!inserted) throw new Error("Monthly billing did not persist its bill");
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_monthly_bill.generated",
          targetType: "rental_bill",
          targetId: inserted.id,
          result: "succeeded",
          metadata: { contractId: dto.contractId, billingMonth: dto.billingMonth },
        },
        tx,
      );
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: dto.idempotencyKey,
          action,
          requestHash,
          result: { resourceId: inserted.id, resourceKind: "bill" },
        },
        { userId: auth.userId },
        tx,
      );
      const detail = await this.bills.detail(auth.organizationId, inserted.id, tx);
      if (!detail) throw new Error("Monthly bill detail was not visible in its transaction");
      return detail;
    });
  }

  private plan(snapshot: RentalFinanceSnapshot, dto: PreviewRentalMonthlyBillRequest) {
    try {
      return buildMonthlyBillPlan(snapshot, dto);
    } catch (error) {
      if (error instanceof MonthlyBillPlanError) {
        if (error.kind === "conflict") throw this.conflict(error.message);
        throw this.badRequest(error.message);
      }
      if (error instanceof RangeError) throw this.badRequest(error.message);
      throw error;
    }
  }

  private assertPermissions(auth: AuthContext) {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_bills:read");
    this.access.assertPermission(auth, "rental_monthly_bills:generate");
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

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

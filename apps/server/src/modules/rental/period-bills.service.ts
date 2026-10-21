import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  GenerateRentalPeriodBillRequest,
  PreviewRentalPeriodBillRequest,
  RentalBillDetail,
  RentalPeriodBillContext,
  RentalPeriodBillPreview,
} from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { PersistableBillingDraft } from "./billing.types.js";
import { BillingStartsRepository } from "./billing-starts.repository.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import {
  buildPeriodBillContext,
  buildPeriodBillPlan,
  PeriodBillPlanError,
  sourceForPeriodBills,
} from "./period-bill-plan.rules.js";
import { calculatePeriodCharges } from "./period-charge.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash, isFinanceRequestReplay } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

const action = "period_bill.generate";
@Injectable()
export class PeriodBillsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly bills: BillsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly starts: BillingStartsRepository,
    private readonly requests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  context(auth: AuthContext, input: { contractId: string }): Promise<RentalPeriodBillContext> {
    this.permissions(auth);
    return this.transactions.run(async (tx) => {
      await this.lock(auth, input.contractId, tx);
      const source = await this.sources.read(
        { organizationId: auth.organizationId, contractId: input.contractId },
        tx,
      );
      return this.mapErrors(() => buildPeriodBillContext(source));
    });
  }
  preview(
    auth: AuthContext,
    dto: PreviewRentalPeriodBillRequest,
  ): Promise<RentalPeriodBillPreview> {
    this.permissions(auth);
    return this.transactions.run(async (tx) => {
      await this.lock(auth, dto.contractId, tx);
      const source = await this.sources.read(
        { organizationId: auth.organizationId, contractId: dto.contractId },
        tx,
      );
      const plan = this.plan(source, dto);
      return {
        version: plan.version,
        period: plan.period,
        dueDate: plan.dueDate,
        defaults: plan.defaults,
        baselineReadings: plan.baselineReadings,
        defaultReadings: plan.defaultReadings,
        lines: plan.lines,
        amountMinor: plan.amountMinor,
        missingFields: plan.missingFields,
        canConfirm: plan.missingFields.length === 0,
      };
    });
  }
  generate(auth: AuthContext, dto: GenerateRentalPeriodBillRequest): Promise<RentalBillDetail> {
    this.permissions(auth);
    return this.transactions.run(async (tx) => {
      const { today } = await this.lock(auth, dto.contractId, tx);
      const scope = { organizationId: auth.organizationId, contractId: dto.contractId };
      const hash = financeRequestHash(action, dto);
      const previous = await this.requests.find(scope, dto.idempotencyKey, tx);
      if (previous) {
        if (
          !isFinanceRequestReplay(previous, { ...scope, action, requestHash: hash }) ||
          previous.result.resourceKind !== "bill"
        )
          throw this.conflict("请求标识已用于其他财务操作或内容");
        const detail = await this.bills.detail(auth.organizationId, previous.result.resourceId, tx);
        if (!detail) throw this.conflict("幂等结果缺少账单");
        return detail;
      }
      if (await this.bills.findGeneration(auth.organizationId, dto.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他账单操作");
      const source = await this.sources.read(scope, tx);
      const plan = this.plan(source, dto);
      if (plan.version !== dto.expectedVersion) throw this.conflict("账期预览已变化，请重新预览");
      if (plan.missingFields.length)
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: `账期信息未补齐：${plan.missingFields.join("、")}`,
        });
      if (plan.billingStart) {
        const saved = await this.starts.create(
          scope,
          plan.billingStart,
          { userId: auth.userId },
          tx,
        );
        for (const kind of ["water", "electricity"] as const) {
          const interval = plan.intervals[kind];
          const baseline = saved.baselineReadings.find((reading) => reading.kind === kind);
          if (interval && baseline) {
            interval.previous = baseline;
            interval.current.predecessorId = baseline.id;
          }
        }
      }
      const generation = await this.bills.createGeneration(
        {
          ...scope,
          idempotencyKey: dto.idempotencyKey,
          requestHash: hash,
          sourceVersion: plan.version,
          origin: "manual",
          createdCount: 1,
          existingCount: 0,
          totals: {
            rentAmountMinor: plan.rent.amountMinor,
            depositAmountMinor: 0,
            periodAmountMinor: plan.amountMinor,
          },
          createdByUserId: auth.userId,
        },
        tx,
      );
      const draft: PersistableBillingDraft = {
        ...plan.rent,
        type: "period",
        sourceKey: `period:${plan.period.periodStart}:${plan.period.periodEnd}`,
        dueDate: plan.dueDate,
        lines: plan.lines,
        amountMinor: plan.amountMinor,
        adjustmentId: null,
        ...(dto.note ? { note: dto.note } : {}),
      };
      const bill = await this.bills.insertPeriodHeader(
        { organizationId: auth.organizationId, userId: auth.userId, today },
        sourceForPeriodBills(source),
        generation.id,
        draft,
        tx,
      );
      for (const kind of ["water", "electricity"] as const) {
        const interval = plan.intervals[kind];
        if (!interval) continue;
        const saved = await this.readings.appendBoundary(
          scope,
          {
            ...interval.input,
            spaceId: interval.current.spaceId,
            predecessorId: interval.previous.id,
            source: "bill",
            billId: bill.id,
          },
          "账期账单抄表快照",
          { userId: auth.userId },
          tx,
        );
        interval.current = { ...interval.current, ...saved };
      }
      const calculated = this.mapErrors(() =>
        calculatePeriodCharges({
          rent: plan.rent,
          chargeTerms: plan.defaults,
          readings: plan.intervals,
          extraFees: dto.extraFees,
          ...(dto.overrides ? { overrides: dto.overrides } : {}),
        }),
      );
      if (calculated.amountMinor !== plan.amountMinor)
        throw new Error("Persisted rental reading amount differs from preview");
      await this.bills.insertPeriodLines(scope, bill.id, calculated.lines, tx);
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_period_bill.generated",
          targetType: "rental_bill",
          targetId: bill.id,
          result: "succeeded",
          metadata: { contractId: dto.contractId, ...plan.period },
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
      const detail = await this.bills.detail(auth.organizationId, bill.id, tx);
      if (!detail) throw new Error("Period bill detail missing inside transaction");
      return detail;
    });
  }
  private plan(source: RentalFinanceSnapshot, dto: PreviewRentalPeriodBillRequest) {
    return this.mapErrors(() => buildPeriodBillPlan(source, dto));
  }
  private mapErrors<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof PeriodBillPlanError && error.kind === "conflict")
        throw this.conflict(error.message);
      if (error instanceof RangeError || error instanceof PeriodBillPlanError)
        throw new BadRequestException({
          code: apiErrorCodes.validationFailed,
          message: error.message,
        });
      throw error;
    }
  }
  private permissions(auth: AuthContext) {
    for (const key of [
      "rental_contracts:read",
      "rental_bills:read",
      "rental_period_bills:generate",
    ] as const)
      this.access.assertPermission(auth, key);
  }
  private async lock(auth: AuthContext, id: string, tx: AppDbTransaction) {
    const context = await this.policy.lockOrganizationContext(auth.organizationId, tx);
    const header = this.policy.requireContract(
      await this.contracts.find(auth.organizationId, id, tx),
    );
    await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
    this.policy.requireContract(await this.contracts.findForUpdate(auth.organizationId, id, tx));
    return context;
  }
  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

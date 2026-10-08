import { ConflictException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource } from "./billing.types.js";
import { toBillingContractDates } from "./billing-contract-dates.rules.js";
import { billingDigest, buildDepositDrafts } from "./billing-source.rules.js";
import { BillingStartsRepository } from "./billing-starts.repository.js";
import { BillsRepository } from "./bills.repository.js";
import type { MutableContractAggregate } from "./contract-lifecycle.service.js";
import type { TerminateContractDto } from "./dto/terminate-contract.dto.js";
import { buildPeriodSettlementPlan } from "./period-settlement.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { SettlementWriteService } from "./settlement-write.service.js";

type BillingComparable = {
  startDate: string | null;
  endDate: string | null;
  rentAmountMinor: number | null;
  billingAnchor: string | null;
  paymentIntervalMonths: number | null;
  propertyId: string;
  spaces: Array<{ spaceId: string; rentAllocationMinor?: number | null }>;
  depositTerms: unknown[];
};
/** 合同事务内的账单联动，不反向调用合同 service。 */
@Injectable()
export class BillingLifecycleService {
  constructor(
    private readonly bills: BillsRepository,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly financeSources: RentalFinanceSourceService,
    private readonly settlementWriter: SettlementWriteService,
    private readonly starts: BillingStartsRepository,
  ) {}

  /** 已出账普通账单不可变；合同更正不得自动重写费用快照。 */
  assertCorrectionAllowed(
    _auth: AuthContext,
    before: BillingSource,
    aggregate: MutableContractAggregate,
  ) {
    const projected = toBillingContractDates({ ...before.contract, ...aggregate });

    if (
      before.activeBills.some((bill) => bill.type === "period") &&
      this.billingChanged(before.contract, projected)
    ) {
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "存在有效普通账单，请先逐期作废后更正计费条款",
      });
    }
  }
  async onCorrection(
    auth: AuthContext,
    before: BillingSource,
    after: BillingSource,
    tx: AppDbTransaction,
  ): Promise<void> {
    if (
      this.billingChanged(before.contract, after.contract) &&
      before.activeBills.some((bill) => bill.type === "period")
    )
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "合同更正不能改写已出账费用",
      });
    const current = await this.financeSources.read(
      { organizationId: auth.organizationId, contractId: before.contract.id },
      tx,
    );
    if (current.settlement && this.billingChanged(before.contract, after.contract))
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "已确认结算不能更正计费条款",
      });
    const deposits = new Map(
      buildDepositDrafts(after.contract.depositTerms, {}).map((draft) => [
        draft.sourceKey,
        draft.amountMinor,
      ]),
    );
    const obsoleteDeposits = before.activeBills
      .filter(
        (bill) => bill.type === "deposit" && deposits.get(bill.sourceKey) !== bill.amountMinor,
      )
      .map((bill) => bill.id);
    if (obsoleteDeposits.length) {
      this.access.assertPermission(auth, "rental_bills:adjust");
      await this.bills.voidBills(
        { organizationId: auth.organizationId, userId: auth.userId, today: before.today },
        obsoleteDeposits,
        "合同押金来源更正",
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.voided",
          targetType: "rental_contract",
          targetId: before.contract.id,
          result: "succeeded",
          metadata: { count: obsoleteDeposits.length, reason: "合同押金来源更正" },
        },
        tx,
      );
    }
    const boundaries = (source: BillingSource) => ({
      startDate: source.contract.startDate,
      endDate: source.contract.endDate,
      billingAnchor: source.contract.billingAnchor,
      paymentIntervalMonths: source.contract.paymentIntervalMonths,
    });
    if (billingDigest(boundaries(before)) !== billingDigest(boundaries(after))) {
      await this.starts.invalidate(
        { organizationId: auth.organizationId, contractId: before.contract.id },
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_billing_start.invalidated",
          targetType: "rental_contract",
          targetId: before.contract.id,
          result: "succeeded",
          metadata: { reason: "合同账期边界已更正" },
        },
        tx,
      );
    }
  }
  private billingChanged(before: BillingComparable, after: BillingComparable): boolean {
    const terms = (contract: BillingComparable) => ({
      startDate: contract.startDate,
      endDate: contract.endDate,
      rentAmountMinor: contract.rentAmountMinor,
      billingAnchor: contract.billingAnchor,
      paymentIntervalMonths: contract.paymentIntervalMonths,
      propertyId: contract.propertyId,
      spaces: contract.spaces.map((space) => ({
        spaceId: space.spaceId,
        rentAllocationMinor: space.rentAllocationMinor,
      })),
    });
    return billingDigest(terms(before)) !== billingDigest(terms(after));
  }
  async onCancel(
    auth: AuthContext,
    before: BillingSource,
    after: BillingSource & { cancelledOn: string },
    tx: AppDbTransaction,
  ): Promise<void> {
    const scope = { organizationId: auth.organizationId, contractId: before.contract.id };
    const source = await this.financeSources.read(scope, tx);
    if (source.settlement)
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "已确认结算不能取消合同",
      });
    const ids = source.bills.filter((bill) => bill.status === "active").map((bill) => bill.id);
    if (ids.length) {
      this.access.assertPermission(auth, "rental_period_bills:void");
      await this.bills.voidBills(
        { organizationId: auth.organizationId, userId: auth.userId, today: before.today },
        ids,
        "合同取消",
        tx,
      );
    }
    if (source.cashEntries.some((entry) => entry.revokedAt === null && entry.kind === "receipt")) {
      this.access.assertPermission(auth, "rental_settlements:confirm");
      const plan = buildPeriodSettlementPlan(
        {
          ...source,
          contract: { ...source.contract, lifecycleStatus: "cancelled" },
          cancelledOn: after.cancelledOn,
        },
        { contractId: before.contract.id, finalReadings: [], extraFees: [] },
      );
      const settlement = await this.settlementWriter.persist(
        scope,
        plan,
        [],
        { userId: auth.userId },
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_settlement.confirmed",
          targetType: "rental_settlement",
          targetId: settlement.id,
          result: "succeeded",
          metadata: { contractId: before.contract.id, kind: "cancellation" },
        },
        tx,
      );
    }
    if (ids.length)
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.voided",
          targetType: "rental_contract",
          targetId: before.contract.id,
          result: "succeeded",
          metadata: { count: ids.length, reason: "合同取消" },
        },
        tx,
      );
  }
  async onTerminate(
    auth: AuthContext,
    source: BillingSource,
    _dto: TerminateContractDto,
    tx: AppDbTransaction,
    _recordedAt?: Date,
  ): Promise<void> {
    await this.assertNoSettlement(auth, source, tx);
  }
  async onRevokeTermination(
    auth: AuthContext,
    source: BillingSource,
    tx: AppDbTransaction,
  ): Promise<void> {
    await this.assertNoSettlement(auth, source, tx);
  }
  private async assertNoSettlement(auth: AuthContext, source: BillingSource, tx: AppDbTransaction) {
    const current = await this.financeSources.read(
      { organizationId: auth.organizationId, contractId: source.contract.id },
      tx,
    );
    if (current.settlement)
      throw new ConflictException({
        code: apiErrorCodes.conflict,
        message: "已确认结算不能更改合同结束事件",
      });
  }
}

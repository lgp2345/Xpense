import { ConflictException, Injectable } from "@nestjs/common";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { BillingStartsRepository } from "./billing-starts.repository.js";
import type { AuthContext } from "../../common/auth/auth-context.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource } from "./billing.types.js";
import { toBillingContractDates } from "./billing-contract-dates.rules.js";
import { billingDraftMatches, normalBillingDrafts } from "./billing-plan.rules.js";
import { billingDigest } from "./billing-source.rules.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsRepository } from "./bills.repository.js";
import { finalDepositAmount } from "./contract.rules.js";
import type { MutableContractAggregate } from "./contract-lifecycle.service.js";
import type { PreviewTerminationDto } from "./dto/preview-termination.dto.js";
import type { TerminateContractDto } from "./dto/terminate-contract.dto.js";
import { MonthlyBillingLifecycleService } from "./monthly-billing-lifecycle.service.js";

/** 合同事务内的账单联动，不反向调用合同 service。 */
@Injectable()
export class BillingLifecycleService {
  constructor(
    private readonly bills: BillsRepository,
    private readonly termination: BillingTerminationService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly monthly: MonthlyBillingLifecycleService,
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
  private billingChanged(
    before: BillingSource["contract"],
    after: BillingSource["contract"],
  ): boolean {
    const terms = (contract: BillingSource["contract"]) => ({
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
      depositTerms: contract.depositTerms,
    });
    return billingDigest(terms(before)) !== billingDigest(terms(after));
  }
  async onCancel(
    auth: AuthContext,
    source: BillingSource,
    after: BillingSource & { cancelledOn: string },
    tx: AppDbTransaction,
  ): Promise<void> {
    {
      await this.monthly.onCancel(auth, source, after, tx);
      return;
    }
    await this.void(
      auth,
      source,
      source.activeBills.map((bill) => bill.id),
      "合同取消",
      tx,
    );
  }
  previewTermination(auth: AuthContext, dto: PreviewTerminationDto) {
    return this.termination.previewTermination(auth, dto);
  }
  async onTerminate(
    _auth: AuthContext,
    _source: BillingSource,
    _dto: TerminateContractDto,
    _tx: AppDbTransaction,
    _recordedAt?: Date,
  ): Promise<void> {}
  async onRevokeTermination(
    _auth: AuthContext,
    _source: BillingSource,
    _tx: AppDbTransaction,
  ): Promise<void> {}

  private affected(before: BillingSource, after: BillingSource): string[] {
    if (!before.activeBills.length) return [];
    const affiliation = (source: BillingSource) => ({
      propertyId: source.contract.propertyId,
      spaces: source.contract.spaces
        .map(({ spaceId, rentAllocationMinor }) => ({ spaceId, rentAllocationMinor }))
        .toSorted((a, b) => a.spaceId.localeCompare(b.spaceId)),
      parties: source.contract.parties
        .map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer }))
        .toSorted((a, b) => a.tenantId.localeCompare(b.tenantId)),
    });
    if (billingDigest(affiliation(before)) !== billingDigest(affiliation(after)))
      return before.activeBills.map((bill) => bill.id);
    const applicable = new Map(
      normalBillingDrafts(after, {}).map((draft) => [draft.sourceKey, draft]),
    );
    return before.activeBills
      .filter((bill) => {
        const draft = applicable.get(bill.sourceKey);
        return !draft || !billingDraftMatches(draft, bill);
      })
      .map((bill) => bill.id);
  }
  private assertAffected(auth: AuthContext, ids: string[]) {
    if (ids.length) {
      this.access.assertPermission(auth, "rental_bills:read");
      this.access.assertPermission(auth, "rental_bills:adjust");
    }
  }
  private async void(
    auth: AuthContext,
    source: BillingSource,
    ids: string[],
    reason: string,
    tx: AppDbTransaction,
  ) {
    this.assertAffected(auth, ids);
    if (!ids.length) return;
    await this.bills.voidBills(
      { organizationId: auth.organizationId, userId: auth.userId, today: source.today },
      ids,
      reason,
      tx,
    );
    await this.audit.appendRequired(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "rental_bill.voided",
        targetType: "rental_contract",
        targetId: source.contract.id,
        result: "succeeded",
        metadata: { count: ids.length, reason },
      },
      tx,
    );
  }
}

import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../../common/auth/auth-context.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource } from "./billing.types.js";
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
  ) {}

  /** 写入合同前按已验证的聚合判断条件权限。 */
  assertCorrectionAllowed(
    auth: AuthContext,
    before: BillingSource,
    aggregate: MutableContractAggregate,
  ) {
    if (!before.activeBills.length) return;
    const contract = {
      ...before.contract,
      ...aggregate,
      paymentIntervalMonths:
        aggregate.paymentIntervalMonths as BillingSource["contract"]["paymentIntervalMonths"],
      spaces: aggregate.spaces.map((space) => ({
        ...before.contract.spaces.find((item) => item.spaceId === space.spaceId),
        spaceId: space.spaceId,
        rentAllocationMinor: space.rentAllocationMinor ?? null,
      })) as BillingSource["contract"]["spaces"],
      parties: aggregate.parties.map((party) => ({
        ...before.contract.parties.find((item) => item.tenantId === party.tenantId),
        ...party,
      })) as BillingSource["contract"]["parties"],
      depositTerms: aggregate.depositTerms.map((term, index) => ({
        ...term,
        id: `preview-${index}`,
        finalAmountMinor: finalDepositAmount(term, aggregate.rentAmountMinor as number),
      })),
    };
    this.assertAffected(auth, this.affected(before, { ...before, contract }));
  }
  async onCorrection(
    auth: AuthContext,
    before: BillingSource,
    after: BillingSource,
    tx: AppDbTransaction,
  ): Promise<void> {
    if (before.contract.billingMode === "monthly_settlement") {
      await this.monthly.onCorrection(auth, before, after, tx);
      return;
    }
    await this.void(
      auth,
      before,
      this.affected(before, after),
      "合同修正，计费依据或归属快照变化",
      tx,
    );
  }
  async onCancel(
    auth: AuthContext,
    source: BillingSource,
    after: BillingSource & { cancelledOn: string },
    tx: AppDbTransaction,
  ): Promise<void> {
    if (source.contract.billingMode === "monthly_settlement") {
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
  onTerminate(
    auth: AuthContext,
    source: BillingSource,
    dto: TerminateContractDto,
    tx: AppDbTransaction,
    recordedAt?: Date,
  ) {
    if (source.contract.billingMode === "monthly_settlement") {
      const after: BillingSource = {
        ...source,
        contract: {
          ...source.contract,
          lifecycleStatus: "terminated",
          terminationDate: dto.terminationDate,
        },
        terminationRecordedAt: recordedAt?.toISOString() ?? null,
      };
      return this.monthly.onTerminate(auth, source, after, tx);
    }
    return this.termination.onTerminate(auth, source, dto, tx, recordedAt);
  }
  onRevokeTermination(auth: AuthContext, source: BillingSource, tx: AppDbTransaction) {
    if (source.contract.billingMode === "monthly_settlement") {
      const after: BillingSource = {
        ...source,
        contract: {
          ...source.contract,
          lifecycleStatus: "confirmed",
          terminationDate: null,
        },
        terminationRecordedAt: null,
      };
      return this.monthly.onRevokeTermination(auth, source, after, tx);
    }
    return this.termination.onRevokeTermination(auth, source, tx);
  }

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

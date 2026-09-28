import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { RentalBillTerminationConfirmation, RentalTerminationPreview } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";
import type { BillingSource } from "./billing.types.js";
import { normalBillingDrafts } from "./billing-plan.rules.js";
import { billingDigest, billingFingerprint, billingTerms } from "./billing-source.rules.js";
import { BillingSourceService } from "./billing-source.service.js";
import { calculateTerminationReference } from "./billing-termination.rules.js";
import { assertCurrentAdjustment, terminationDraft } from "./billing-termination-plan.rules.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { PreviewTerminationDto } from "./dto/preview-termination.dto.js";
import type { TerminateContractDto } from "./dto/terminate-contract.dto.js";

/** 完整的终止财务事件处理，复用调用方事务。 */
@Injectable()
export class BillingTerminationService {
  constructor(
    private readonly bills: BillsRepository,
    private readonly adjustments: BillAdjustmentsRepository,
    private readonly sources: BillingSourceService,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async previewTermination(
    auth: AuthContext,
    dto: PreviewTerminationDto,
  ): Promise<RentalTerminationPreview> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_bills:read");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const header = this.policy.requireContract(
        await this.contracts.find(auth.organizationId, dto.contractId, tx),
      );
      await this.policy.requireOwnedPropertyForUpdate(auth.organizationId, header.propertyId, tx);
      this.policy.requireContract(
        await this.contracts.findForUpdate(auth.organizationId, dto.contractId, tx),
      );
      const source = await this.sources.read(auth.organizationId, dto.contractId, tx);
      if (source.contract.lifecycleStatus !== "confirmed")
        throw this.conflict("当前合同不能提前终止");
      const reference = this.reference(source, dto.terminationDate);
      return {
        periodStart: reference.periodStart,
        periodEnd: reference.periodEnd,
        originalAmountMinor: reference.originalAmountMinor,
        referenceAmountMinor: reference.referenceAmountMinor,
        version: billingFingerprint(source, { terminationDate: dto.terminationDate }),
        affectedBillCount: source.activeBills.filter(
          (bill) => bill.type === "rent" && (bill.periodEnd as string) >= reference.periodStart,
        ).length,
        requiresConfirmation: await this.bills.hasHistory(auth.organizationId, dto.contractId, tx),
      };
    });
  }
  async onTerminate(
    auth: AuthContext,
    source: BillingSource,
    dto: TerminateContractDto,
    tx: AppDbTransaction,
    recordedAt = new Date(),
  ): Promise<void> {
    const history = await this.bills.hasHistory(auth.organizationId, source.contract.id, tx);
    if (!history && !dto.billingConfirmation) return;
    this.assertAdjust(auth);
    if (!dto.billingConfirmation) throw this.badRequest("已有账单，请确认终止当期最终应收及原因");
    if (
      dto.billingConfirmation.expectedVersion !==
      billingFingerprint(source, { terminationDate: dto.terminationDate })
    )
      throw this.conflict("终止账单参考已变化，请重新确认");
    const adjustment = await this.confirm(
      auth,
      source,
      dto.terminationDate,
      dto.billingConfirmation,
      recordedAt,
      tx,
    );
    const reference = this.reference(source, dto.terminationDate);
    const ids = source.activeBills
      .filter((bill) => bill.type === "rent" && (bill.periodEnd as string) >= reference.periodStart)
      .map((bill) => bill.id);
    await this.bills.voidBills(this.context(auth, source), ids, "合同提前终止", tx);
    const current = source.activeBills.find(
      (bill) => bill.type === "rent" && bill.periodStart === reference.periodStart,
    );
    if (!current) return;
    const draft = normalBillingDrafts(source, {}).find(
      (item) => item.type === "rent" && item.periodStart === reference.periodStart,
    );
    if (!draft) throw this.conflict("终止当期缺少原计划");
    const replacement = terminationDraft(draft, dto.terminationDate, adjustment.finalAmountMinor);
    const generation = await this.bills.createGeneration(
      {
        organizationId: auth.organizationId,
        contractId: source.contract.id,
        idempotencyKey: randomUUID(),
        requestHash: billingDigest({ adjustmentId: adjustment.id }),
        sourceVersion: dto.billingConfirmation.expectedVersion,
        origin: "termination",
        createdCount: 1,
        existingCount: 0,
        totals: { rentAmountMinor: replacement.amountMinor, depositAmountMinor: 0 },
        createdByUserId: auth.userId,
      },
      tx,
    );
    await this.bills.insertBills(
      this.context(auth, source),
      source,
      generation.id,
      [{ ...replacement, dueDate: replacement.dueDate as string, adjustmentId: adjustment.id }],
      tx,
    );
  }
  async confirm(
    auth: AuthContext,
    source: BillingSource,
    date: string,
    confirmation: RentalBillTerminationConfirmation,
    recordedAt: Date,
    tx: AppDbTransaction,
  ) {
    this.assertAdjust(auth);
    const reference = this.reference(source, date);
    const adjustment = await this.adjustments.insert(
      {
        organizationId: auth.organizationId,
        contractId: source.contract.id,
        terminationDate: date,
        terminationRecordedAt: recordedAt,
        periodStart: reference.periodStart,
        periodEnd: reference.periodEnd,
        originalAmountMinor: reference.originalAmountMinor,
        referenceAmountMinor: reference.referenceAmountMinor,
        finalAmountMinor: confirmation.finalAmountMinor,
        reason: confirmation.reason,
        createdByUserId: auth.userId,
      },
      tx,
    );
    await this.audit.appendRequired(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "rental_bill.termination_confirmed",
        targetType: "rental_bill_adjustment",
        targetId: adjustment.id,
        result: "succeeded",
        metadata: { contractId: source.contract.id, finalAmountMinor: adjustment.finalAmountMinor },
      },
      tx,
    );
    return adjustment;
  }
  async onRevokeTermination(
    auth: AuthContext,
    source: BillingSource,
    tx: AppDbTransaction,
  ): Promise<void> {
    if (!source.adjustment) return;
    this.assertAdjust(auth);
    try {
      assertCurrentAdjustment(source);
    } catch (error) {
      throw this.conflict(error instanceof Error ? error.message : "终止事件不一致");
    }
    await this.adjustments.revoke(
      this.context(auth, source),
      source.contract.id,
      source.adjustment.id,
      "撤销未来终止",
      tx,
    );
    await this.bills.voidBills(
      this.context(auth, source),
      source.activeBills
        .filter((bill) => bill.adjustmentId === source.adjustment?.id)
        .map((bill) => bill.id),
      "撤销未来终止",
      tx,
    );
    await this.audit.appendRequired(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "rental_bill.termination_revoked",
        targetType: "rental_bill_adjustment",
        targetId: source.adjustment.id,
        result: "succeeded",
        metadata: { contractId: source.contract.id },
      },
      tx,
    );
  }
  private reference(source: BillingSource, date: string) {
    try {
      return calculateTerminationReference(billingTerms(source), date);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw this.badRequest(error.message);
    }
  }
  private assertAdjust(auth: AuthContext) {
    this.access.assertPermission(auth, "rental_bills:read");
    this.access.assertPermission(auth, "rental_bills:adjust");
  }
  private context(auth: AuthContext, source: BillingSource) {
    return { organizationId: auth.organizationId, userId: auth.userId, today: source.today };
  }
  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

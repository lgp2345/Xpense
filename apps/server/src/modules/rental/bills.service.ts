import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  RentalBillGenerationInput,
  RentalBillGenerationResult,
  RentalBillPreview,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import type { BillingSource, PersistableBillingDraft } from "./billing.types.js";
import {
  assembleBillingPreview,
  billingDraftMatches,
  billingTotals,
} from "./billing-plan.rules.js";
import { billingDigest, billingFingerprint, buildDepositDrafts } from "./billing-source.rules.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsRepository } from "./bills.repository.js";
import type { GenerationRecord } from "./bills.repository.types.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { GenerateBillsDto } from "./dto/generate-bills.dto.js";
import type { PreviewBillsDto } from "./dto/preview-bills.dto.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { financeRequestHash } from "./rental-finance-request.rules.js";

/** 同组织→房产→合同锁下，预览一致来源并整批幂等保存。 */
@Injectable()
export class BillsService {
  constructor(
    private readonly sources: BillingSourceService,
    private readonly bills: BillsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly termination: BillingTerminationService,
    private readonly financeRequests: FinanceRequestsRepository,
  ) {}

  async preview(auth: AuthContext, dto: PreviewBillsDto): Promise<RentalBillPreview> {
    this.assertGenerationPermissions(auth);
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const source = await this.readLocked(auth, dto.contractId, tx);
      const input = this.input(dto);
      this.assertEligible(source);
      const version = billingFingerprint(source, input);
      if (dto.expectedVersion && dto.expectedVersion !== version)
        throw this.conflict("账单预览已变化，请重新预览");
      const plan = this.plan(source, input);
      return {
        items: plan.items.slice((dto.page - 1) * dto.pageSize, dto.page * dto.pageSize),
        total: plan.items.length,
        page: dto.page,
        pageSize: dto.pageSize,
        version,
        canGenerate:
          plan.missingDepositSourceKeys.length === 0 && !plan.requiresTerminationConfirmation,
        createCount: plan.creates.length,
        existingCount: plan.items.length - plan.creates.length,
        totals: plan.totals,
        createTotals: plan.createTotals,
        missingDepositSourceKeys: plan.missingDepositSourceKeys,
        depositInputs: plan.creates
          .filter((draft) => draft.type === "deposit")
          .map((draft) => ({
            sourceKey: draft.sourceKey,
            label: draft.lines[0]?.label ?? "押金",
            amountMinor: draft.amountMinor,
          })),
        terminationReference: plan.terminationReference,
      };
    });
  }

  async generate(auth: AuthContext, dto: GenerateBillsDto): Promise<RentalBillGenerationResult> {
    this.assertGenerationPermissions(auth);
    if (dto.terminationConfirmation) this.access.assertPermission(auth, "rental_bills:adjust");
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const input = this.input(dto);
      const legacyRequestHash = billingDigest({ ...input, expectedVersion: dto.expectedVersion });
      const previous = await this.bills.findGeneration(auth.organizationId, dto.idempotencyKey, tx);
      if (previous) {
        const financeRequest = await this.financeRequests.find(
          { organizationId: auth.organizationId, contractId: dto.contractId },
          dto.idempotencyKey,
          tx,
        );
        const bridgedDepositReplay =
          input.scope === "deposits" &&
          financeRequest?.action === "bill_deposit.generate" &&
          financeRequest.result.resourceKind === "generation" &&
          financeRequest.result.resourceId === previous.id;
        const generationRequestHash = bridgedDepositReplay
          ? this.depositRequestHash(input)
          : legacyRequestHash;
        if (
          previous.contractId !== dto.contractId ||
          previous.requestHash !== generationRequestHash
        )
          throw this.conflict("请求标识已用于其他账单内容");
        if (financeRequest) {
          const matchesV2Deposit =
            bridgedDepositReplay &&
            financeRequest.contractId === dto.contractId &&
            financeRequest.requestHash === this.depositRequestHash(input);
          if (!matchesV2Deposit) throw this.conflict("请求标识已用于其他租赁财务操作");
        }
        await this.lockContract(auth, dto.contractId, tx);
        return this.result(previous, true);
      }
      if (
        await this.financeRequests.find(
          { organizationId: auth.organizationId, contractId: dto.contractId },
          dto.idempotencyKey,
          tx,
        )
      )
        throw this.conflict("请求标识已用于其他租赁财务操作");
      const source = await this.readLocked(auth, dto.contractId, tx);
      this.assertEligible(source);
      const monthlyMode = source.contract.billingMode === "monthly_settlement";
      if (monthlyMode && dto.scope !== "deposits")
        throw this.conflict("月度结算合同请使用月度账单入口；旧入口仅可显式生成押金");
      if (monthlyMode && dto.terminationConfirmation)
        throw this.badRequest("月度押金生成不接受终止租金确认");
      if (billingFingerprint(source, input) !== dto.expectedVersion)
        throw this.conflict("账单预览已变化，请重新预览");
      const plan = this.plan(source, input);
      if (plan.requiresTerminationConfirmation)
        throw this.badRequest("请确认终止当期最终应收及原因");
      if (plan.missingDepositSourceKeys.length) throw this.badRequest("请填写每项新增押金的到期日");
      if (!plan.creates.length)
        return {
          generationId: null,
          createdCount: 0,
          existingCount: plan.items.length,
          totals: plan.createTotals,
          replayed: false,
        };
      let adjustmentId = source.adjustment?.id ?? null;
      if (
        source.contract.lifecycleStatus === "terminated" &&
        !source.adjustment &&
        dto.terminationConfirmation
      ) {
        if (!source.terminationRecordedAt || !source.contract.terminationDate)
          throw this.conflict("合同缺少终止事件信息");
        const adjustment = await this.termination.confirm(
          auth,
          source,
          source.contract.terminationDate,
          dto.terminationConfirmation,
          new Date(source.terminationRecordedAt),
          tx,
        );
        adjustmentId = adjustment.id;
      }
      const generation = await this.bills.createGeneration(
        {
          organizationId: auth.organizationId,
          contractId: dto.contractId,
          idempotencyKey: dto.idempotencyKey,
          requestHash: monthlyMode ? this.depositRequestHash(input) : legacyRequestHash,
          sourceVersion: dto.expectedVersion,
          origin: "manual",
          createdCount: plan.creates.length,
          existingCount: plan.items.length - plan.creates.length,
          totals: plan.createTotals,
          createdByUserId: auth.userId,
        },
        tx,
      );
      const drafts: PersistableBillingDraft[] = plan.creates.map((draft) => {
        const persistedFields = {
          dueDate: draft.dueDate as string,
          adjustmentId:
            draft.type === "rent" && draft.effectiveEnd === source.contract.terminationDate
              ? adjustmentId
              : null,
        };
        if (monthlyMode && draft.type === "deposit")
          return {
            ...draft,
            type: "deposit" as const,
            ...persistedFields,
            modelVersion: 2 as const,
            billingMonth: null,
          };
        return { ...draft, ...persistedFields };
      });
      await this.bills.insertBills(
        { organizationId: auth.organizationId, userId: auth.userId, today },
        source,
        generation.id,
        drafts,
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_bill.generated",
          targetType: "rental_bill_generation",
          targetId: generation.id,
          result: "succeeded",
          metadata: { contractId: dto.contractId, createdCount: plan.creates.length },
        },
        tx,
      );
      if (monthlyMode) {
        await this.financeRequests.complete(
          { organizationId: auth.organizationId, contractId: dto.contractId },
          {
            idempotencyKey: dto.idempotencyKey,
            action: "bill_deposit.generate",
            requestHash: this.depositRequestHash(input),
            result: { resourceId: generation.id, resourceKind: "generation" },
          },
          { userId: auth.userId },
          tx,
        );
      }
      return this.result(generation, false);
    });
  }

  private input(dto: RentalBillGenerationInput): RentalBillGenerationInput {
    return {
      contractId: dto.contractId,
      depositDueDates: dto.depositDueDates,
      ...(dto.scope ? { scope: dto.scope } : {}),
      ...(dto.terminationConfirmation
        ? { terminationConfirmation: dto.terminationConfirmation }
        : {}),
    };
  }

  private plan(source: BillingSource, input: RentalBillGenerationInput) {
    this.assertEligible(source);
    if (source.contract.billingMode === "monthly_settlement") {
      if (input.scope !== "deposits")
        throw this.conflict("月度结算合同请使用月度账单入口；旧入口仅可显式生成押金");
      return this.planDeposits(source, input);
    }
    let plan: ReturnType<typeof assembleBillingPreview>;
    try {
      plan = assembleBillingPreview(source, input);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      if (error.message.includes("不一致")) throw this.conflict(error.message);
      throw this.badRequest(error.message);
    }
    const missing = new Set(
      plan.creates.filter((draft) => draft.type === "deposit").map((draft) => draft.sourceKey),
    );
    if (Object.keys(input.depositDueDates).some((key) => !missing.has(key)))
      throw this.badRequest("押金日期只能填写当前缺失的项目");
    return plan;
  }

  private planDeposits(source: BillingSource, input: RentalBillGenerationInput) {
    const drafts = buildDepositDrafts(source.contract.depositTerms, input.depositDueDates);
    const active = new Map(
      source.activeBills
        .filter(({ type }) => type === "deposit")
        .map((bill) => [bill.sourceKey, bill]),
    );
    const draftKeys = new Set(drafts.map(({ sourceKey }) => sourceKey));
    if ([...active.keys()].some((key) => !draftKeys.has(key)))
      throw this.conflict("有效押金账单与当前合同约定不一致");
    const creates = [] as typeof drafts;
    const items = drafts.map((draft) => {
      const bill = active.get(draft.sourceKey);
      if (bill && !billingDraftMatches(draft, bill))
        throw this.conflict("有效押金账单与当前合同约定不一致");
      if (!bill) creates.push(draft);
      return {
        type: draft.type,
        sourceKey: draft.sourceKey,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        effectiveEnd: draft.effectiveEnd,
        dueDate: bill?.dueDate ?? draft.dueDate,
        amountMinor: bill?.amountMinor ?? draft.amountMinor,
        lines: bill?.lines ?? draft.lines,
        disposition: bill ? ("existing" as const) : ("create" as const),
        existingBillId: bill?.id ?? null,
      };
    });
    const missingDepositSourceKeys = creates
      .filter((draft) => !draft.dueDate)
      .map(({ sourceKey }) => sourceKey);
    const missing = new Set(creates.map(({ sourceKey }) => sourceKey));
    if (Object.keys(input.depositDueDates).some((key) => !missing.has(key)))
      throw this.badRequest("押金日期只能填写当前缺失的项目");
    return {
      creates,
      items,
      missingDepositSourceKeys,
      requiresTerminationConfirmation: false,
      terminationReference: null,
      totals: billingTotals(items),
      createTotals: billingTotals(creates),
    };
  }

  private depositRequestHash(input: RentalBillGenerationInput): string {
    return financeRequestHash("bill_deposit.generate", input);
  }

  private assertEligible(source: BillingSource) {
    if (
      source.contract.lifecycleStatus === "draft" ||
      source.contract.lifecycleStatus === "cancelled"
    )
      throw this.conflict("草稿或已取消合同不能生成账单");
  }

  private assertGenerationPermissions(auth: AuthContext) {
    for (const permission of [
      "rental_contracts:read",
      "rental_bills:read",
      "rental_bills:generate",
    ] as const)
      this.access.assertPermission(auth, permission);
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
  private async readLocked(auth: AuthContext, contractId: string, tx: AppDbTransaction) {
    await this.lockContract(auth, contractId, tx);
    return this.sources.read(auth.organizationId, contractId, tx);
  }
  private result(record: GenerationRecord, replayed: boolean): RentalBillGenerationResult {
    return {
      generationId: record.id,
      createdCount: record.createdCount,
      existingCount: record.existingCount,
      totals: record.totals,
      replayed,
    };
  }
  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }
}

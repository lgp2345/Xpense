import { Injectable } from "@nestjs/common";
import type { RentalContractDetail } from "@xpense/shared";

import { toContractDetail } from "./contract-read-model.js";

export { toContractDetail, toContractSummary } from "./contract-read-model.js";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { BillingSourceService } from "./billing-source.service.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import {
  addCalendarDays,
  compareCalendarDates,
  organizationDate,
} from "./contract-date.rules.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import {
  actualContractEndTime,
  contractCalendarDay,
  normalizeContractTime,
} from "./contract-time.rules.js";
import { ContractsRepository } from "./contracts.repository.js";
import type {
  ContractDepositReference,
  RentalContractDetailRecord,
  RentalContractRecord,
} from "./contracts.repository.types.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type {
  CancelContractDto,
  ConfirmContractDto,
  RenewContractDto,
  RevokeContractTerminationDto,
} from "./dto/contract-action.dto.js";
import type { CreateContractDto } from "./dto/create-contract.dto.js";
import type { TerminateContractDto } from "./dto/terminate-contract.dto.js";
import type { UpdateContractDto } from "./dto/update-contract.dto.js";
import type { RentalPropertyRecord } from "./properties.repository.types.js";

export type MutableContractAggregate = {
  propertyId: string;
  externalContractNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  rentAmountMinor: number | null;
  billingAnchor: RentalContractRecord["billingAnchor"];
  paymentIntervalMonths: number | null;
  dueDaysBefore: number | null;
  parties: Array<{ tenantId: string; isPrimaryPayer: boolean }>;
  spaces: Array<{ spaceId: string; rentAllocationMinor?: number }>;
  depositTerms: ContractDepositReference[];
  note: string | null;
};

/** 编排合同确认与开始前取消；终止和续租由后续任务扩展。 */
@Injectable()
export class ContractLifecycleService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly relations: ContractRelationsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly billingSources: BillingSourceService,
    private readonly billing: BillingLifecycleService,
    private readonly chargeTerms: ChargeTermsRepository,
  ) {}

  /** 在固定锁顺序及单一事务中校验、固化快照并确认草稿。 */
  confirm(authContext: AuthContext, dto: ConfirmContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { now } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const found = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      const property = await this.policy.requireActivePropertyForUpdate(
        authContext.organizationId,
        found.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      this.policy.assertLifecycle(contract, "draft");
      const detail = await this.readRecord(
        authContext.organizationId,
        contract.id,
        now,
        transaction,
      );
      if (detail.billingMode === "monthly_settlement" && detail.spaces.length !== 1)
        throw this.policy.conflict("月度结算合同必须且只能关联一个空间");
      await this.policy.validateConfirmationScope(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          property,
          status: "confirmed",
          startDate: detail.startDate,
          endDate: detail.endDate,
          rentAmountMinor: detail.rentAmountMinor,
          billingAnchor: detail.billingAnchor,
          paymentIntervalMonths: detail.paymentIntervalMonths,
          dueDaysBefore: detail.dueDaysBefore,
          terminationDate: null,
          spaces: detail.spaces.map(({ spaceId, rentAllocationMinor }) => ({
            spaceId,
            ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
          })),
          parties: detail.parties.map(({ tenantId, isPrimaryPayer }) => ({
            tenantId,
            isPrimaryPayer,
          })),
          depositTerms: detail.depositTerms,
        },
        transaction,
      );
      await this.relations.confirmSnapshots(
        { organizationId: authContext.organizationId, contractId: contract.id },
        transaction,
      );
      await this.repository.setLifecycle(
        {
          organizationId: authContext.organizationId,
          id: contract.id,
          status: "confirmed",
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "confirmed", {}),
        transaction,
      );
      return toContractDetail(
        await this.readRecord(authContext.organizationId, contract.id, now, transaction),
      );
    });
  }

  /** 仅在组织本地开始日前取消已确认合同并保留原因。 */
  cancel(authContext: AuthContext, dto: CancelContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { now } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const found = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      await this.policy.requireOwnedPropertyForUpdate(
        authContext.organizationId,
        found.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      this.policy.assertCancellationAllowed(contract, now);
      const before = await this.billingSources.read(
        authContext.organizationId,
        contract.id,
        transaction,
      );
      const cancelledAt = new Date();
      const after = {
        ...before,
        contract: { ...before.contract, lifecycleStatus: "cancelled" as const },
        cancelledOn: organizationDate(cancelledAt, before.timezone),
      };
      await this.billing.onCancel(authContext, before, after, transaction);
      await this.repository.setLifecycle(
        {
          organizationId: authContext.organizationId,
          id: contract.id,
          status: "cancelled",
          updatedByUserId: authContext.userId,
          cancelledAt,
          cancelledByUserId: authContext.userId,
          cancellationReason: dto.reason,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "cancelled", {}),
        transaction,
      );
      return toContractDetail(
        await this.readRecord(authContext.organizationId, contract.id, now, transaction),
      );
    });
  }

  /** 在合同实际租期内登记提前终止，并裁剪承租方有效期。 */
  terminate(authContext: AuthContext, dto: TerminateContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { now } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const found = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      const property = await this.policy.requireOwnedPropertyForUpdate(
        authContext.organizationId,
        found.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      this.policy.assertLifecycle(contract, "confirmed");
      if (contract.terminationDate) throw this.policy.conflict("租赁合同终止信息不完整");
      if (
        !contract.startDate ||
        !contract.endDate ||
        normalizeContractTime(now, "start") < normalizeContractTime(contract.startDate, "start") ||
        compareCalendarDates(dto.terminationDate, contractCalendarDay(contract.startDate)) < 0 ||
        compareCalendarDates(dto.terminationDate, contractCalendarDay(contract.endDate)) >= 0
      ) {
        throw this.policy.conflict("终止日期必须位于合同租期内且早于原结束日期");
      }
      const current = await this.readRecord(
        authContext.organizationId,
        contract.id,
        now,
        transaction,
      );
      await this.lockContractRelations(
        authContext.organizationId,
        property,
        current,
        transaction,
        partyRefsAtDate(current, dto.terminationDate),
      );
      const source = await this.billingSources.read(
        authContext.organizationId,
        contract.id,
        transaction,
      );
      const terminationRecordedAt = new Date();
      await this.billing.onTerminate(authContext, source, dto, transaction, terminationRecordedAt);
      await this.relations.clipPartyPeriodsToActualEnd(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          actualEnd: dto.terminationDate,
        },
        transaction,
      );
      await this.repository.setLifecycle(
        {
          organizationId: authContext.organizationId,
          id: contract.id,
          status: "terminated",
          expectedStatus: "confirmed",
          terminationDate: dto.terminationDate,
          terminationRecordedAt,
          terminatedByUserId: authContext.userId,
          terminationReason: dto.reason,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "terminated", {
          terminationDate: dto.terminationDate,
        }),
        transaction,
      );
      return toContractDetail(
        await this.readRecord(authContext.organizationId, contract.id, now, transaction),
      );
    });
  }

  /** 仅撤销组织本地今天之后的未来终止，并复核恢复尾段冲突。 */
  revokeTermination(
    authContext: AuthContext,
    dto: RevokeContractTerminationDto,
  ): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { today, now } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const found = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      const property = await this.policy.requireOwnedPropertyForUpdate(
        authContext.organizationId,
        found.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      this.policy.assertLifecycle(contract, "terminated");
      if (
        !contract.terminationDate ||
        !contract.terminationRecordedAt ||
        !contract.terminatedByUserId ||
        !contract.terminationReason ||
        !contract.endDate ||
        compareCalendarDates(contract.terminationDate, today) <= 0
      ) {
        throw this.policy.conflict("仅可撤销未来终止的租赁合同");
      }
      const current = await this.readRecord(
        authContext.organizationId,
        contract.id,
        now,
        transaction,
      );
      await this.lockContractRelations(
        authContext.organizationId,
        property,
        current,
        transaction,
        terminalPartyRefs(current, contract.terminationDate),
      );
      const conflicts = await this.policy.checkSpaceAvailability(
        {
          organizationId: authContext.organizationId,
          property,
          spaceIds: current.spaces.map(({ spaceId }) => spaceId),
          startDate: `${addCalendarDays(contract.terminationDate, 1)}T00:00:00`,
          endDate: normalizeContractTime(contract.endDate, "end"),
          excludeContractId: contract.id,
        },
        transaction,
      );
      if (conflicts.length > 0) throw this.policy.conflict("恢复合同租期与现有空间合同冲突");
      await this.billing.onRevokeTermination(
        authContext,
        await this.billingSources.read(authContext.organizationId, contract.id, transaction),
        transaction,
      );
      await this.relations.restoreTerminalPartyPeriods(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          terminatedAt: contract.terminationDate,
          originalEnd: contractCalendarDay(contract.endDate),
        },
        transaction,
      );
      await this.repository.setLifecycle(
        {
          organizationId: authContext.organizationId,
          id: contract.id,
          status: "confirmed",
          expectedStatus: "terminated",
          terminationDate: null,
          terminationRecordedAt: null,
          terminatedByUserId: null,
          terminationReason: null,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.relations.appendTerminationRevocation(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          reason: dto.reason.trim(),
          terminationDateBeforeRevoke: contract.terminationDate,
          createdByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, contract.id, "termination_revoked", {
          terminationDate: contract.terminationDate,
        }),
        transaction,
      );
      return toContractDetail(
        await this.readRecord(authContext.organizationId, contract.id, now, transaction),
      );
    });
  }

  /** 以原合同实际结束日次日创建不携带财务状态的续租草稿。 */
  renew(authContext: AuthContext, dto: RenewContractDto): Promise<RentalContractDetail> {
    return this.transactions.run(async (transaction) => {
      const { today, now } = await this.policy.lockOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const source = this.policy.requireContract(
        await this.repository.find(authContext.organizationId, dto.id, transaction),
      );
      const property = await this.policy.requireOwnedPropertyForUpdate(
        authContext.organizationId,
        source.propertyId,
        transaction,
      );
      const contract = this.policy.requireContract(
        await this.repository.findForUpdate(authContext.organizationId, dto.id, transaction),
      );
      if (contract.status !== "confirmed" && contract.status !== "terminated")
        throw this.policy.conflict("仅可续租已确认或已终止合同");
      if (!contract.startDate || !contract.endDate) throw this.policy.conflict("合同缺少租期");
      const sourceEnd = actualContractEndTime(contract.endDate, contract.terminationDate);
      const sourceEndDay = contractCalendarDay(sourceEnd);
      const renewalInput = dto as RenewContractDto & {
        startDate?: string;
        endDate?: string;
        newStartDate?: string;
        newEndDate?: string;
      };
      const newStartDate = normalizeContractTime(
        renewalInput.newStartDate ??
          renewalInput.startDate ??
          `${addCalendarDays(sourceEndDay, 1)}T00:00:00`,
        "start",
      );
      const newEndDate = normalizeContractTime(
        renewalInput.newEndDate ??
          renewalInput.endDate ??
          `${addCalendarDays(sourceEndDay, 365)}T23:59:59`,
        "end",
      );
      if (
        compareCalendarDates(contractCalendarDay(newStartDate), sourceEndDay) <= 0 ||
        newStartDate > newEndDate
      )
        throw this.policy.conflict("续租日期必须从原合同实际结束日次日开始");
      const current = await this.readRecord(
        authContext.organizationId,
        contract.id,
        now,
        transaction,
      );
      await this.lockRenewalContractRelations(
        authContext.organizationId,
        property,
        current,
        transaction,
        terminalPartyRefs(current, sourceEndDay),
      );
      const conflicts = await this.policy.checkSpaceAvailability(
        {
          organizationId: authContext.organizationId,
          property,
          spaceIds: current.spaces.map(({ spaceId }) => spaceId),
          startDate: newStartDate,
          endDate: newEndDate,
        },
        transaction,
      );
      if (conflicts.length > 0) throw this.policy.conflict("续租日期与现有空间合同冲突");
      const contractNumber = await this.repository.nextContractNumber(
        authContext.organizationId,
        Number(today.slice(0, 4)),
        transaction,
      );
      const draft = await this.repository.createDraft(
        {
          organizationId: authContext.organizationId,
          billingMode: "monthly_settlement",
          propertyId: contract.propertyId,
          contractNumber,
          externalContractNumber: contract.externalContractNumber,
          startDate: newStartDate,
          endDate: newEndDate,
          rentAmountMinor: contract.rentAmountMinor,
          billingAnchor: contract.billingAnchor,
          paymentIntervalMonths: contract.paymentIntervalMonths,
          dueDaysBefore: contract.dueDaysBefore,
          renewedFromContractId: contract.id,
          note: contract.note,
          createdByUserId: authContext.userId,
          updatedByUserId: authContext.userId,
        },
        transaction,
      );
      const copiedTerms = await this.chargeTerms.find(
        { organizationId: authContext.organizationId, contractId: contract.id },
        transaction,
      );
      if (copiedTerms) {
        await this.chargeTerms.save(
          { organizationId: authContext.organizationId, contractId: draft.id },
          {
            waterCollectionEnabled: copiedTerms.waterCollectionEnabled,
            electricityCollectionEnabled: copiedTerms.electricityCollectionEnabled,
            waterUnitPrice: copiedTerms.waterUnitPrice,
            electricityUnitPrice: copiedTerms.electricityUnitPrice,
            fixedFees: copiedTerms.fixedFees,
          },
          "续租复制合同默认收费标准",
          { userId: authContext.userId },
          transaction,
        );
      }
      await this.relations.replaceDraftSpaces(
        {
          organizationId: authContext.organizationId,
          contractId: draft.id,
          propertyId: contract.propertyId,
          spaces: current.spaces.map(({ spaceId, rentAllocationMinor }) => ({
            spaceId,
            ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
          })),
        },
        transaction,
      );
      await this.relations.replaceDraftDeposits(
        {
          organizationId: authContext.organizationId,
          contractId: draft.id,
          deposits: current.depositTerms.map(
            ({ id: _id, finalAmountMinor: _final, ...term }) => term,
          ),
        },
        transaction,
      );
      await this.relations.copyTerminalPartySetToDraft(
        {
          organizationId: authContext.organizationId,
          contractId: contract.id,
          targetContractId: draft.id,
          validFrom: contractCalendarDay(newStartDate),
          validTo: contractCalendarDay(newEndDate),
        },
        transaction,
      );
      await this.auditService.appendRequired(
        contractAudit(authContext, draft.id, "renewed", { renewedFromContractId: contract.id }),
        transaction,
      );
      return toContractDetail(
        await this.readRecord(authContext.organizationId, draft.id, now, transaction),
      );
    });
  }

  private async lockContractRelations(
    organizationId: string,
    property: RentalPropertyRecord,
    current: RentalContractDetailRecord,
    transaction: AppDbExecutor,
    partyRefs = current.parties.map(({ tenantId, isPrimaryPayer }) => ({
      tenantId,
      isPrimaryPayer,
    })),
  ): Promise<void> {
    await this.policy.validateDraftRelations(
      {
        organizationId,
        property,
        status: "confirmed",
        startDate: current.startDate,
        endDate: current.endDate,
        rentAmountMinor: current.rentAmountMinor,
        billingAnchor: current.billingAnchor,
        paymentIntervalMonths: current.paymentIntervalMonths,
        dueDaysBefore: current.dueDaysBefore,
        parties: partyRefs,
        spaces: current.spaces.map(({ spaceId, rentAllocationMinor }) => ({
          spaceId,
          ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
        })),
        depositTerms: current.depositTerms.map(
          ({ id: _id, finalAmountMinor: _final, ...term }) => term,
        ),
      },
      transaction,
    );
  }

  private async lockRenewalContractRelations(
    organizationId: string,
    property: RentalPropertyRecord,
    current: RentalContractDetailRecord,
    transaction: AppDbExecutor,
    partyRefs: Array<{ tenantId: string; isPrimaryPayer: boolean }>,
  ): Promise<void> {
    await this.policy.validateRenewalRelations(
      {
        organizationId,
        property,
        status: "confirmed",
        startDate: current.startDate,
        endDate: current.endDate,
        rentAmountMinor: current.rentAmountMinor,
        billingAnchor: current.billingAnchor,
        paymentIntervalMonths: current.paymentIntervalMonths,
        dueDaysBefore: current.dueDaysBefore,
        parties: partyRefs,
        spaces: current.spaces.map(({ spaceId, rentAllocationMinor }) => ({
          spaceId,
          ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
        })),
        depositTerms: current.depositTerms.map(
          ({ id: _id, finalAmountMinor: _final, ...term }) => term,
        ),
      },
      transaction,
    );
  }

  private async readRecord(
    organizationId: string,
    id: string,
    now: string,
    executor: AppDbExecutor,
  ): Promise<RentalContractDetailRecord> {
    return this.policy.requireContract(
      await this.repository.detail(organizationId, id, now, executor),
    );
  }
}

function partyRefsAtDate(
  detail: RentalContractDetailRecord,
  date: string,
): Array<{ tenantId: string; isPrimaryPayer: boolean }> {
  return detail.parties
    .filter(
      (party) =>
        typeof party.validFrom === "string" &&
        typeof party.validTo === "string" &&
        compareCalendarDates(party.validFrom, date) <= 0 &&
        compareCalendarDates(date, party.validTo) <= 0,
    )
    .map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer }));
}

function terminalPartyRefs(
  detail: RentalContractDetailRecord,
  actualEnd: string,
): Array<{ tenantId: string; isPrimaryPayer: boolean }> {
  const terminal = detail.parties.filter(
    (party) => party.validTo === actualEnd && typeof party.validFrom === "string",
  );
  const latestFrom = terminal.reduce<string | null>(
    (latest, party) =>
      latest === null || compareCalendarDates(party.validFrom as string, latest) > 0
        ? party.validFrom
        : latest,
    null,
  );
  return terminal
    .filter((party) => party.validFrom === latestFrom)
    .map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer }));
}

/** 从创建 DTO 构建可进行草稿级校验的完整默认快照。 */
export function createContractAggregate(dto: CreateContractDto): MutableContractAggregate {
  return {
    propertyId: dto.propertyId,
    externalContractNumber: dto.externalContractNumber ?? null,
    startDate: dto.startDate ?? null,
    endDate: dto.endDate ?? null,
    rentAmountMinor: dto.rentAmountMinor ?? null,
    billingAnchor: dto.billingAnchor ?? null,
    paymentIntervalMonths: dto.paymentIntervalMonths ?? null,
    dueDaysBefore: dto.dueDaysBefore ?? null,
    parties: dto.parties ?? [],
    spaces: dto.spaces ?? [],
    depositTerms: toDepositReferences(dto.depositTerms ?? []),
    note: dto.note ?? null,
  };
}

/** 将局部更新与已锁定合同详情合并为完整可验证聚合。 */
export function mergeContractAggregate(
  current: RentalContractDetailRecord,
  dto: UpdateContractDto,
): MutableContractAggregate {
  return {
    propertyId: dto.propertyId ?? current.propertyId,
    externalContractNumber:
      dto.externalContractNumber === undefined
        ? current.externalContractNumber
        : dto.externalContractNumber,
    startDate: dto.startDate === undefined ? current.startDate : dto.startDate,
    endDate: dto.endDate === undefined ? current.endDate : dto.endDate,
    rentAmountMinor:
      dto.rentAmountMinor === undefined ? current.rentAmountMinor : dto.rentAmountMinor,
    billingAnchor: dto.billingAnchor === undefined ? current.billingAnchor : dto.billingAnchor,
    paymentIntervalMonths:
      dto.paymentIntervalMonths === undefined
        ? current.paymentIntervalMonths
        : dto.paymentIntervalMonths,
    dueDaysBefore: dto.dueDaysBefore === undefined ? current.dueDaysBefore : dto.dueDaysBefore,
    parties:
      dto.parties ??
      current.parties.map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer })),
    spaces:
      dto.spaces ??
      current.spaces.map(({ spaceId, rentAllocationMinor }) => ({
        spaceId,
        ...(rentAllocationMinor === null ? {} : { rentAllocationMinor }),
      })),
    depositTerms: dto.depositTerms
      ? toDepositReferences(dto.depositTerms)
      : current.depositTerms.map(({ id: _id, finalAmountMinor: _final, ...term }) => term),
    note: dto.note === undefined ? current.note : dto.note,
  };
}

function toDepositReferences(
  terms: NonNullable<CreateContractDto["depositTerms"]>,
): ContractDepositReference[] {
  return terms.map((term, index) => ({
    type: term.type,
    customName: term.customName ?? null,
    calculationMode: term.calculationMode,
    fixedAmountMinor: term.fixedAmountMinor ?? null,
    rentMultiple: term.rentMultiple ?? null,
    sortOrder: term.sortOrder ?? index,
  }));
}

/** 构建不携带敏感正文的合同必需审计输入。 */
export function contractAudit(
  authContext: AuthContext,
  targetId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  return {
    organizationId: authContext.organizationId,
    actorUserId: authContext.userId,
    action: `rental_contract.${action}`,
    targetType: "rental_contract",
    targetId,
    result: "succeeded" as const,
    metadata,
  };
}

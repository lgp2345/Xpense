import { ConflictException, Injectable } from "@nestjs/common";
import type { RentalMeterReadingInput, UpdateRentalMeterBaselineRequest } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbTransaction } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

const action = "meter_baseline.update";

export type RentalMeterBaselineDetail = {
  contractId: string;
  version: string;
  readings: RentalMeterReadingInput[];
};

function detail(snapshot: RentalFinanceSnapshot): RentalMeterBaselineDetail {
  return {
    contractId: snapshot.context.contractId,
    version: financeSourceVersion(snapshot, {}),
    readings: snapshot.readings
      .filter(({ predecessorId }) => predecessorId === null)
      .map(({ kind, readingDate, reading }) => ({ kind, readingDate, reading }))
      .sort((a, b) => a.kind.localeCompare(b.kind)),
  };
}

function baselineWasUsed(
  snapshot: RentalFinanceSnapshot,
  kinds: RentalMeterReadingInput["kind"][],
): boolean {
  const baselineIds = new Set(
    snapshot.readings
      .filter(({ predecessorId, kind }) => predecessorId === null && kinds.includes(kind))
      .map(({ id }) => id),
  );
  return snapshot.bills.some((bill) =>
    bill.lines.some((line) => {
      const fee = line.feeSnapshot;
      return (
        (fee?.kind === "water" || fee?.kind === "electricity") &&
        baselineIds.has(fee.startReadingId)
      );
    }),
  );
}

/** 入住底数按合同空间确认；被账单区间使用后必须走更正历史。 */
@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly readings: MeterReadingsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly bills: BillsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  detail(auth: AuthContext, dto: { contractId: string }): Promise<RentalMeterBaselineDetail> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_meters:read");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(
        { organizationId: auth.organizationId, contractId: dto.contractId },
        tx,
      );
      this.assertMonthlyMode(snapshot);
      return detail(snapshot);
    });
  }

  update(
    auth: AuthContext,
    dto: UpdateRentalMeterBaselineRequest,
  ): Promise<RentalMeterBaselineDetail> {
    this.access.assertPermission(auth, "rental_contracts:read");
    this.access.assertPermission(auth, "rental_meters:update");
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = { organizationId: auth.organizationId, contractId: dto.contractId };
      const requestHash = financeRequestHash(action, dto);
      const previous = await this.financeRequests.find(scope, dto.idempotencyKey, tx);
      if (previous) {
        if (!isFinanceRequestReplay(previous, { ...scope, action, requestHash }))
          throw this.conflict("请求标识已用于其他租赁财务操作或内容");
        await this.lockContract(auth, dto.contractId, tx);
        const replayed = await this.sources.read(scope, tx);
        this.assertMonthlyMode(replayed);
        return detail(replayed);
      }
      if (await this.bills.findGeneration(auth.organizationId, dto.idempotencyKey, tx))
        throw this.conflict("请求标识已用于其他租赁财务操作");

      await this.lockContract(auth, dto.contractId, tx);
      const snapshot = await this.sources.read(scope, tx);
      this.assertMonthlyContract(snapshot);
      if (snapshot.contract.spaces.length !== 1)
        throw this.conflict("月度结算合同必须且只能关联一个空间");
      if (financeSourceVersion(snapshot, {}) !== dto.expectedVersion)
        throw this.conflict("水电读数来源已变化，请重新读取后再保存");
      if (
        baselineWasUsed(
          snapshot,
          dto.readings.map(({ kind }) => kind),
        )
      )
        throw this.conflict("入住底数已用于账单，需通过读数更正处理");

      const spaceId = snapshot.contract.spaces[0]?.spaceId;
      if (!spaceId) throw this.conflict("合同缺少唯一结算空间");
      const writes = dto.readings.map((reading) => ({
        ...reading,
        spaceId,
        predecessorId: null,
      }));
      await this.readings.saveBaseline(scope, writes, dto.reason, { userId: auth.userId }, tx);
      await this.audit.appendRequired(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "rental_meter_baseline.updated",
          targetType: "rental_contract",
          targetId: dto.contractId,
          result: "succeeded",
          metadata: { reason: dto.reason, readingKinds: writes.map(({ kind }) => kind).sort() },
        },
        tx,
      );
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: dto.idempotencyKey,
          action,
          requestHash,
          result: { resourceId: dto.contractId, resourceKind: "baseline" },
        },
        { userId: auth.userId },
        tx,
      );
      const changed = await this.sources.read(scope, tx);
      return detail(changed);
    });
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

  private assertMonthlyContract(snapshot: RentalFinanceSnapshot) {
    this.assertMonthlyMode(snapshot);
    if (snapshot.contract.lifecycleStatus !== "confirmed")
      throw this.conflict("只有履行中的合同可以登记入住底数");
  }

  private assertMonthlyMode(snapshot: RentalFinanceSnapshot) {
    if (snapshot.contract.billingMode !== "monthly_settlement")
      throw this.conflict("存量合同仍使用旧账单模式");
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }
}

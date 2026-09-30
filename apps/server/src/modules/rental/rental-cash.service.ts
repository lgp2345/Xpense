import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConfirmRentalDepositReceiptRequest,
  ConfirmRentalRefundRequest,
  RecordRentalReceiptRequest,
  RentalCashEntry,
  RentalCashTarget,
  RevokeRentalCashRequest,
} from "@xpense/shared";

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
import { RentalCashRepository } from "./rental-cash.repository.js";
import type { RentalCashWriteInput } from "./rental-cash.repository.types.js";
import { calculateRentalCashBalance, toRentalCashEntry } from "./rental-cash.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";
import type { FinanceScope, RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash, isFinanceRequestReplay } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

type CashRequest = {
  idempotencyKey: string;
  expectedVersion: string;
};

type TargetWrite = (
  scope: FinanceScope,
  source: RentalFinanceSnapshot,
  executor: AppDbTransaction,
) => Promise<RentalCashWriteInput>;

type ResolvedTarget =
  | {
      kind: "bill";
      bill: RentalFinanceSnapshot["bills"][number];
      amountMinor: number;
      dueDate: string;
    }
  | { kind: "settlement"; amountMinor: number; dueDate: null };

/** 按合同锁顺序原子登记收退款，并从可撤销事实派生结算余额。 */
@Injectable()
export class RentalCashService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly projectionSources: RentalCashProjectionRepository,
    private readonly cash: RentalCashRepository,
    private readonly bills: BillsRepository,
    private readonly settlements: RentalSettlementsRepository,
    private readonly financeRequests: FinanceRequestsRepository,
    private readonly contracts: ContractsRepository,
    private readonly policy: ContractsPolicyService,
    private readonly projection: SettlementProjectionService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  recordReceipt(auth: AuthContext, request: RecordRentalReceiptRequest): Promise<RentalCashEntry> {
    return this.writeForTarget(
      auth,
      request.target,
      request,
      "rental_receipts:create",
      "rental_cash.receipt",
      async (_scope, source) => {
        const target = this.requireWriteTarget(source, request.target);
        if (request.target.kind === "bill") {
          if (source.settlement) throw this.conflict("结算确认后请使用结算目标登记新收款");
          if (target.kind !== "bill") throw this.notFound();
          if (target.bill.type !== "monthly") throw this.conflict("押金请使用整额押金收款确认");
          this.assertActiveV2Bill(target.bill);
        }
        assertPositiveMinor(request.amountMinor, "收款金额");
        const balance = balanceFor(source, request.target, target.amountMinor, target.dueDate);
        if (balance.outstandingMinor === 0) throw this.badRequest("当前目标没有待收金额");
        if (request.amountMinor > balance.outstandingMinor)
          throw this.badRequest("收款金额不能超过当前待收金额");
        return {
          target: request.target,
          kind: "receipt",
          purpose: request.target.kind === "settlement" ? "settlement_receipt" : "bill_receipt",
          amountMinor: request.amountMinor,
          occurredOn: request.occurredOn,
          note: request.note ?? null,
        };
      },
    );
  }

  confirmDepositReceipt(
    auth: AuthContext,
    request: ConfirmRentalDepositReceiptRequest,
  ): Promise<RentalCashEntry> {
    const target = { kind: "bill", billId: request.billId } as const;
    return this.writeForTarget(
      auth,
      target,
      request,
      "rental_receipts:create",
      "rental_cash.deposit_receipt",
      async (_scope, source) => {
        const current = this.requireWriteTarget(source, target);
        if (source.settlement) throw this.conflict("结算确认后请使用结算目标登记新收款");
        if (current.kind !== "bill") throw this.conflict("目标不是押金账单");
        if (current.bill.type !== "deposit") throw this.conflict("目标不是押金账单");
        this.assertActiveV2Bill(current.bill);
        assertPositiveMinor(current.bill.amountMinor, "押金金额");
        const alreadyReceived = source.cashEntries.some(
          (entry) =>
            entry.target.kind === "bill" &&
            entry.target.billId === request.billId &&
            entry.kind === "receipt" &&
            entry.purpose === "deposit_receipt" &&
            entry.revokedAt === null,
        );
        if (alreadyReceived) throw this.badRequest("该押金已登记收款，退款不会重新启用全额收款");
        return {
          target,
          kind: "receipt",
          purpose: "deposit_receipt",
          amountMinor: current.bill.amountMinor,
          occurredOn: request.occurredOn,
          note: request.note ?? null,
        };
      },
    );
  }

  confirmRefund(auth: AuthContext, request: ConfirmRentalRefundRequest): Promise<RentalCashEntry> {
    return this.writeForTarget(
      auth,
      request.target,
      request,
      "rental_refunds:create",
      "rental_cash.refund",
      async (_scope, source) => {
        const current = this.requireWriteTarget(source, request.target);
        if (request.target.kind === "bill") {
          if (source.settlement) throw this.conflict("结算确认后请使用结算目标登记退款");
          if (current.kind !== "bill") throw this.notFound();
          this.assertActiveV2Bill(current.bill);
        }
        const balance = balanceFor(source, request.target, current.amountMinor, current.dueDate);
        if (balance.refundableMinor <= 0) throw this.badRequest("当前目标没有待退金额");
        return {
          target: request.target,
          kind: "refund",
          purpose: "refund",
          amountMinor: balance.refundableMinor,
          occurredOn: request.occurredOn,
          note: request.note ?? null,
        };
      },
    );
  }

  revokeReceipt(auth: AuthContext, request: RevokeRentalCashRequest): Promise<RentalCashEntry> {
    return this.revoke(
      auth,
      request,
      "receipt",
      "rental_receipts:revoke",
      "rental_cash.receipt_revoke",
    );
  }

  revokeRefund(auth: AuthContext, request: RevokeRentalCashRequest): Promise<RentalCashEntry> {
    return this.revoke(
      auth,
      request,
      "refund",
      "rental_refunds:revoke",
      "rental_cash.refund_revoke",
    );
  }

  list(
    auth: AuthContext,
    request: { target: RentalCashTarget; page: number; pageSize: number },
  ): Promise<{ items: RentalCashEntry[]; total: number; page: number; pageSize: number }> {
    this.access.assertPermission(
      auth,
      request.target.kind === "bill" ? "rental_bills:read" : "rental_settlements:read",
    );
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = await this.lockTargetContract(auth.organizationId, request.target, tx);
      const source = await this.sources.read(scope, tx);
      this.assertSnapshotScope(scope, source);
      this.requireWriteTarget(source, request.target);
      const page = await this.cash.list(scope, request.target, request, tx);
      return { ...page, items: page.items.map(toRentalCashEntry) };
    });
  }

  private async writeForTarget(
    auth: AuthContext,
    target: RentalCashTarget,
    request: CashRequest & { note?: string },
    permission: "rental_receipts:create" | "rental_refunds:create",
    action: string,
    build: TargetWrite,
  ): Promise<RentalCashEntry> {
    this.access.assertPermission(auth, permission);
    this.assertTargetReadPermission(auth, target);
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const scope = await this.lockTargetContract(auth.organizationId, target, tx);
      const source = await this.sources.read(scope, tx);
      this.assertSnapshotScope(scope, source);
      const resolvedTarget = this.requireWriteTarget(source, target);
      const replay = await this.findReplay(scope, source, action, request, tx);
      if (replay) return replay;
      const facts = await this.readFacts(scope, tx);
      this.assertCurrentVersion(facts, target, request.expectedVersion);
      const input = await build(scope, source, tx);
      this.assertTargetBalanceAfterWrite(source, target, resolvedTarget, input);
      const record = await this.cash.insert(scope, input, { userId: auth.userId }, tx);
      await this.refreshSettlement(scope, auth.userId, source, tx);
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: request.idempotencyKey,
          action,
          requestHash: financeRequestHash(action, request),
          result: { resourceId: record.id, resourceKind: "cash" },
        },
        { userId: auth.userId },
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: scope.organizationId,
          actorUserId: auth.userId,
          action:
            input.kind === "receipt" ? "rental_cash.receipt_created" : "rental_cash.refund_created",
          targetType: "rental_cash_entry",
          targetId: record.id,
          result: "succeeded",
          metadata: {
            contractId: scope.contractId,
            target: input.target,
            amountMinor: input.amountMinor,
          },
        },
        tx,
      );
      return toRentalCashEntry(record);
    });
  }

  private async revoke(
    auth: AuthContext,
    request: RevokeRentalCashRequest,
    kind: "receipt" | "refund",
    permission: "rental_receipts:revoke" | "rental_refunds:revoke",
    action: string,
  ): Promise<RentalCashEntry> {
    this.access.assertPermission(auth, permission);
    return this.transactions.run(async (tx) => {
      await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const contractId = await this.cash.findContractIdByEntryId(
        auth.organizationId,
        request.entryId,
        tx,
      );
      if (!contractId) throw this.notFound();
      const scope = await this.lockContract(auth.organizationId, contractId, tx);
      const source = await this.sources.read(scope, tx);
      this.assertSnapshotScope(scope, source);
      const entry = source.cashEntries.find((item) => item.id === request.entryId);
      if (!entry) throw this.notFound();
      this.assertTargetReadPermission(auth, entry.target);
      const replay = await this.findReplay(scope, source, action, request, tx);
      if (replay) return replay;
      const facts = await this.readFacts(scope, tx);
      this.assertCurrentVersion(facts, entry.target, request.expectedVersion);
      if (entry.kind !== kind) throw this.conflict("收退款记录类型与撤销入口不匹配");
      if (entry.revokedAt !== null) throw this.conflict("该收退款记录已撤销");
      this.assertTargetBalanceAfterRevoke(source, entry);
      const record = await this.cash.revoke(
        scope,
        request.entryId,
        request.reason,
        { userId: auth.userId },
        tx,
      );
      await this.refreshSettlement(scope, auth.userId, source, tx);
      await this.financeRequests.complete(
        scope,
        {
          idempotencyKey: request.idempotencyKey,
          action,
          requestHash: financeRequestHash(action, request),
          result: { resourceId: record.id, resourceKind: "cash" },
        },
        { userId: auth.userId },
        tx,
      );
      await this.audit.appendRequired(
        {
          organizationId: scope.organizationId,
          actorUserId: auth.userId,
          action: kind === "receipt" ? "rental_cash.receipt_revoked" : "rental_cash.refund_revoked",
          targetType: "rental_cash_entry",
          targetId: record.id,
          result: "succeeded",
          metadata: {
            contractId: scope.contractId,
            amountMinor: record.amountMinor,
            reason: request.reason,
          },
        },
        tx,
      );
      return toRentalCashEntry(record);
    });
  }

  private async findReplay(
    scope: FinanceScope,
    source: RentalFinanceSnapshot,
    action: string,
    request: CashRequest,
    executor: AppDbTransaction,
  ): Promise<RentalCashEntry | null> {
    const expected = {
      organizationId: scope.organizationId,
      contractId: scope.contractId,
      action,
      requestHash: financeRequestHash(action, request),
    };
    const existing = await this.financeRequests.find(scope, request.idempotencyKey, executor);
    if (existing) {
      if (!isFinanceRequestReplay(existing, expected) || existing.result.resourceKind !== "cash")
        throw this.conflict("请求标识已用于其他租赁财务操作或内容");
      const entry = source.cashEntries.find((item) => item.id === existing.result.resourceId);
      if (!entry || entry.contractId !== scope.contractId) throw this.notFound();
      return entry;
    }
    const generation = await this.bills.findGeneration(
      scope.organizationId,
      request.idempotencyKey,
      executor,
    );
    if (generation) throw this.conflict("请求标识已用于账单生成");
    return null;
  }

  private async lockTargetContract(
    organizationId: string,
    target: RentalCashTarget,
    executor: AppDbTransaction,
  ): Promise<FinanceScope> {
    const contractId =
      target.kind === "bill"
        ? (await this.bills.detail(organizationId, target.billId, executor))?.contractId
        : await this.settlements.findContractId(organizationId, target.settlementId, executor);
    if (!contractId) throw this.notFound();
    return this.lockContract(organizationId, contractId, executor);
  }

  private async lockContract(
    organizationId: string,
    contractId: string,
    executor: AppDbTransaction,
  ): Promise<FinanceScope> {
    const found = this.policy.requireContract(
      await this.contracts.find(organizationId, contractId, executor),
    );
    await this.policy.requireOwnedPropertyForUpdate(organizationId, found.propertyId, executor);
    const locked = this.policy.requireContract(
      await this.contracts.findForUpdate(organizationId, contractId, executor),
    );
    if (locked.id !== contractId) throw this.notFound();
    return { organizationId, contractId };
  }

  private async readFacts(
    scope: FinanceScope,
    executor: AppDbTransaction,
  ): Promise<RentalCashProjectionFacts> {
    const [facts] = await this.projectionSources.readMany(
      scope.organizationId,
      [scope.contractId],
      executor,
    );
    if (
      !facts ||
      facts.contractId !== scope.contractId ||
      facts.organizationId !== scope.organizationId
    )
      throw this.notFound();
    return facts;
  }

  private assertCurrentVersion(
    facts: RentalCashProjectionFacts,
    target: RentalCashTarget,
    expectedVersion: string,
  ) {
    const current = rentalCashSourceVersion(facts, target);
    if (current !== expectedVersion) throw this.conflict("资金余额已变化，请刷新后重试");
  }

  private assertTargetBalanceAfterWrite(
    source: RentalFinanceSnapshot,
    target: RentalCashTarget,
    resolvedTarget: ResolvedTarget,
    input: RentalCashWriteInput,
  ) {
    balanceFor(source, target, resolvedTarget.amountMinor, resolvedTarget.dueDate, [
      ...source.cashEntries,
      {
        target: input.target,
        kind: input.kind,
        amountMinor: input.amountMinor,
        revokedAt: null,
      },
    ]);
  }

  private assertTargetBalanceAfterRevoke(
    source: RentalFinanceSnapshot,
    entry: RentalFinanceSnapshot["cashEntries"][number],
  ) {
    const resolvedTarget = this.requireWriteTarget(source, entry.target);
    const cashEntries = source.cashEntries.map((current) =>
      current.id === entry.id ? { ...current, revokedAt: new Date().toISOString() } : current,
    );
    balanceFor(
      source,
      entry.target,
      resolvedTarget.amountMinor,
      resolvedTarget.dueDate,
      cashEntries,
    );
  }

  private assertTargetReadPermission(auth: AuthContext, target: RentalCashTarget) {
    this.access.assertPermission(
      auth,
      target.kind === "bill" ? "rental_bills:read" : "rental_settlements:read",
    );
  }

  private requireWriteTarget(
    source: RentalFinanceSnapshot,
    target: RentalCashTarget,
  ): ResolvedTarget {
    if (target.kind === "bill") {
      const bill = source.bills.find((item) => item.id === target.billId);
      if (!bill) throw this.notFound();
      return { kind: "bill", bill, amountMinor: bill.amountMinor, dueDate: bill.dueDate };
    }
    if (!source.settlement || source.settlement.id !== target.settlementId) throw this.notFound();
    return { kind: "settlement", amountMinor: source.settlement.finalCostMinor, dueDate: null };
  }

  private assertActiveV2Bill(bill: RentalFinanceSnapshot["bills"][number]) {
    if (bill.status !== "active" || bill.modelVersion !== 2)
      throw this.conflict("仅可对有效的新版账单登记收退款");
  }

  private async refreshSettlement(
    scope: FinanceScope,
    actor: string,
    source: RentalFinanceSnapshot,
    executor: AppDbTransaction,
  ) {
    if (source.settlement) await this.projection.refresh(scope, actor, executor);
  }

  private assertSnapshotScope(scope: FinanceScope, source: RentalFinanceSnapshot) {
    if (
      source.context.organizationId !== scope.organizationId ||
      source.context.contractId !== scope.contractId
    )
      throw this.notFound();
  }

  private conflict(message: string) {
    return new ConflictException({ code: apiErrorCodes.conflict, message });
  }

  private badRequest(message: string) {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }

  private notFound() {
    return new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁资金目标不存在" });
  }
}

function balanceFor(
  source: RentalFinanceSnapshot,
  target: RentalCashTarget,
  amountMinor: number,
  dueDate: string | null,
  entries: Parameters<typeof calculateRentalCashBalance>[0] = source.cashEntries,
) {
  try {
    return calculateRentalCashBalance(entries, target, amountMinor, dueDate, source.context.today);
  } catch (error) {
    if (error instanceof RangeError)
      throw new BadRequestException({
        code: apiErrorCodes.validationFailed,
        message: error.message,
      });
    throw error;
  }
}

function assertPositiveMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new BadRequestException({
      code: apiErrorCodes.validationFailed,
      message: `${label}必须为正安全整数`,
    });
}

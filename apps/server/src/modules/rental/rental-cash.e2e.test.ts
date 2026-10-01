import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { testIds } from "../../test/auth-test-helpers.js";
import { bookkeepingRepositoryTokens } from "../../test/bookkeeping-test-harness.js";
import { cloneBookkeepingTestState } from "../../test/bookkeeping-test-state.js";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState } from "../../test/rental-test-state.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

type MonthlyBill = { id: string; amountMinor: number; type: string; modelVersion: number };
type BillRead = {
  id: string;
  amountMinor: number;
  financial: {
    receivedMinor: number;
    outstandingMinor: number;
    version: string;
  };
};

describe("租赁收退款 HTTP", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;

  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
  });

  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it("用账单详情版本连续收款，按目标权限列历史且不写记账流水", async () => {
    const bill = await createMonthlyBill();
    const firstRead = await getBill(bill.id);
    const receiptAmount = Math.max(
      1,
      Math.min(100_000, Math.floor(firstRead.financial.outstandingMinor / 3)),
    );
    const originalBookkeeping = cloneBookkeepingTestState(harness.state.bookkeeping);
    const unauthenticatedList = await harness.request(
      `/rental-cash/list?kind=bill&billId=${bill.id}`,
      undefined,
      {},
      "GET",
    );
    expect(unauthenticatedList.statusCode).toBe(401);
    const invalidReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: receiptAmount,
      occurredOn: "2026-08-31",
      expectedVersion: firstRead.financial.version,
      idempotencyKey: randomUUID(),
      unsupported: true,
    });
    expect(invalidReceipt.statusCode).toBe(400);
    expect(JSON.parse(invalidReceipt.payload).code).toBe("VALIDATION_FAILED");
    const managerCash = await harness.request(
      `/rental-cash/list?kind=bill&billId=${bill.id}`,
      undefined,
      harness.memberHeaders,
    );
    expect(managerCash.statusCode).toBe(200);
    expect(harness.parse<{ items: unknown[] }>(managerCash).items).toHaveLength(0);

    const settlementDenied = await harness.request(
      `/rental-cash/list?kind=settlement&settlementId=${randomUUID()}`,
      undefined,
      harness.memberHeaders,
    );
    expect(settlementDenied.statusCode).toBe(403);
    const ownerSettlementMissing = await harness.request(
      `/rental-cash/list?kind=settlement&settlementId=${randomUUID()}`,
    );
    expect(ownerSettlementMissing.statusCode).toBe(404);

    const accountWrites = harness.app.get(bookkeepingRepositoryTokens.AccountsRepository) as {
      writeOpeningBalance: (...args: unknown[]) => unknown;
    };
    const transactionWrites = harness.app.get(
      bookkeepingRepositoryTokens.TransactionsRepository,
    ) as {
      create: (...args: unknown[]) => unknown;
      update: (...args: unknown[]) => unknown;
    };
    const writeOpeningBalance = vi.spyOn(accountWrites, "writeOpeningBalance");
    const createTransaction = vi.spyOn(transactionWrites, "create");
    const updateTransaction = vi.spyOn(transactionWrites, "update");

    const first = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: receiptAmount,
      occurredOn: "2026-08-31",
      expectedVersion: firstRead.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(first.statusCode, first.payload).toBe(200);
    const afterFirst = await getBill(bill.id);
    expect(afterFirst.financial).toMatchObject({ receivedMinor: receiptAmount });
    expect(afterFirst.financial.version).not.toBe(firstRead.financial.version);

    const second = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: receiptAmount,
      occurredOn: "2026-08-31",
      expectedVersion: afterFirst.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(second.statusCode).toBe(200);
    const afterSecond = await getBill(bill.id);
    expect(afterSecond.financial).toMatchObject({
      receivedMinor: receiptAmount * 2,
      outstandingMinor: bill.amountMinor - receiptAmount * 2,
    });

    const stale = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: 1,
      occurredOn: "2026-08-31",
      expectedVersion: firstRead.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(stale.statusCode).toBe(409);
    const cashHistory = await harness.request(
      `/rental-cash/list?kind=bill&billId=${bill.id}&page=1&pageSize=20`,
    );
    const history = harness.parse<{ total: number; items: Array<{ amountMinor: number }> }>(
      cashHistory,
    );
    expect(history.total).toBe(2);
    expect(history.items.map(({ amountMinor }) => amountMinor)).toEqual([
      receiptAmount,
      receiptAmount,
    ]);
    expect(writeOpeningBalance).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(harness.state.bookkeeping).toEqual(originalBookkeeping);
  });

  it("来源取消并归零后仍可按原账单 ID 退还已收现金", async () => {
    const bill = await createMonthlyBill();
    let detail = await getBill(bill.id);
    const receipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: detail.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(receipt.statusCode, receipt.payload).toBe(200);
    detail = await getBill(bill.id);

    const stored = harness.state.rental.bills.find(({ id }) => id === bill.id);
    if (!stored) throw new Error("Generated original obligation was not retained");
    Object.assign(stored, { status: "voided", amountMinor: 0, lines: [] });
    detail = await getBill(bill.id);

    const refund = await harness.request("/rental-refunds/create", {
      target: { kind: "bill", billId: bill.id },
      occurredOn: "2026-08-31",
      expectedVersion: detail.financial.version,
      idempotencyKey: randomUUID(),
    });

    expect(refund.statusCode, refund.payload).toBe(200);
    expect(
      harness.parse<{ target: { kind: string; billId: string }; amountMinor: number }>(refund),
    ).toMatchObject({
      target: { kind: "bill", billId: bill.id },
      amountMinor: 1_000,
    });
    expect((await getBill(bill.id)).financial).toMatchObject({
      receivedMinor: 1_000,
      refundedMinor: 1_000,
      refundableMinor: 0,
    });
  });

  it("结算关联账单的收款刷新投影，审计失败回滚现金、结算修订、幂等和审计", async () => {
    const bill = await createMonthlyBill();
    const state = harness.state.rental;
    const settlementId = randomUUID();
    const now = new Date("2026-08-31T12:00:00.000Z");
    state.settlements.push({
      id: settlementId,
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
      eventId: randomUUID(),
      kind: "termination",
      effectiveEndDate: "2026-08-31",
      version: "seed-version",
      revision: 1,
      finalCostMinor: bill.amountMinor,
      status: "pending_collection",
      snapshot: {
        effectiveEndDate: "2026-08-31",
        finalBills: [
          {
            billId: bill.id,
            billingMonth: "2026-08",
            lines: [],
            amountMinor: bill.amountMinor,
          },
        ],
        finalCostMinor: bill.amountMinor,
        differenceMinor: bill.amountMinor,
      },
      confirmedAt: now,
      confirmedByUserId: testIds.ownerUser,
      updatedAt: now,
    } as never);
    state.settlementBills.push({
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
      settlementId,
      billId: bill.id,
      createdAt: now,
    } as never);

    const target = { kind: "settlement", settlementId } as const;
    const scope = {
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
    };
    const projection = harness.app.get(SettlementProjectionService);
    const transactions = harness.app.get(DatabaseTransactionService);
    const initialProjection = await transactions.run((tx) =>
      projection.refresh(scope, testIds.ownerUser, tx),
    );
    if (!initialProjection) throw new Error("Initial settlement projection missing");

    const projectionRepo = harness.app.get(RentalCashProjectionRepository);
    const readState = cloneRentalTestState(state);
    const readFacts = await projectionRepo.readMany(
      testIds.organization,
      [harness.financeContractId],
      {} as never,
    );
    const repeatedReadFacts = await projectionRepo.readMany(
      testIds.organization,
      [harness.financeContractId],
      {} as never,
    );
    expect(repeatedReadFacts).toEqual(readFacts);
    expect(state).toEqual(readState);

    const projectionResults: Array<Awaited<ReturnType<typeof projection.refresh>>> = [];
    const refresh = projection.refresh.bind(projection);
    vi.spyOn(projection, "refresh").mockImplementation(async (refreshScope, actor, tx) => {
      const result = await refresh(refreshScope, actor, tx);
      projectionResults.push(result);
      return result;
    });
    const first = await harness.request("/rental-receipts/create", {
      target,
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: initialProjection.version,
      idempotencyKey: randomUUID(),
    });
    expect(first.statusCode).toBe(200);
    const afterFirstProjection = projectionResults.at(-1);
    if (!afterFirstProjection)
      throw new Error("Cash write did not return its refreshed projection");
    expect(state.settlementBills.map(({ billId }) => billId)).toEqual([bill.id]);
    expect(state.settlements[0]).toMatchObject({
      finalCostMinor: bill.amountMinor,
      revision: afterFirstProjection.revision,
      snapshot: { finalBills: [{ billId: bill.id, amountMinor: bill.amountMinor }] },
    });

    const second = await harness.request("/rental-receipts/create", {
      target,
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: afterFirstProjection.version,
      idempotencyKey: randomUUID(),
    });
    expect(second.statusCode, second.payload).toBe(200);
    const afterSecondProjection = projectionResults.at(-1);
    if (!afterSecondProjection) throw new Error("Second cash write projection missing");
    expect(state.settlements[0]?.revision).toBe(afterSecondProjection.revision);
    expect(state.cashEntries).toHaveLength(2);

    const beforeRental = cloneRentalTestState(state);
    const beforeAudit = structuredClone(harness.state.auditLogs);
    harness.state.failNextRequiredAuditAppendAfterPersist = true;
    const revise = vi.spyOn(harness.app.get(RentalSettlementsRepository), "revise");
    const complete = vi.spyOn(harness.app.get(FinanceRequestsRepository), "complete");

    const failed = await harness.request("/rental-receipts/create", {
      target,
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: afterSecondProjection.version,
      idempotencyKey: randomUUID(),
    });

    expect(failed.statusCode).toBe(500);
    expect(revise).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(state).toEqual(beforeRental);
    expect(state.cashEntries).toEqual(beforeRental.cashEntries);
    expect(state.settlements).toEqual(beforeRental.settlements);
    expect(state.settlementRevisions).toEqual(beforeRental.settlementRevisions);
    expect(state.settlementBills).toEqual(beforeRental.settlementBills);
    expect(state.financeRequests).toEqual(beforeRental.financeRequests);
    expect(state.auditEntries).toEqual(beforeRental.auditEntries);
    expect(harness.state.auditLogs).toEqual(beforeAudit);
  });

  async function createMonthlyBill(): Promise<MonthlyBill> {
    const request = {
      contractId: harness.financeContractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
    };
    const preview = await harness.request("/rental-monthly-bills/preview", request);
    expect(preview.statusCode).toBe(200);
    const generated = await harness.request("/rental-monthly-bills/generate", {
      ...request,
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    });
    expect(generated.statusCode).toBe(200);
    return harness.parse<MonthlyBill>(generated);
  }

  async function getBill(id: string): Promise<BillRead> {
    const response = await harness.request(`/rental-bills/detail?id=${id}`);
    expect(response.statusCode).toBe(200);
    return harness.parse<BillRead>(response);
  }
});

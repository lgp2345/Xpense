import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { testIds } from "../../test/auth-test-helpers.js";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

type MonthlyBill = { id: string; amountMinor: number; lines: Array<{ kind: string }> };

describe("月度账单更正 HTTP", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;

  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
  });

  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it("校验原因、权限与组织边界，并联动共享读数、相邻账单和历史快照", async () => {
    const ownerRole = [...harness.state.roles.values()].find(({ key }) => key === "owner");
    if (!ownerRole) throw new Error("Rental finance test owner role unavailable");
    ownerRole.permissions.push("rental_monthly_bills:adjust");
    const contractId = harness.financeContractId;
    const createBill = async (billingMonth: string, readingDate: string, water: string) => {
      const input = {
        contractId,
        billingMonth,
        dueDate: readingDate,
        readings: [
          { kind: "water", readingDate, reading: water },
          { kind: "electricity", readingDate, reading: "60" },
        ],
        extraFees: [],
      };
      const preview = await harness.request("/rental-monthly-bills/preview", input);
      expect(preview.statusCode, preview.payload).toBe(200);
      const generated = await harness.request("/rental-monthly-bills/generate", {
        ...input,
        expectedVersion: harness.parse<{ version: string }>(preview).version,
        idempotencyKey: randomUUID(),
      });
      expect(generated.statusCode, generated.payload).toBe(200);
      return harness.parse<MonthlyBill>(generated);
    };
    const firstBill = await createBill("2026-08", "2026-08-31", "110");
    const secondBill = await createBill("2026-09", "2026-09-30", "120");
    const firstStoredBill = harness.state.rental.bills.find(({ id }) => id === firstBill.id);
    if (!firstStoredBill) throw new Error("Rental monthly bill test fixture unavailable");
    const foreignBillId = randomUUID();
    harness.state.rental.bills.push({
      ...structuredClone(firstStoredBill),
      id: foreignBillId,
      contractId: rentalTestIds.foreignContract,
      organizationId: testIds.otherOrganization,
    });

    const firstDetail = await harness.request(`/rental-bills/detail?id=${firstBill.id}`);
    expect(firstDetail.statusCode, firstDetail.payload).toBe(200);
    const billRead = harness.parse<{
      financial: { version: string; outstandingMinor: number };
    }>(firstDetail);
    const receipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: firstBill.id },
      amountMinor: 100,
      occurredOn: "2026-08-31",
      expectedVersion: billRead.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(receipt.statusCode, receipt.payload).toBe(200);
    const originalBills = structuredClone(harness.state.rental.bills);
    const originalCashIds = harness.state.rental.cashEntries.map(({ id }) => id);

    const missingReason = await harness.request("/rental-monthly-bills/adjust-preview", {
      billId: firstBill.id,
      expectedVersion: "preview-seed",
      readings: [{ kind: "water", readingDate: "2026-08-31", reading: "115" }],
    });
    expect(missingReason.statusCode).toBe(400);
    expect(harness.state.rental.billRevisions).toHaveLength(0);

    const unauthenticated = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      {
        billId: firstBill.id,
        expectedVersion: "preview-seed",
        reason: "更正公共水表读数",
      },
      {},
    );
    expect(unauthenticated.statusCode).toBe(401);

    const denied = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      {
        billId: firstBill.id,
        expectedVersion: "preview-seed",
        reason: "更正公共水表读数",
      },
      harness.memberHeaders,
    );
    expect(denied.statusCode).toBe(403);

    const foreign = await harness.request("/rental-monthly-bills/adjust-preview", {
      billId: foreignBillId,
      expectedVersion: "preview-seed",
      reason: "组织边界验证",
    });
    expect(foreign.statusCode).toBe(404);

    const revisionInput = {
      billId: firstBill.id,
      expectedVersion: "preview-seed",
      readings: [{ kind: "water", readingDate: "2026-08-31", reading: "115" }],
      reason: "更正公共水表读数",
    };
    const previewResponse = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      revisionInput,
    );
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<{
      version: string;
      affectedBills: Array<{ billId: string; beforeAmountMinor: number; afterAmountMinor: number }>;
    }>(previewResponse);
    expect(preview.affectedBills.map(({ billId }) => billId)).toEqual([
      firstBill.id,
      secondBill.id,
    ]);
    expect(
      preview.affectedBills.map(
        ({ beforeAmountMinor, afterAmountMinor }) => afterAmountMinor - beforeAmountMinor,
      ),
    ).toEqual([1_500, -1_500]);

    const adjusted = await harness.request("/rental-monthly-bills/adjust", {
      ...revisionInput,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(adjusted.statusCode, adjusted.payload).toBe(200);
    const adjustedPreview = harness.parse<typeof preview>(adjusted);
    expect(adjustedPreview).toEqual(preview);
    expect(harness.state.rental.bills.map(({ id }) => id)).toEqual(
      originalBills.map(({ id }) => id),
    );
    expect(harness.state.rental.bills.map(({ amountMinor }) => amountMinor)).toEqual(
      originalBills.map(
        (bill) =>
          preview.affectedBills.find(({ billId }) => billId === bill.id)?.afterAmountMinor ??
          bill.amountMinor,
      ),
    );
    expect(harness.state.rental.cashEntries.map(({ id }) => id)).toEqual(originalCashIds);
    expect(harness.state.rental.meterReadingRevisions).toHaveLength(1);
    expect(harness.state.rental.billRevisions.map(({ billId }) => billId)).toEqual([
      firstBill.id,
      secondBill.id,
    ]);

    const adjustedDetail = await harness.request(`/rental-bills/detail?id=${firstBill.id}`);
    expect(adjustedDetail.statusCode, adjustedDetail.payload).toBe(200);
    const adjustedCashVersion = harness.parse<{
      financial: { version: string; outstandingMinor: number };
    }>(adjustedDetail).financial.version;
    const postRevisionReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: firstBill.id },
      amountMinor: 100,
      occurredOn: "2026-08-31",
      expectedVersion: adjustedCashVersion,
      idempotencyKey: randomUUID(),
    });
    expect(postRevisionReceipt.statusCode, postRevisionReceipt.payload).toBe(200);
    expect(harness.state.rental.cashEntries).toHaveLength(originalCashIds.length + 1);

    const history = await harness.request(
      `/rental-bills/revisions?billId=${firstBill.id}&page=1&pageSize=100`,
    );
    expect(history.statusCode, history.payload).toBe(200);
    expect(
      harness.parse<{ total: number; items: Array<{ billId: string }> }>(history),
    ).toMatchObject({
      total: 1,
      items: [{ billId: firstBill.id }],
    });
    const oldHistoryPath = await harness.request(
      `/rental-bills/revision-history?billId=${firstBill.id}`,
      undefined,
      undefined,
      "GET",
    );
    expect(oldHistoryPath.statusCode).toBe(404);

    const laterInput = {
      billId: firstBill.id,
      expectedVersion: "preview-seed",
      readings: [{ kind: "water", readingDate: "2026-08-31", reading: "114" }],
      reason: "再次核对公共水表读数",
    };
    const laterPreviewResponse = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      laterInput,
    );
    expect(laterPreviewResponse.statusCode, laterPreviewResponse.payload).toBe(200);
    const laterPreview = harness.parse<{ version: string }>(laterPreviewResponse);
    const revisionRepository = harness.app.get(BillRevisionsRepository);
    const append = revisionRepository.append.bind(revisionRepository);
    let appendCount = 0;
    vi.spyOn(revisionRepository, "append").mockImplementation(async (...args) => {
      const result = await append(...args);
      if (++appendCount === 2) throw new Error("Injected second bill revision failure");
      return result;
    });
    const beforeFailure = cloneRentalTestState(harness.state.rental);
    const failed = await harness.request("/rental-monthly-bills/adjust", {
      ...laterInput,
      expectedVersion: laterPreview.version,
      idempotencyKey: randomUUID(),
    });
    expect(failed.statusCode).toBe(500);
    expect(appendCount).toBe(2);
    expect(harness.state.rental).toEqual(beforeFailure);

    const foreignContractDetail = await harness.request(
      `/rental-bills/revisions?billId=${foreignBillId}`,
    );
    expect(foreignContractDetail.statusCode).toBe(404);
    expect(testIds.organization).toBe(harness.state.rental.bills[0]?.organizationId);
  });

  it("更正已结算账单后拒绝账单目标新收款，并接受真实投影版本的结算收款", async () => {
    const ownerRole = [...harness.state.roles.values()].find(({ key }) => key === "owner");
    if (!ownerRole) throw new Error("Rental finance test owner role unavailable");
    ownerRole.permissions.push("rental_monthly_bills:adjust", "rental_settlements:confirm");
    const createInput = {
      contractId: harness.financeContractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
    };
    const billPreview = await harness.request("/rental-monthly-bills/preview", createInput);
    expect(billPreview.statusCode, billPreview.payload).toBe(200);
    const created = await harness.request("/rental-monthly-bills/generate", {
      ...createInput,
      expectedVersion: harness.parse<{ version: string }>(billPreview).version,
      idempotencyKey: randomUUID(),
    });
    expect(created.statusCode, created.payload).toBe(200);
    const bill = harness.parse<MonthlyBill>(created);

    const settlementId = randomUUID();
    const now = new Date("2026-08-31T12:00:00.000Z");
    harness.state.rental.settlements.push({
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
          { billId: bill.id, billingMonth: "2026-08", lines: [], amountMinor: bill.amountMinor },
        ],
        finalCostMinor: bill.amountMinor,
        differenceMinor: bill.amountMinor,
      },
      confirmedAt: now,
      confirmedByUserId: testIds.ownerUser,
      updatedAt: now,
    } as never);
    harness.state.rental.settlementBills.push({
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
      settlementId,
      billId: bill.id,
      createdAt: now,
    } as never);

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
    const projectionResults: Array<NonNullable<typeof initialProjection>> = [];
    const refresh = projection.refresh.bind(projection);
    vi.spyOn(projection, "refresh").mockImplementation(async (refreshScope, actor, tx) => {
      const result = await refresh(refreshScope, actor, tx);
      if (result) projectionResults.push(result);
      return result;
    });

    const revisionInput = {
      billId: bill.id,
      expectedVersion: "preview-seed",
      readings: [{ kind: "water", readingDate: "2026-08-31", reading: "115" }],
      reason: "更正已纳入结算的水表读数",
    };
    const previewResponse = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      revisionInput,
    );
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<{
      version: string;
      affectedBills: Array<{ afterAmountMinor: number }>;
    }>(previewResponse);
    const adjusted = await harness.request("/rental-monthly-bills/adjust", {
      ...revisionInput,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(adjusted.statusCode, adjusted.payload).toBe(200);
    const refreshedProjection = projectionResults.at(-1);
    if (!refreshedProjection)
      throw new Error("Bill correction did not return a settlement projection");
    expect(refreshedProjection.finalCostMinor).toBe(preview.affectedBills[0]?.afterAmountMinor);

    const detail = await harness.request(`/rental-bills/detail?id=${bill.id}`);
    expect(detail.statusCode, detail.payload).toBe(200);
    const blockedBillReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: bill.id },
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: harness.parse<{ financial: { version: string } }>(detail).financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(blockedBillReceipt.statusCode).toBe(409);
    expect(harness.state.rental.cashEntries).toHaveLength(0);

    const settlementReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "settlement", settlementId },
      amountMinor: 1_000,
      occurredOn: "2026-08-31",
      expectedVersion: refreshedProjection.version,
      idempotencyKey: randomUUID(),
    });
    expect(settlementReceipt.statusCode, settlementReceipt.payload).toBe(200);
    expect(harness.state.rental.cashEntries).toMatchObject([
      { billId: null, settlementId, amountMinor: 1_000 },
    ]);
  });
});

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testIds } from "../../test/auth-test-helpers.js";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { AuditService } from "../audit/audit.service.js";
import { organizationDate } from "./contract-date.rules.js";

describe("合同统一结算 HTTP", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;

  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
    prepareContract(harness);
  });

  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it("结算9月未清50000、10月多收30000和实际押金300000，退款后原目标余额归零", async () => {
    setContractEnd("2026-10-31");
    await generateMonth("2026-09", "2026-09-30");
    const october = await generateMonth(
      "2026-10",
      "2026-10-31",
      { water: "100", electricity: "50" },
      [
        { id: randomUUID(), name: "十月月度加收", amountMinor: 5_000, note: "" },
        { id: randomUUID(), name: "十月月度减免", amountMinor: -2_000, note: "" },
      ],
    );
    const octoberBefore = structuredClone(
      harness.state.rental.bills.find(({ id }) => id === october.id),
    );
    if (!octoberBefore) throw new Error("Expected the generated October monthly bill");
    expect(octoberBefore.amountMinor).toBe(53_000);
    const octoberReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: october.id },
      amountMinor: 30_000,
      occurredOn: "2026-10-31",
      expectedVersion: await billVersion(october.id),
      idempotencyKey: randomUUID(),
    });
    expect(octoberReceipt.statusCode, octoberReceipt.payload).toBe(200);

    const deposit = await generateActualDeposit();
    await confirmActualDeposit(deposit.id);
    removeLegacyBillAdjustPermission();
    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-30",
      reason: "十月账单已生成后的实际九月退租",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);

    const previewResponse = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<{
      version: string;
      canConfirm: boolean;
      missingFields: string[];
      finalCostMinor: number;
      receivedMinor: number;
      refundedMinor: number;
      differenceMinor: number;
      billChanges: Array<{
        billId: string | null;
        billingMonth: string;
        amountMinor: number;
        changeAmountMinor: number;
        lines: unknown[];
      }>;
    }>(previewResponse);
    expect(preview).toMatchObject({
      canConfirm: true,
      missingFields: [],
      finalCostMinor: 50_000,
      receivedMinor: 330_000,
      refundedMinor: 0,
      differenceMinor: -280_000,
    });
    expect(preview.billChanges).toEqual(
      expect.arrayContaining([
        {
          billId: october.id,
          billingMonth: "2026-10",
          amountMinor: 0,
          changeAmountMinor: -octoberBefore.amountMinor,
          lines: [],
        },
      ]),
    );

    const beforeBillIds = harness.state.rental.bills.map(({ id }) => id).toSorted();
    const settlementRequest = {
      contractId: harness.financeContractId,
      extraFees: [],
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    };
    const confirmed = await harness.request("/rental-settlements/confirm", settlementRequest);
    expect(confirmed.statusCode, confirmed.payload).toBe(200);
    const settlement = harness.parse<{
      id: string;
      status: string;
      balance: { version: string; refundableMinor: number; outstandingMinor: number };
    }>(confirmed);
    expect(settlement).toMatchObject({
      status: "pending_refund",
      balance: { refundableMinor: 280_000, outstandingMinor: 0 },
    });
    const withdrawnOctober = harness.state.rental.bills.find(({ id }) => id === october.id);
    expect(withdrawnOctober).toMatchObject({
      id: october.id,
      billNumber: octoberBefore.billNumber,
      billingMonth: "2026-10",
      dueDate: octoberBefore.dueDate,
      status: "voided",
      amountMinor: 0,
      revision: (octoberBefore.revision ?? 0) + 1,
      lines: [],
    });
    expect(
      harness.state.rental.billRevisions.filter(({ billId }) => billId === october.id),
    ).toEqual([
      expect.objectContaining({
        billId: october.id,
        revision: octoberBefore.revision,
        amountMinor: octoberBefore.amountMinor,
        linesSnapshot: octoberBefore.lines,
        billSnapshot: expect.objectContaining({ id: october.id, dueDate: octoberBefore.dueDate }),
      }),
    ]);
    expect(
      harness.state.rental.bills.some(
        ({ type, billingMonth, status }) =>
          type === "monthly" &&
          typeof billingMonth === "string" &&
          billingMonth > "2026-09" &&
          status === "active",
      ),
    ).toBe(false);
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billId: october.id, kind: "receipt", amountMinor: 30_000 }),
      ]),
    );

    const futureBillDetail = await harness.request(`/rental-bills/detail?id=${october.id}`);
    expect(futureBillDetail.statusCode, futureBillDetail.payload).toBe(200);
    expect(
      harness.parse<{ id: string; status: string; amountMinor: number; lines: unknown[] }>(
        futureBillDetail,
      ),
    ).toMatchObject({ id: october.id, status: "voided", amountMinor: 0, lines: [] });
    const futureBillHistory = await harness.request(
      `/rental-bills/revisions?billId=${october.id}&page=1&pageSize=20`,
    );
    expect(futureBillHistory.statusCode, futureBillHistory.payload).toBe(200);
    expect(
      harness.parse<{ total: number; items: Array<{ billId: string; amountMinor: number }> }>(
        futureBillHistory,
      ),
    ).toMatchObject({
      total: 1,
      items: [{ billId: october.id, amountMinor: octoberBefore.amountMinor }],
    });
    expect(harness.state.rental.bills.map(({ id }) => id).toSorted()).toEqual(beforeBillIds);

    const futureMonthInput = {
      contractId: harness.financeContractId,
      billingMonth: "2026-10",
      dueDate: "2026-10-31",
      readings: [
        { kind: "water" as const, readingDate: "2026-10-31", reading: "110" },
        { kind: "electricity" as const, readingDate: "2026-10-31", reading: "60" },
      ],
      extraFees: [],
    };
    const beforeRejectedFutureGeneration = structuredClone({
      bills: harness.state.rental.bills,
      billRevisions: harness.state.rental.billRevisions,
      financeRequests: harness.state.rental.financeRequests,
    });
    const futurePreview = await harness.request("/rental-monthly-bills/preview", futureMonthInput);
    expect(futurePreview.statusCode, futurePreview.payload).toBe(400);
    const futureGeneration = await harness.request("/rental-monthly-bills/generate", {
      ...futureMonthInput,
      expectedVersion: "1",
      idempotencyKey: randomUUID(),
    });
    expect(futureGeneration.statusCode, futureGeneration.payload).toBe(400);
    expect(
      structuredClone({
        bills: harness.state.rental.bills,
        billRevisions: harness.state.rental.billRevisions,
        financeRequests: harness.state.rental.financeRequests,
      }),
    ).toEqual(beforeRejectedFutureGeneration);
    expect(
      harness.state.rental.bills.some(
        ({ type, billingMonth, status }) =>
          type === "monthly" &&
          typeof billingMonth === "string" &&
          billingMonth > "2026-09" &&
          status === "active",
      ),
    ).toBe(false);

    const blockedOriginalReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: october.id },
      amountMinor: 1,
      occurredOn: "2026-10-31",
      expectedVersion: await billVersion(october.id),
      idempotencyKey: randomUUID(),
    });
    expect(blockedOriginalReceipt.statusCode).toBe(409);
    const blockedOriginalRefund = await harness.request("/rental-refunds/create", {
      target: { kind: "bill", billId: october.id },
      occurredOn: "2026-10-31",
      expectedVersion: await billVersion(october.id),
      idempotencyKey: randomUUID(),
    });
    expect(blockedOriginalRefund.statusCode).toBe(409);

    const detailBeforeRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailBeforeRefund.statusCode).toBe(200);
    const publicSettlement = harness.parse<{
      settlement: { id: string; balance: { version: string; refundableMinor: number } };
    }>(detailBeforeRefund).settlement;
    expect(publicSettlement).toMatchObject({
      id: settlement.id,
      balance: { refundableMinor: 280_000 },
    });
    const refund = await harness.request("/rental-refunds/create", {
      target: { kind: "settlement", settlementId: publicSettlement.id },
      occurredOn: "2026-10-31",
      expectedVersion: publicSettlement.balance.version,
      idempotencyKey: randomUUID(),
    });
    expect(refund.statusCode, refund.payload).toBe(200);
    const refundEntry = harness.parse<{ id: string }>(refund);

    const detailAfterRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailAfterRefund.statusCode).toBe(200);
    const afterRefundSettlement = harness.parse<{
      settlement: {
        status: string;
        version: string;
        balance: { version: string; refundableMinor: number; outstandingMinor: number };
      };
    }>(detailAfterRefund).settlement;
    expect(afterRefundSettlement).toMatchObject({
      status: "settled",
      balance: { refundableMinor: 0, outstandingMinor: 0 },
    });
    expect(
      harness.state.rental.settlements.find(({ id }) => id === publicSettlement.id)?.snapshot
        .withdrawnBillIds,
    ).toEqual([october.id]);
    const completedReplay = await harness.request("/rental-settlements/confirm", settlementRequest);
    expect(completedReplay.statusCode, completedReplay.payload).toBe(200);
    const replayedSettlement = harness.parse<{
      version: string;
      balance: { version: string; refundableMinor: number };
    }>(completedReplay);
    expect(replayedSettlement).toMatchObject({
      version: afterRefundSettlement.balance.version,
      balance: { version: afterRefundSettlement.balance.version, refundableMinor: 0 },
    });
    const revokeRefund = await harness.request("/rental-refunds/revoke", {
      entryId: refundEntry.id,
      reason: "验证已完成结算重放返回最新资金版本",
      expectedVersion: replayedSettlement.balance.version,
      idempotencyKey: randomUUID(),
    });
    expect(revokeRefund.statusCode, revokeRefund.payload).toBe(200);
    const detailAfterRevoke = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailAfterRevoke.statusCode).toBe(200);
    expect(
      harness.parse<{
        settlement: {
          status: string;
          balance: { refundableMinor: number; outstandingMinor: number };
        };
      }>(detailAfterRevoke).settlement,
    ).toMatchObject({
      status: "pending_refund",
      balance: { refundableMinor: 280_000, outstandingMinor: 0 },
    });
  });

  it("实际9月28日退租时按既有租金比例计费并撤回已出账且未收款的10月账单", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-09-01", "2026-10-31");
    const september = await generateMonth("2026-09", "2026-09-30", {
      water: "105",
      electricity: "55",
    });
    const october = await generateMonth("2026-10", "2026-10-31", {
      water: "110",
      electricity: "60",
    });
    const octoberBefore = structuredClone(
      harness.state.rental.bills.find(({ id }) => id === october.id),
    );
    if (!octoberBefore) throw new Error("Expected the actual October monthly bill");

    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-28",
      reason: "实际结束日按9月28日核算",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);
    const settlementInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-28", reading: "105" },
        { kind: "electricity" as const, readingDate: "2026-09-28", reading: "55" },
      ],
    };
    const previewResponse = await harness.request("/rental-settlements/preview", settlementInput);
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<{
      version: string;
      effectiveEndDate: string;
      canConfirm: boolean;
      missingFields: string[];
      finalCostMinor: number;
      receivedMinor: number;
      refundedMinor: number;
      differenceMinor: number;
      billChanges: Array<{
        billId: string | null;
        billingMonth: string;
        amountMinor: number;
        changeAmountMinor: number;
        lines: Array<{ kind: string; amountMinor: number }>;
      }>;
    }>(previewResponse);
    expect(preview).toMatchObject({
      effectiveEndDate: "2026-09-28",
      canConfirm: true,
      missingFields: [],
      finalCostMinor: 50_167,
      receivedMinor: 0,
      refundedMinor: 0,
      differenceMinor: 50_167,
    });
    expect(preview.billChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          billId: september.id,
          billingMonth: "2026-09",
          amountMinor: 50_167,
          lines: expect.arrayContaining([
            expect.objectContaining({ kind: "rent_period", amountMinor: 46_667 }),
          ]),
        }),
        {
          billId: october.id,
          billingMonth: "2026-10",
          amountMinor: 0,
          changeAmountMinor: -octoberBefore.amountMinor,
          lines: [],
        },
      ]),
    );
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...settlementInput,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(200);

    expect(harness.state.rental.bills.find(({ id }) => id === october.id)).toMatchObject({
      id: october.id,
      billingMonth: "2026-10",
      dueDate: octoberBefore.dueDate,
      status: "voided",
      amountMinor: 0,
      lines: [],
    });
    expect(harness.state.rental.cashEntries.some((entry) => entry.billId === october.id)).toBe(
      false,
    );
    expect(
      harness.state.rental.bills.some(
        ({ type, billingMonth, status }) =>
          type === "monthly" &&
          typeof billingMonth === "string" &&
          billingMonth > "2026-09" &&
          status === "active",
      ),
    ).toBe(false);
  });

  it("押金1000元、9月租金实收500元并计水电100元时按负900元差额退款", async () => {
    harness.source.today = "2026-10-01";
    setContractEnd("2026-09-30");
    const september = await generateMonth("2026-09", "2026-09-30", {
      water: "120",
      electricity: "60",
    });
    const septemberBill = harness.state.rental.bills.find(({ id }) => id === september.id);
    expect(septemberBill?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeSnapshot: expect.objectContaining({ kind: "water", endDate: "2026-09-30" }),
        }),
        expect.objectContaining({
          feeSnapshot: expect.objectContaining({ kind: "electricity", endDate: "2026-09-30" }),
        }),
      ]),
    );
    expect(september.amountMinor).toBe(60_000);
    expect(harness.state.rental.bills.find(({ id }) => id === september.id)).toMatchObject({
      billingMonth: "2026-09",
      dueDate: "2026-09-30",
      effectiveEnd: "2026-09-30",
      amountMinor: 60_000,
    });
    expect(
      harness.state.rental.bills.some(
        ({ type, billingMonth, status }) =>
          type === "monthly" && billingMonth === "2026-10" && status === "active",
      ),
    ).toBe(false);

    const rentReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: september.id },
      amountMinor: 50_000,
      occurredOn: "2026-09-30",
      expectedVersion: await billVersion(september.id),
      idempotencyKey: randomUUID(),
    });
    expect(rentReceipt.statusCode, rentReceipt.payload).toBe(200);

    const depositTerms = harness.state.rental.deposits.get(harness.financeContractId);
    const depositTerm = depositTerms?.[0];
    if (!depositTerm) throw new Error("Test contract deposit term missing");
    harness.state.rental.deposits.set(harness.financeContractId, [
      { ...depositTerm, fixedAmountMinor: 100_000, finalAmountMinor: 100_000 },
    ]);
    const deposit = await generateActualDeposit(100_000);
    await confirmActualDeposit(deposit.id);
    removeLegacyBillAdjustPermission();

    const previewResponse = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<{
      version: string;
      canConfirm: boolean;
      missingFields: string[];
      finalCostMinor: number;
      receivedMinor: number;
      refundedMinor: number;
      differenceMinor: number;
    }>(previewResponse);
    expect(preview).toMatchObject({
      canConfirm: true,
      missingFields: [],
      finalCostMinor: 60_000,
      receivedMinor: 150_000,
      refundedMinor: 0,
      differenceMinor: -90_000,
    });

    const confirmed = await harness.request("/rental-settlements/confirm", {
      contractId: harness.financeContractId,
      extraFees: [],
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(200);
    const settlement = harness.parse<{
      id: string;
      status: string;
      balance: { refundableMinor: number; outstandingMinor: number };
    }>(confirmed);
    expect(settlement).toMatchObject({
      status: "pending_refund",
      balance: { refundableMinor: 90_000, outstandingMinor: 0 },
    });
    expect(harness.state.rental.settlementBills.map(({ billId }) => billId).toSorted()).toEqual(
      [september.id, deposit.id].toSorted(),
    );
    expect(
      harness.state.rental.cashEntries.filter(
        ({ billId, kind }) => billId === september.id && kind === "receipt",
      ),
    ).toHaveLength(1);
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billId: september.id, kind: "receipt", amountMinor: 50_000 }),
        expect.objectContaining({ billId: deposit.id, kind: "receipt", amountMinor: 100_000 }),
      ]),
    );

    const detailBeforeRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailBeforeRefund.statusCode, detailBeforeRefund.payload).toBe(200);
    const publicSettlement = harness.parse<{
      settlement: { id: string; balance: { version: string; refundableMinor: number } };
    }>(detailBeforeRefund).settlement;
    expect(publicSettlement).toMatchObject({
      id: settlement.id,
      balance: { refundableMinor: 90_000 },
    });

    const refund = await harness.request("/rental-refunds/create", {
      target: { kind: "settlement", settlementId: publicSettlement.id },
      occurredOn: "2026-10-01",
      expectedVersion: publicSettlement.balance.version,
      idempotencyKey: randomUUID(),
    });
    expect(refund.statusCode, refund.payload).toBe(200);

    const detailAfterRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailAfterRefund.statusCode, detailAfterRefund.payload).toBe(200);
    expect(
      harness.parse<{
        settlement: {
          status: string;
          balance: { refundableMinor: number; outstandingMinor: number };
        };
      }>(detailAfterRefund).settlement,
    ).toMatchObject({
      status: "settled",
      balance: { refundableMinor: 0, outstandingMinor: 0 },
    });
    expect(
      harness.state.rental.cashEntries.filter(
        ({ billId, kind }) => billId === september.id && kind === "receipt",
      ),
    ).toHaveLength(1);
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          settlementId: publicSettlement.id,
          kind: "refund",
          amountMinor: 90_000,
        }),
      ]),
    );
  });

  it("缺少终止日水电事实时只返回不可确认预览", async () => {
    await generateMonth("2026-09", "2026-09-30");
    removeLegacyBillAdjustPermission();
    const previewResponse = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    expect(
      harness.parse<{ canConfirm: boolean; missingFields: string[] }>(previewResponse),
    ).toMatchObject({
      canConfirm: false,
      missingFields: ["electricityReading", "waterReading"],
    });
    const financeRequestsBeforeConfirm = harness.state.rental.financeRequests.length;

    const confirmed = await harness.request("/rental-settlements/confirm", {
      contractId: harness.financeContractId,
      extraFees: [],
      expectedVersion: harness.parse<{ version: string }>(previewResponse).version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode).toBe(400);
    expect(harness.state.rental.settlements).toHaveLength(0);
    expect(harness.state.rental.financeRequests).toHaveLength(financeRequestsBeforeConfirm);
  });

  it("单独存在终止日入住底数不能替代计费末次读数", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-09-01", "2026-12-31");
    const meterDetail = await harness.request(
      `/rental-meters/detail?id=${harness.financeContractId}`,
    );
    expect(meterDetail.statusCode, meterDetail.payload).toBe(200);
    const baseline = await harness.request("/rental-meters/update", {
      contractId: harness.financeContractId,
      readings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "100" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "50" },
      ],
      expectedVersion: harness.parse<{ version: string }>(meterDetail).version,
      idempotencyKey: randomUUID(),
      reason: "测试终止日入住底数不能代替末次读数",
    });
    expect(baseline.statusCode, baseline.payload).toBe(200);
    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-30",
      reason: "验证终止日底数完整性",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);

    const preview = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(preview.statusCode, preview.payload).toBe(200);
    expect(harness.parse<{ canConfirm: boolean; missingFields: string[] }>(preview)).toMatchObject({
      canConfirm: false,
      missingFields: ["electricityReading", "waterReading"],
    });
    const beforeConfirm = structuredClone({
      contract: harness.state.rental.contracts.get(harness.financeContractId),
      meterReadings: harness.state.rental.meterReadings,
      meterReadingRevisions: harness.state.rental.meterReadingRevisions,
      bills: harness.state.rental.bills,
      billRevisions: harness.state.rental.billRevisions,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
      financeRequests: harness.state.rental.financeRequests,
      auditEntries: harness.state.rental.auditEntries,
      auditLogs: harness.state.auditLogs,
    });
    const confirmed = await harness.request("/rental-settlements/confirm", {
      contractId: harness.financeContractId,
      extraFees: [],
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(400);
    expect(JSON.parse(confirmed.payload).code).toBe("VALIDATION_FAILED");
    expect(
      structuredClone({
        contract: harness.state.rental.contracts.get(harness.financeContractId),
        meterReadings: harness.state.rental.meterReadings,
        meterReadingRevisions: harness.state.rental.meterReadingRevisions,
        bills: harness.state.rental.bills,
        billRevisions: harness.state.rental.billRevisions,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
        financeRequests: harness.state.rental.financeRequests,
        auditEntries: harness.state.rental.auditEntries,
        auditLogs: harness.state.auditLogs,
      }),
    ).toEqual(beforeConfirm);
  });

  it("同日不同值的真实水电读数在结算预览和确认中映射为验证错误", async () => {
    harness.source.today = "2026-10-01";
    setContractEnd("2026-09-30");
    await generateMonth("2026-09", "2026-09-30", {
      water: "120",
      electricity: "60",
    });
    const validPreview = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(validPreview.statusCode, validPreview.payload).toBe(200);
    const expectedVersion = harness.parse<{ version: string }>(validPreview).version;
    const before = structuredClone({
      meterReadings: harness.state.rental.meterReadings,
      meterReadingRevisions: harness.state.rental.meterReadingRevisions,
      bills: harness.state.rental.bills,
      billRevisions: harness.state.rental.billRevisions,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
      financeRequests: harness.state.rental.financeRequests,
      auditEntries: harness.state.rental.auditEntries,
    });
    const invalidInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "121" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "60" },
      ],
    };

    const preview = await harness.request("/rental-settlements/preview", invalidInput);
    expect(preview.statusCode, preview.payload).toBe(400);
    expect(JSON.parse(preview.payload).code).toBe("VALIDATION_FAILED");
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...invalidInput,
      expectedVersion,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(400);
    expect(JSON.parse(confirmed.payload).code).toBe("VALIDATION_FAILED");
    expect(
      structuredClone({
        meterReadings: harness.state.rental.meterReadings,
        meterReadingRevisions: harness.state.rental.meterReadingRevisions,
        bills: harness.state.rental.bills,
        billRevisions: harness.state.rental.billRevisions,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
        financeRequests: harness.state.rental.financeRequests,
        auditEntries: harness.state.rental.auditEntries,
      }),
    ).toEqual(before);
  });

  it("拒绝结算额外费用中的重复稳定ID", async () => {
    setContractEnd("2026-09-30");
    await generateMonth("2026-09", "2026-09-30");
    const duplicateId = randomUUID();

    const response = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [
        { id: duplicateId, name: "清洁费", amountMinor: 1_000, note: "" },
        { id: duplicateId, name: "维修费", amountMinor: 2_000, note: "" },
      ],
    });

    expect(response.statusCode, response.payload).toBe(400);
  });

  it("拒绝结算额外费用与保留月账单额外费用使用同一稳定ID", async () => {
    setContractEnd("2026-09-30");
    const extraFeeId = randomUUID();
    await generateMonth("2026-09", "2026-09-30", undefined, [
      { id: extraFeeId, name: "月度清洁费", amountMinor: 1_000, note: "" },
    ]);

    const response = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [{ id: extraFeeId, name: "结算清洁费", amountMinor: 2_000, note: "" }],
    });

    expect(response.statusCode, response.payload).toBe(400);
  });

  it("允许不同月份的不同账单保留同一额外费用ID", async () => {
    setContractDates("2026-09-01", "2026-10-31");
    const extraFeeId = randomUUID();
    await generateMonth("2026-09", "2026-09-30", undefined, [
      { id: extraFeeId, name: "9月清洁费", amountMinor: 1_000, note: "" },
    ]);

    const response = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [{ id: extraFeeId, name: "10月清洁费", amountMinor: 2_000, note: "" }],
    });

    expect(response.statusCode, response.payload).toBe(200);
  });

  it("月账单受控更正后拒绝旧结算确认载荷且不恢复旧额外费用", async () => {
    setContractEnd("2026-09-30");
    const monthlyExtraId = randomUUID();
    const settlementExtraId = randomUUID();
    const month = await generateMonth("2026-09", "2026-09-30", undefined, [
      { id: monthlyExtraId, name: "月度清洁费", amountMinor: 1_000, note: "旧金额" },
    ]);
    const settlementInput = {
      contractId: harness.financeContractId,
      extraFees: [{ id: settlementExtraId, name: "结算维修费", amountMinor: 2_000, note: "" }],
    };
    const settlementPreview = await harness.request("/rental-settlements/preview", settlementInput);
    expect(settlementPreview.statusCode, settlementPreview.payload).toBe(200);

    const ownerRole = [...harness.state.roles.values()].find(({ key }) => key === "owner");
    if (!ownerRole) throw new Error("Rental finance test owner role unavailable");
    ownerRole.permissions.push("rental_monthly_bills:adjust");
    const revisionInput = {
      billId: month.id,
      expectedVersion: "preview-seed",
      extraFees: [{ id: monthlyExtraId, name: "月度清洁费", amountMinor: 3_000, note: "更正后" }],
      reason: "更正月度额外费用",
    };
    const revisionPreview = await harness.request(
      "/rental-monthly-bills/adjust-preview",
      revisionInput,
    );
    expect(revisionPreview.statusCode, revisionPreview.payload).toBe(200);
    const adjusted = await harness.request("/rental-monthly-bills/adjust", {
      ...revisionInput,
      expectedVersion: harness.parse<{ version: string }>(revisionPreview).version,
      idempotencyKey: randomUUID(),
    });
    expect(adjusted.statusCode, adjusted.payload).toBe(200);

    const idempotencyKey = randomUUID();
    const staleConfirm = await harness.request("/rental-settlements/confirm", {
      ...settlementInput,
      expectedVersion: harness.parse<{ version: string }>(settlementPreview).version,
      idempotencyKey,
    });

    expect(staleConfirm.statusCode, staleConfirm.payload).toBe(409);
    expect(harness.state.rental.settlements).toHaveLength(0);
    expect(
      harness.state.rental.financeRequests.some(
        (request) => request.idempotencyKey === idempotencyKey,
      ),
    ).toBe(false);
    const currentBill = harness.state.rental.bills.find(({ id }) => id === month.id);
    expect(currentBill?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountMinor: 3_000,
          feeSnapshot: { kind: "extra_fee", extraFeeId: monthlyExtraId, origin: "monthly" },
        }),
      ]),
    );
    expect(currentBill?.lines).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeSnapshot: { kind: "extra_fee", extraFeeId: settlementExtraId, origin: "settlement" },
        }),
      ]),
    );
  });

  it("逐账单资金余额安全但公开收款累计超安全整数时返回参数错误", async () => {
    setContractDates("2026-09-01", "2026-10-31");
    const september = await generateMonth("2026-09", "2026-09-30");
    const october = await generateMonth("2026-10", "2026-10-31");
    const now = new Date("2026-10-31T12:00:00.000Z");
    const entry = (
      billId: string,
      kind: "receipt" | "refund",
      amountMinor: number,
      occurredOn: string,
    ) => ({
      id: randomUUID(),
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
      billId,
      settlementId: null,
      kind,
      purpose: kind === "receipt" ? ("bill_receipt" as const) : ("refund" as const),
      amountMinor,
      occurredOn,
      note: null,
      createdByUserId: testIds.ownerUser,
      createdAt: now,
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    });
    harness.state.rental.cashEntries.push(
      entry(september.id, "receipt", Number.MAX_SAFE_INTEGER, "2026-09-30"),
      entry(september.id, "refund", Number.MAX_SAFE_INTEGER, "2026-09-30"),
      entry(october.id, "receipt", 1, "2026-10-31"),
    );
    const before = structuredClone({
      bills: harness.state.rental.bills,
      cashEntries: harness.state.rental.cashEntries,
      financeRequests: harness.state.rental.financeRequests,
    });

    const response = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });

    expect(response.statusCode, response.payload).toBe(400);
    expect(JSON.parse(response.payload).code).toBe("VALIDATION_FAILED");
    expect(
      structuredClone({
        bills: harness.state.rental.bills,
        cashEntries: harness.state.rental.cashEntries,
        financeRequests: harness.state.rental.financeRequests,
      }),
    ).toEqual(before);
  });

  it("结算请求记录先完成再审计，审计失败回滚后同幂等键可重试", async () => {
    setContractEnd("2026-09-30");
    await generateMonth("2026-09", "2026-09-30");
    const settlementInput = { contractId: harness.financeContractId, extraFees: [] };
    const preview = await harness.request("/rental-settlements/preview", settlementInput);
    expect(preview.statusCode, preview.payload).toBe(200);
    const input = {
      ...settlementInput,
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    };
    const audit = harness.app.get(AuditService);
    const appendRequired = audit.appendRequired.bind(audit);
    let completedBeforeAuditFailure = false;
    vi.spyOn(audit, "appendRequired").mockImplementation(async (event, executor) => {
      if (event.action === "rental_settlement.confirmed") {
        completedBeforeAuditFailure = harness.state.rental.financeRequests.some(
          (record) => record.idempotencyKey === input.idempotencyKey,
        );
      }
      return appendRequired(event, executor);
    });
    harness.state.failNextRequiredAuditAppendAfterPersist = true;
    const failed = await harness.request("/rental-settlements/confirm", input);
    expect(failed.statusCode).toBe(500);
    expect(completedBeforeAuditFailure).toBe(true);
    expect(
      harness.state.rental.financeRequests.some(
        (record) => record.idempotencyKey === input.idempotencyKey,
      ),
    ).toBe(false);
    expect(harness.state.rental.settlements).toHaveLength(0);

    const retried = await harness.request("/rental-settlements/confirm", input);
    expect(retried.statusCode, retried.payload).toBe(200);
    expect(
      harness.state.rental.financeRequests.filter(
        (record) => record.idempotencyKey === input.idempotencyKey,
      ),
    ).toHaveLength(1);
    expect(harness.state.rental.settlements).toHaveLength(1);
  });

  it("起租前未收押金取消沿用作废流程且不生成退款结算", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const deposit = await generateActualDeposit();
    const cancelled = await harness.request("/rental-contracts/cancel", {
      id: harness.financeContractId,
      reason: "起租前取消",
    });
    expect(cancelled.statusCode, cancelled.payload).toBe(200);
    const header = harness.state.rental.contracts.get(harness.financeContractId);
    expect(header?.cancelledAt).toBeInstanceOf(Date);
    expect(harness.state.rental.settlements).toHaveLength(0);
    expect(harness.state.rental.cashEntries).toHaveLength(0);
    expect(harness.state.rental.bills.find((bill) => bill.id === deposit.id)?.status).toBe(
      "voided",
    );
    const detail = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detail.statusCode, detail.payload).toBe(200);
    expect(harness.parse<{ settlement: unknown }>(detail).settlement).toBeNull();
  });

  it("起租前押金来源更正后沿原ID退款，新押金独立生成并整额收取", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const oldDeposit = await generateActualDeposit();
    await confirmActualDeposit(oldDeposit.id);

    const corrected = await harness.request("/rental-contracts/update", {
      id: harness.financeContractId,
      depositTerms: [
        { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 400_000 },
      ],
    });
    expect(corrected.statusCode, corrected.payload).toBe(200);
    expect(harness.state.rental.bills.find(({ id }) => id === oldDeposit.id)?.status).toBe(
      "voided",
    );
    expect(
      harness.state.rental.cashEntries.filter(({ billId }) => billId === oldDeposit.id),
    ).toEqual([expect.objectContaining({ kind: "receipt", amountMinor: 300_000 })]);

    const newDeposit = await generateActualDeposit(400_000);
    expect(newDeposit.id).not.toBe(oldDeposit.id);
    await confirmActualDeposit(newDeposit.id);
    const oldDetailBeforeRefund = await harness.request(`/rental-bills/detail?id=${oldDeposit.id}`);
    expect(oldDetailBeforeRefund.statusCode, oldDetailBeforeRefund.payload).toBe(200);
    expect(
      harness.parse<{
        id: string;
        amountMinor: number;
        status: string;
        financial: { outstandingMinor: number; refundableMinor: number };
      }>(oldDetailBeforeRefund),
    ).toMatchObject({
      id: oldDeposit.id,
      amountMinor: 300_000,
      status: "voided",
      financial: { outstandingMinor: 0, refundableMinor: 300_000 },
    });
    const voidedPageBeforeRefund = await harness.request(
      `/rental-bills/list?contractId=${harness.financeContractId}&status=voided`,
      undefined,
      undefined,
      "GET",
    );
    expect(voidedPageBeforeRefund.statusCode, voidedPageBeforeRefund.payload).toBe(200);
    expect(
      harness
        .parse<{
          items: Array<{
            id: string;
            amountMinor: number;
            financial?: { outstandingMinor: number; refundableMinor: number };
          }>;
        }>(voidedPageBeforeRefund)
        .items.find(({ id }) => id === oldDeposit.id),
    ).toMatchObject({
      amountMinor: 300_000,
      financial: { outstandingMinor: 0, refundableMinor: 300_000 },
    });
    const oldRefund = await harness.request("/rental-refunds/create", {
      target: { kind: "bill", billId: oldDeposit.id },
      occurredOn: "2026-10-31",
      expectedVersion: await billVersion(oldDeposit.id),
      idempotencyKey: randomUUID(),
    });
    expect(oldRefund.statusCode, oldRefund.payload).toBe(200);
    const oldDetailAfterRefund = await harness.request(`/rental-bills/detail?id=${oldDeposit.id}`);
    expect(oldDetailAfterRefund.statusCode, oldDetailAfterRefund.payload).toBe(200);
    expect(
      harness.parse<{
        financial: { outstandingMinor: number; refundableMinor: number };
      }>(oldDetailAfterRefund).financial,
    ).toMatchObject({ outstandingMinor: 0, refundableMinor: 0 });
    const voidedPageAfterRefund = await harness.request(
      `/rental-bills/list?contractId=${harness.financeContractId}&status=voided`,
      undefined,
      undefined,
      "GET",
    );
    expect(voidedPageAfterRefund.statusCode, voidedPageAfterRefund.payload).toBe(200);
    expect(
      harness
        .parse<{
          items: Array<{
            id: string;
            financial?: { outstandingMinor: number; refundableMinor: number };
          }>;
        }>(voidedPageAfterRefund)
        .items.find(({ id }) => id === oldDeposit.id)?.financial,
    ).toMatchObject({ outstandingMinor: 0, refundableMinor: 0 });
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billId: oldDeposit.id, kind: "receipt", amountMinor: 300_000 }),
        expect.objectContaining({ billId: oldDeposit.id, kind: "refund", amountMinor: 300_000 }),
        expect.objectContaining({ billId: newDeposit.id, kind: "receipt", amountMinor: 400_000 }),
      ]),
    );
    expect(harness.state.rental.bills.find(({ id }) => id === newDeposit.id)?.status).toBe(
      "active",
    );
    expect(harness.state.rental.settlements).toHaveLength(0);
  });

  it("起租前修改月租修订原月份账单并保留原收款目标", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const generated = await generateMonth("2026-12", "2026-12-31");
    const beforeBill = structuredClone(
      harness.state.rental.bills.find(({ id }) => id === generated.id),
    );
    if (!beforeBill) throw new Error("Expected the generated December bill");
    if (beforeBill.revision === undefined) throw new Error("Expected the bill revision");
    const rentBefore = beforeBill.lines
      .filter(({ kind }) => kind === "rent_period")
      .reduce((total, line) => total + line.amountMinor, 0);
    const nonRentBefore = beforeBill.amountMinor - rentBefore;
    const detail = await harness.request(`/rental-bills/detail?id=${beforeBill.id}`);
    expect(detail.statusCode, detail.payload).toBe(200);
    const version = harness.parse<{ financial: { version: string } }>(detail).financial.version;
    const receipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: beforeBill.id },
      amountMinor: 20_000,
      occurredOn: "2026-10-31",
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    expect(receipt.statusCode, receipt.payload).toBe(200);

    const corrected = await harness.request("/rental-contracts/update", {
      id: harness.financeContractId,
      rentAmountMinor: 80_000,
    });
    expect(corrected.statusCode, corrected.payload).toBe(200);

    const afterBill = harness.state.rental.bills.find(({ id }) => id === beforeBill.id);
    expect(afterBill).toMatchObject({
      id: beforeBill.id,
      status: "active",
      revision: beforeBill.revision + 1,
      amountMinor: nonRentBefore + 80_000,
    });
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          billId: beforeBill.id,
          kind: "receipt",
          amountMinor: 20_000,
        }),
      ]),
    );
  });

  it("合同日期更正按月账单已保存的固定费快照重算并与结算预览一致", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const feeId = randomUUID();
    const currentTerms = await harness.request(
      `/rental-charges/detail?id=${harness.financeContractId}`,
    );
    expect(currentTerms.statusCode, currentTerms.payload).toBe(200);
    const updatedTerms = await harness.request("/rental-charges/update", {
      contractId: harness.financeContractId,
      expectedVersion: harness.parse<{ version: string }>(currentTerms).version,
      idempotencyKey: randomUUID(),
      reason: "固定费用历史费率",
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [{ id: feeId, name: "网络费", monthlyAmountMinor: 5_000 }],
    });
    expect(updatedTerms.statusCode, updatedTerms.payload).toBe(200);

    const december = await generateMonth(
      "2026-12",
      "2026-12-31",
      { water: "100", electricity: "50" },
      [],
      { fixedFees: [{ id: feeId, monthlyAmountMinor: 5_000 }], reason: "本期固定费用约定" },
    );
    const february = await generateMonth(
      "2027-02",
      "2027-02-28",
      { water: "100", electricity: "50" },
      [],
      { fixedFees: [{ id: feeId, monthlyAmountMinor: 5_000 }], reason: "本期固定费用约定" },
    );
    const originalDecember = harness.state.rental.bills.find(({ id }) => id === december.id);
    const originalFebruary = harness.state.rental.bills.find(({ id }) => id === february.id);
    if (!originalDecember || !originalFebruary)
      throw new Error("Expected the actual fixed-fee monthly bills");
    const originalDecemberDueDate = originalDecember.dueDate;
    const originalDecemberRevision = originalDecember.revision;
    const originalFebruaryDueDate = originalFebruary.dueDate;
    const originalFebruaryRevision = originalFebruary.revision;
    const originalReceiptVersion = await billVersion(december.id);
    const receipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: december.id },
      amountMinor: 10_000,
      occurredOn: "2026-12-31",
      expectedVersion: originalReceiptVersion,
      idempotencyKey: randomUUID(),
    });
    expect(receipt.statusCode, receipt.payload).toBe(200);

    const sameMonthCorrection = await harness.request("/rental-contracts/update", {
      id: harness.financeContractId,
      startDate: "2026-12-16",
    });
    expect(sameMonthCorrection.statusCode, sameMonthCorrection.payload).toBe(200);
    const correctedDecember = harness.state.rental.bills.find(({ id }) => id === december.id);
    expect(correctedDecember).toMatchObject({
      id: december.id,
      dueDate: originalDecemberDueDate,
      revision: (originalDecemberRevision ?? 0) + 1,
    });
    expect(correctedDecember?.lines.find(({ kind }) => kind === "fixed_fee")).toMatchObject({
      amountMinor: 2_581,
      periodStart: "2026-12-16",
      periodEnd: "2026-12-31",
      referenceStart: "2026-12-01",
      referenceEnd: "2026-12-31",
      coveredDays: 16,
      referenceDays: 31,
      feeSnapshot: {
        feeId,
        monthlyAmountMinor: 5_000,
        overrideReason: "本期固定费用约定",
      },
    });
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billId: december.id, kind: "receipt", amountMinor: 10_000 }),
      ]),
    );

    const settlementPreview = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(settlementPreview.statusCode, settlementPreview.payload).toBe(200);
    const previewBody = harness.parse<{
      billChanges: Array<{
        billId: string | null;
        lines: Array<{ kind: string; amountMinor: number }>;
      }>;
    }>(settlementPreview);
    expect(
      previewBody.billChanges
        .find(({ billId }) => billId === december.id)
        ?.lines.find(({ kind }) => kind === "fixed_fee")?.amountMinor,
    ).toBe(2_581);
    const detail = await harness.request(`/rental-bills/detail?id=${december.id}`);
    expect(detail.statusCode, detail.payload).toBe(200);
    expect(
      harness
        .parse<{ lines: Array<{ kind: string; amountMinor: number; feeSnapshot?: unknown }> }>(
          detail,
        )
        .lines.find(({ kind }) => kind === "fixed_fee"),
    ).toMatchObject({ amountMinor: 2_581, feeSnapshot: { overrideReason: "本期固定费用约定" } });
    const februaryAfterStartCorrection = harness.state.rental.bills.find(
      ({ id }) => id === february.id,
    );
    const februaryRevisionAfterStartCorrection = februaryAfterStartCorrection?.revision;

    const endCorrection = await harness.request("/rental-contracts/update", {
      id: harness.financeContractId,
      endDate: "2027-02-16",
    });
    expect(endCorrection.statusCode, endCorrection.payload).toBe(200);
    const correctedFebruary = harness.state.rental.bills.find(({ id }) => id === february.id);
    expect(correctedFebruary).toMatchObject({
      id: february.id,
      dueDate: originalFebruaryDueDate,
      revision: (februaryRevisionAfterStartCorrection ?? originalFebruaryRevision ?? 0) + 1,
    });
    expect(correctedFebruary?.lines.find(({ kind }) => kind === "fixed_fee")).toMatchObject({
      amountMinor: 2_857,
      periodStart: "2027-02-01",
      periodEnd: "2027-02-16",
      coveredDays: 16,
      referenceDays: 28,
      feeSnapshot: { feeId, monthlyAmountMinor: 5_000, overrideReason: "本期固定费用约定" },
    });

    const crossMonthCorrection = await harness.request("/rental-contracts/update", {
      id: harness.financeContractId,
      startDate: "2027-01-01",
    });
    expect(crossMonthCorrection.statusCode, crossMonthCorrection.payload).toBe(200);
    const crossMonthDecember = harness.state.rental.bills.find(({ id }) => id === december.id);
    expect(crossMonthDecember).toMatchObject({ id: december.id, amountMinor: 0 });
    expect(crossMonthDecember?.lines.filter(({ kind }) => kind === "fixed_fee")).toEqual([]);
    expect(crossMonthDecember?.dueDate).toBe(originalDecemberDueDate);
    expect(
      harness.state.rental.cashEntries.some(
        ({ billId, kind, amountMinor }) =>
          billId === december.id && kind === "receipt" && amountMinor === 10_000,
      ),
    ).toBe(true);

    harness.source.today = "2027-02-16";
    const finalInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2027-02-16", reading: "100" },
        { kind: "electricity" as const, readingDate: "2027-02-16", reading: "50" },
      ],
    };
    const finalPreview = await harness.request("/rental-settlements/preview", finalInput);
    expect(finalPreview.statusCode, finalPreview.payload).toBe(200);
    const finalPreviewBody = harness.parse<{
      version: string;
      canConfirm: boolean;
      missingFields: string[];
      finalCostMinor: number;
      billChanges: Array<{ billId: string | null; amountMinor: number }>;
    }>(finalPreview);
    expect(finalPreviewBody).toMatchObject({ canConfirm: true, missingFields: [] });
    expect(finalPreviewBody.billChanges.some(({ billId }) => billId === december.id)).toBe(false);
    expect(finalPreviewBody.finalCostMinor).toBe(
      finalPreviewBody.billChanges.reduce((total, change) => total + change.amountMinor, 0),
    );
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...finalInput,
      expectedVersion: finalPreviewBody.version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(200);
    const confirmedBody = harness.parse<{ id: string; finalCostMinor: number }>(confirmed);
    expect(confirmedBody.finalCostMinor).toBe(finalPreviewBody.finalCostMinor);
    expect(harness.state.rental.settlementBills.map(({ billId }) => billId)).toContain(december.id);
    const settlementDetail = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(settlementDetail.statusCode, settlementDetail.payload).toBe(200);
    expect(
      harness.parse<{
        settlement: { id: string; finalCostMinor: number; balance: { version: string } };
      }>(settlementDetail).settlement,
    ).toMatchObject({ id: confirmedBody.id, finalCostMinor: finalPreviewBody.finalCostMinor });
  });

  it("日期裁剪后保留的月度折扣使原账单为负时返回校验错误并完整回滚", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-12-01", "2027-11-30");
    const feeId = randomUUID();
    const extraFeeId = randomUUID();
    const chargeDetail = await harness.request(
      `/rental-charges/detail?id=${harness.financeContractId}`,
    );
    expect(chargeDetail.statusCode, chargeDetail.payload).toBe(200);
    const updatedCharges = await harness.request("/rental-charges/update", {
      contractId: harness.financeContractId,
      expectedVersion: harness.parse<{ version: string }>(chargeDetail).version,
      idempotencyKey: randomUUID(),
      reason: "建立固定费折扣裁剪回归条件",
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [{ id: feeId, name: "网络费", monthlyAmountMinor: 5_000 }],
    });
    expect(updatedCharges.statusCode, updatedCharges.payload).toBe(200);

    const december = await generateMonth(
      "2026-12",
      "2026-12-31",
      { water: "100", electricity: "50" },
      [{ id: extraFeeId, name: "本期优惠", amountMinor: -1_000, note: "" }],
      { fixedFees: [{ id: feeId, monthlyAmountMinor: 5_000 }], reason: "本期固定费" },
    );
    expect(december.amountMinor).toBe(54_000);
    const originalBill = harness.state.rental.bills.find(({ id }) => id === december.id);
    expect(originalBill).toMatchObject({
      id: december.id,
      type: "monthly",
      status: "active",
      billingMonth: "2026-12",
      dueDate: "2026-12-31",
      amountMinor: 54_000,
    });
    expect(originalBill?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "rent_period", amountMinor: 50_000 }),
        expect.objectContaining({
          kind: "fixed_fee",
          amountMinor: 5_000,
          feeSnapshot: expect.objectContaining({ monthlyAmountMinor: 5_000 }),
        }),
        expect.objectContaining({
          kind: "extra_fee",
          amountMinor: -1_000,
          feeSnapshot: expect.objectContaining({ extraFeeId, origin: "monthly" }),
        }),
        expect.objectContaining({ kind: "water", amountMinor: 0 }),
        expect.objectContaining({ kind: "electricity", amountMinor: 0 }),
      ]),
    );

    const receipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: december.id },
      amountMinor: 10_000,
      occurredOn: "2026-10-31",
      expectedVersion: await billVersion(december.id),
      idempotencyKey: randomUUID(),
    });
    expect(receipt.statusCode, receipt.payload).toBe(200);
    const originalReceipt = harness.state.rental.cashEntries.find(
      ({ billId, kind }) => billId === december.id && kind === "receipt",
    );
    expect(originalReceipt).toMatchObject({ amountMinor: 10_000, occurredOn: "2026-10-31" });

    const snapshot = () =>
      structuredClone({ rental: harness.state.rental, auditLogs: harness.state.auditLogs });
    const beforeCorrection = snapshot();
    const correction = { id: harness.financeContractId, startDate: "2027-01-01" };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rejected = await harness.request("/rental-contracts/update", correction);
      expect(rejected.statusCode, rejected.payload).toBe(400);
      const body = JSON.parse(rejected.payload) as { code: string; message: string };
      expect(body).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(body.message).toContain("修正后的账单金额不能为负数");
      expect(snapshot()).toEqual(beforeCorrection);
    }
  });

  it("起租前取消保留新押金原ID并扣除旧作废来源已退款后待退300000", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const deposit = await generateActualDeposit();
    await confirmActualDeposit(deposit.id);
    const oldSourceBillId = seedVoidedDepositWithReceiptAndRefund(deposit.id, 50_000);

    const cancelled = await harness.request("/rental-contracts/cancel", {
      id: harness.financeContractId,
      reason: "起租前取消",
    });
    expect(cancelled.statusCode, cancelled.payload).toBe(200);
    const originalDepositId = deposit.id;
    expect(harness.state.rental.bills.some((bill) => bill.id === originalDepositId)).toBe(true);
    const cancellation = harness.state.rental.contracts.get(harness.financeContractId);
    if (!cancellation?.cancelledAt) throw new Error("Expected persisted cancellation timestamp");
    const expectedEndDate = organizationDate(cancellation.cancelledAt, harness.source.timezone);
    expect(harness.state.rental.settlements).toHaveLength(1);
    expect(harness.state.rental.settlements[0]).toMatchObject({
      kind: "cancellation",
      effectiveEndDate: expectedEndDate,
      finalCostMinor: 0,
      status: "pending_refund",
    });
    expect(harness.state.rental.bills.some((bill) => bill.id === originalDepositId)).toBe(true);
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          billId: originalDepositId,
          kind: "receipt",
          amountMinor: 300_000,
        }),
        expect.objectContaining({ billId: oldSourceBillId, kind: "receipt", amountMinor: 50_000 }),
        expect.objectContaining({ billId: oldSourceBillId, kind: "refund", amountMinor: 50_000 }),
      ]),
    );
    expect(harness.state.rental.settlementBills.map(({ billId }) => billId).toSorted()).toEqual(
      [oldSourceBillId, originalDepositId].toSorted(),
    );

    const detailBeforeRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailBeforeRefund.statusCode, detailBeforeRefund.payload).toBe(200);
    const publicSettlement = harness.parse<{
      settlement: { id: string; balance: { version: string; refundableMinor: number } };
    }>(detailBeforeRefund).settlement;
    expect(publicSettlement.balance.refundableMinor).toBe(300_000);
    const refund = await harness.request("/rental-refunds/create", {
      target: { kind: "settlement", settlementId: publicSettlement.id },
      occurredOn: expectedEndDate,
      expectedVersion: publicSettlement.balance.version,
      idempotencyKey: randomUUID(),
    });
    expect(refund.statusCode, refund.payload).toBe(200);

    const detailAfterRefund = await harness.request(
      `/rental-settlements/detail?contractId=${harness.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(detailAfterRefund.statusCode, detailAfterRefund.payload).toBe(200);
    expect(
      harness.parse<{
        settlement: {
          status: string;
          balance: { refundableMinor: number; outstandingMinor: number };
        };
      }>(detailAfterRefund).settlement,
    ).toMatchObject({
      status: "settled",
      balance: { refundableMinor: 0, outstandingMinor: 0 },
    });
  });

  it("未来终止可不动财务预约和撤销，结束日前结算确认被拒", async () => {
    harness.source.today = "2026-09-28";
    setContractDates("2026-09-01", "2027-08-31");
    const september = await generateMonth("2026-09", "2026-09-28");
    const beforeReceiptVersion = await billVersion(september.id);
    const partialReceipt = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: september.id },
      amountMinor: 1,
      occurredOn: "2026-09-28",
      expectedVersion: beforeReceiptVersion,
      idempotencyKey: randomUUID(),
    });
    expect(partialReceipt.statusCode, partialReceipt.payload).toBe(200);
    removeLegacyBillAdjustPermission();
    const meterCountBefore = harness.state.rental.meterReadings.length;
    const financialBeforeTermination = structuredClone({
      bills: harness.state.rental.bills,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
    });
    const terminate = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-10-20",
      reason: "未来退租",
    });
    expect(terminate.statusCode, terminate.payload).toBe(200);
    expect(
      structuredClone({
        bills: harness.state.rental.bills,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
      }),
    ).toEqual(financialBeforeTermination);
    expect(harness.state.rental.meterReadings).toHaveLength(meterCountBefore);
    expect(harness.state.rental.bills).toHaveLength(1);
    expect(harness.state.rental.bills[0]).toMatchObject({ id: september.id, status: "active" });
    expect(harness.state.rental.settlements).toHaveLength(0);

    const previewResponse = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
    });
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    expect(
      harness.parse<{ effectiveEndDate: string; canConfirm: boolean }>(previewResponse),
    ).toMatchObject({
      effectiveEndDate: "2026-10-20",
      canConfirm: false,
    });
    seedFutureTerminalReadings("2026-10-20");
    const completeFuturePreviewResponse = await harness.request("/rental-settlements/preview", {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water", readingDate: "2026-10-20", reading: "101" },
        { kind: "electricity", readingDate: "2026-10-20", reading: "51" },
      ],
    });
    expect(completeFuturePreviewResponse.statusCode, completeFuturePreviewResponse.payload).toBe(
      200,
    );
    expect(
      harness.parse<{ canConfirm: boolean; missingFields: string[] }>(
        completeFuturePreviewResponse,
      ),
    ).toMatchObject({ canConfirm: false, missingFields: [] });
    const earlyConfirm = await harness.request("/rental-settlements/confirm", {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water", readingDate: "2026-10-20", reading: "101" },
        { kind: "electricity", readingDate: "2026-10-20", reading: "51" },
      ],
      expectedVersion: harness.parse<{ version: string }>(completeFuturePreviewResponse).version,
      idempotencyKey: randomUUID(),
    });
    expect(earlyConfirm.statusCode).toBe(409);
    expect(harness.state.rental.settlements).toHaveLength(0);

    const spaceId = harness.source.contract.spaces[0]?.spaceId;
    if (!spaceId) throw new Error("Expected the confirmed contract space");
    const conflictQuery = {
      organizationId: testIds.organization,
      propertyId: harness.source.contract.propertyId,
      spaceIds: [spaceId],
      startDate: "2026-10-21",
      endDate: "2027-08-31",
      excludeContractId: harness.financeContractId,
    };
    const competingContract = {
      contractId: randomUUID(),
      contractNumber: "RC-2026-CONFLICT",
      spaceId,
    };
    harness.state.rentalQuery.registerSpaceConflict(conflictQuery, [competingContract]);
    const beforeConflict = structuredClone({
      contract: harness.state.rental.contracts.get(harness.financeContractId),
      bills: harness.state.rental.bills,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      meterReadings: harness.state.rental.meterReadings,
      financeRequests: harness.state.rental.financeRequests,
    });
    const blockedRevoke = await harness.request("/rental-contracts/revoke-termination", {
      id: harness.financeContractId,
      reason: "空间冲突时不可撤销",
    });
    expect(blockedRevoke.statusCode).toBe(409);
    expect(
      structuredClone({
        contract: harness.state.rental.contracts.get(harness.financeContractId),
        bills: harness.state.rental.bills,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        meterReadings: harness.state.rental.meterReadings,
        financeRequests: harness.state.rental.financeRequests,
      }),
    ).toEqual(beforeConflict);
    harness.state.rentalQuery.registerSpaceConflict(conflictQuery, []);

    const revoked = await harness.request("/rental-contracts/revoke-termination", {
      id: harness.financeContractId,
      reason: "撤销预约",
    });
    expect(revoked.statusCode, revoked.payload).toBe(200);
    expect(harness.state.rental.contracts.get(harness.financeContractId)).toMatchObject({
      status: "confirmed",
      terminationDate: null,
    });
    expect(
      structuredClone({
        bills: harness.state.rental.bills,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
      }),
    ).toEqual(financialBeforeTermination);
  });

  it("确认时撤回未来账单，将历史价P→T转入结束月并更新既有读数E前驱", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-09-01", "2026-12-31");
    const october = await generateMonth(
      "2026-10",
      "2026-10-31",
      {
        water: "110",
        electricity: "60",
      },
      [],
      {
        waterUnitPrice: "6.0000",
        electricityUnitPrice: "8.0000",
        reason: "十月历史覆盖价",
      },
    );
    const originalBillRecord = harness.state.rental.bills.find((bill) => bill.id === october.id);
    if (!originalBillRecord) throw new Error("Expected the actual October bill");
    const originalBill = structuredClone(originalBillRecord);
    const originalMeters = originalBill.lines.flatMap((line) => {
      const snapshot = line.feeSnapshot;
      return snapshot?.kind === "water" || snapshot?.kind === "electricity"
        ? [{ kind: snapshot.kind, startId: snapshot.startReadingId, endId: snapshot.endReadingId }]
        : [];
    });
    expect(originalMeters).toHaveLength(2);
    const originalDueDate = originalBill.dueDate;
    const originalRevision = originalBill.revision;
    if (originalRevision === undefined) throw new Error("Expected the original bill revision");
    seedReceipt(originalBill.id, 1);

    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-30",
      reason: "实际终止日位于已计费水电区间内",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);

    const settlementInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "105" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "55" },
      ],
    };
    const preview = await harness.request("/rental-settlements/preview", settlementInput);
    expect(preview.statusCode, preview.payload).toBe(200);
    const previewBody = harness.parse<{ version: string }>(preview);
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...settlementInput,
      expectedVersion: previewBody.version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(200);

    const withdrawnBill = harness.state.rental.bills.find((bill) => bill.id === originalBill.id);
    expect(withdrawnBill).toMatchObject({
      id: originalBill.id,
      billingMonth: "2026-10",
      dueDate: originalDueDate,
      status: "voided",
      amountMinor: 0,
      revision: originalRevision + 1,
      lines: [],
    });
    const endingMonthBill = harness.state.rental.bills.find(
      ({ type, billingMonth, status }) =>
        type === "monthly" && billingMonth === "2026-09" && status === "active",
    );
    expect(endingMonthBill).toMatchObject({ billingMonth: "2026-09", dueDate: "2026-09-30" });
    const oldHistory = await harness.request(
      `/rental-bills/revisions?billId=${originalBill.id}&page=1&pageSize=20`,
    );
    expect(oldHistory.statusCode, oldHistory.payload).toBe(200);
    expect(
      harness.parse<{ items: Array<{ amountMinor: number; linesSnapshot: unknown[] }> }>(oldHistory)
        .items,
    ).toEqual([
      expect.objectContaining({
        amountMinor: originalBill.amountMinor,
        linesSnapshot: originalBill.lines,
      }),
    ]);
    expect(harness.state.rental.cashEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billId: originalBill.id, kind: "receipt", amountMinor: 1 }),
      ]),
    );
    for (const original of originalMeters) {
      const terminal = harness.state.rental.meterReadings.find(
        (reading) =>
          reading.contractId === harness.financeContractId &&
          reading.kind === original.kind &&
          reading.readingDate === "2026-09-30",
      );
      const existingEnd = harness.state.rental.meterReadings.find(
        (reading) => reading.id === original.endId,
      );
      expect(terminal).toMatchObject({
        readingDate: "2026-09-30",
        predecessorId: original.startId,
      });
      expect(existingEnd).toMatchObject({
        id: original.endId,
        readingDate: "2026-10-31",
        predecessorId: terminal?.id,
        revision: 2,
      });
      expect(
        endingMonthBill?.lines.some((line) => {
          const snapshot = line.feeSnapshot;
          return (
            snapshot?.kind === original.kind &&
            snapshot.startReadingId === original.startId &&
            snapshot.endReadingId === terminal?.id &&
            snapshot.endDate === "2026-09-30"
          );
        }),
      ).toBe(true);
      expect(
        endingMonthBill?.lines.find((line) => {
          const snapshot = line.feeSnapshot;
          return snapshot?.kind === original.kind && snapshot.endReadingId === terminal?.id;
        }),
      ).toMatchObject({
        amountMinor: original.kind === "water" ? 3_000 : 4_000,
        feeSnapshot: {
          unitPrice: original.kind === "water" ? "6.0000" : "8.0000",
          overrideReason: "十月历史覆盖价",
        },
      });
    }
  });

  it("拒绝高于后继水表读数的终值预览与确认且不写入任何结算数据", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-09-01", "2026-12-31");
    const october = await generateMonth("2026-10", "2026-10-31", {
      water: "110",
      electricity: "60",
    });
    seedReceipt(october.id, 1);
    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-30",
      reason: "验证结算终值不能超过已保存后继读数",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);

    const validInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "105" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "55" },
      ],
    };
    const validPreview = await harness.request("/rental-settlements/preview", validInput);
    expect(validPreview.statusCode, validPreview.payload).toBe(200);
    const expectedVersion = harness.parse<{ version: string }>(validPreview).version;
    const before = structuredClone({
      contract: harness.state.rental.contracts.get(harness.financeContractId),
      meterReadings: harness.state.rental.meterReadings,
      meterReadingRevisions: harness.state.rental.meterReadingRevisions,
      bills: harness.state.rental.bills,
      billRevisions: harness.state.rental.billRevisions,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
      financeRequests: harness.state.rental.financeRequests,
      auditEntries: harness.state.rental.auditEntries,
      auditLogs: harness.state.auditLogs,
    });
    const invalidInput = {
      ...validInput,
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "120" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "55" },
      ],
    };

    const preview = await harness.request("/rental-settlements/preview", invalidInput);
    expect(preview.statusCode, preview.payload).toBe(400);
    expect(JSON.parse(preview.payload).code).toBe("VALIDATION_FAILED");
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...invalidInput,
      expectedVersion,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode, confirmed.payload).toBe(400);
    expect(JSON.parse(confirmed.payload).code).toBe("VALIDATION_FAILED");
    expect(
      structuredClone({
        contract: harness.state.rental.contracts.get(harness.financeContractId),
        meterReadings: harness.state.rental.meterReadings,
        meterReadingRevisions: harness.state.rental.meterReadingRevisions,
        bills: harness.state.rental.bills,
        billRevisions: harness.state.rental.billRevisions,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
        financeRequests: harness.state.rental.financeRequests,
        auditEntries: harness.state.rental.auditEntries,
        auditLogs: harness.state.auditLogs,
      }),
    ).toEqual(before);
  });

  it("末次读数插入、原账单修订和E前驱更新在审计失败时全部回滚", async () => {
    harness.source.today = "2026-10-31";
    setContractDates("2026-09-01", "2026-12-31");
    const october = await generateMonth("2026-10", "2026-10-31", {
      water: "110",
      electricity: "60",
    });
    seedReceipt(october.id, 1);
    const terminated = await harness.request("/rental-contracts/terminate", {
      id: harness.financeContractId,
      terminationDate: "2026-09-30",
      reason: "验证表计末值事务回滚",
    });
    expect(terminated.statusCode, terminated.payload).toBe(200);
    const settlementInput = {
      contractId: harness.financeContractId,
      extraFees: [],
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-09-30", reading: "105" },
        { kind: "electricity" as const, readingDate: "2026-09-30", reading: "55" },
      ],
    };
    const preview = await harness.request("/rental-settlements/preview", settlementInput);
    expect(preview.statusCode, preview.payload).toBe(200);
    const before = structuredClone({
      meterReadings: harness.state.rental.meterReadings,
      meterReadingRevisions: harness.state.rental.meterReadingRevisions,
      bills: harness.state.rental.bills,
      billRevisions: harness.state.rental.billRevisions,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
      financeRequests: harness.state.rental.financeRequests,
      auditEntries: harness.state.rental.auditEntries,
      auditLogs: harness.state.auditLogs,
    });
    harness.state.failNextRequiredAuditAppendAfterPersist = true;
    const confirmed = await harness.request("/rental-settlements/confirm", {
      ...settlementInput,
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    });
    expect(confirmed.statusCode).toBe(500);
    expect(
      structuredClone({
        meterReadings: harness.state.rental.meterReadings,
        meterReadingRevisions: harness.state.rental.meterReadingRevisions,
        bills: harness.state.rental.bills,
        billRevisions: harness.state.rental.billRevisions,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
        financeRequests: harness.state.rental.financeRequests,
        auditEntries: harness.state.rental.auditEntries,
        auditLogs: harness.state.auditLogs,
      }),
    ).toEqual(before);
  });

  it("取消写入结算后审计失败会回滚合同、账单、投影和现金", async () => {
    setContractDates("2026-12-01", "2027-11-30");
    const deposit = await generateActualDeposit();
    await confirmActualDeposit(deposit.id);
    const before = structuredClone({
      contract: harness.state.rental.contracts.get(harness.financeContractId),
      bills: harness.state.rental.bills,
      cashEntries: harness.state.rental.cashEntries,
      settlements: harness.state.rental.settlements,
      settlementBills: harness.state.rental.settlementBills,
      settlementRevisions: harness.state.rental.settlementRevisions,
      financeRequests: harness.state.rental.financeRequests,
      auditEntries: harness.state.rental.auditEntries,
      auditLogs: harness.state.auditLogs,
    });
    harness.state.failNextRequiredAuditAppendAfterPersist = true;

    const failed = await harness.request("/rental-contracts/cancel", {
      id: harness.financeContractId,
      reason: "审计故障时不得部分提交",
    });
    expect(failed.statusCode).toBe(500);
    expect(
      structuredClone({
        contract: harness.state.rental.contracts.get(harness.financeContractId),
        bills: harness.state.rental.bills,
        cashEntries: harness.state.rental.cashEntries,
        settlements: harness.state.rental.settlements,
        settlementBills: harness.state.rental.settlementBills,
        settlementRevisions: harness.state.rental.settlementRevisions,
        financeRequests: harness.state.rental.financeRequests,
        auditEntries: harness.state.rental.auditEntries,
        auditLogs: harness.state.auditLogs,
      }),
    ).toEqual(before);

    const retried = await harness.request("/rental-contracts/cancel", {
      id: harness.financeContractId,
      reason: "审计故障后重试",
    });
    expect(retried.statusCode, retried.payload).toBe(200);
    expect(harness.state.rental.settlements).toHaveLength(1);
  });

  async function generateMonth(
    billingMonth: string,
    readingDate: string,
    readings: { water: string; electricity: string } = { water: "100", electricity: "50" },
    extraFees: Array<{ id: string; name: string; amountMinor: number; note: string }> = [],
    overrides?: {
      waterUnitPrice?: string;
      electricityUnitPrice?: string;
      fixedFees?: Array<{ id: string; monthlyAmountMinor: number }>;
      reason: string;
    },
  ) {
    const input = {
      contractId: harness.financeContractId,
      billingMonth,
      dueDate: readingDate,
      readings: [
        { kind: "water" as const, readingDate, reading: readings.water },
        { kind: "electricity" as const, readingDate, reading: readings.electricity },
      ],
      extraFees,
      ...(overrides ? { overrides } : {}),
    };
    const preview = await harness.request("/rental-monthly-bills/preview", input);
    expect(preview.statusCode, preview.payload).toBe(200);
    const generated = await harness.request("/rental-monthly-bills/generate", {
      ...input,
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    });
    expect(generated.statusCode, generated.payload).toBe(200);
    return harness.parse<{ id: string; amountMinor: number }>(generated);
  }

  async function generateActualDeposit(expectedAmountMinor = 300_000) {
    const contractId = harness.financeContractId;
    const input = {
      contractId,
      scope: "deposits" as const,
      depositDueDates: {} as Record<string, string>,
    };
    const blank = await harness.request("/rental-bills/preview", input);
    expect(blank.statusCode, blank.payload).toBe(200);
    const blankPreview = harness.parse<{ missingDepositSourceKeys: string[] }>(blank);
    for (const key of blankPreview.missingDepositSourceKeys)
      input.depositDueDates[key] = "2026-09-01";
    const preview = await harness.request("/rental-bills/preview", input);
    expect(preview.statusCode, preview.payload).toBe(200);
    const generated = await harness.request("/rental-bills/generate", {
      ...input,
      expectedVersion: harness.parse<{ version: string }>(preview).version,
      idempotencyKey: randomUUID(),
    });
    expect(generated.statusCode, generated.payload).toBe(200);
    const bill = harness.state.rental.bills.find(
      (item) => item.type === "deposit" && item.status === "active",
    );
    if (!bill) throw new Error("Expected an actual generated deposit bill");
    expect(bill.amountMinor).toBe(expectedAmountMinor);
    return bill;
  }

  async function confirmActualDeposit(billId: string) {
    const detail = await harness.request(`/rental-bills/detail?id=${billId}`);
    expect(detail.statusCode, detail.payload).toBe(200);
    const bill = harness.parse<{ financial: { version: string } }>(detail);
    const response = await harness.request("/rental-receipts/confirm-deposit", {
      billId,
      occurredOn: "2026-09-01",
      expectedVersion: bill.financial.version,
      idempotencyKey: randomUUID(),
    });
    expect(response.statusCode, response.payload).toBe(200);
  }

  function prepareContract(h: typeof harness) {
    h.source.today = "2026-10-31";
    const contractId = h.financeContractId;
    const contract = h.state.rental.contracts.get(contractId);
    if (!contract) throw new Error("Test contract missing");
    h.state.rental.contracts.set(contractId, {
      ...contract,
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      rentAmountMinor: 50_000,
      paymentIntervalMonths: 1,
    });
    const terms = h.state.rental.chargeTerms.get(`${testIds.organization}/${contractId}`);
    if (terms)
      h.state.rental.chargeTerms.set(`${testIds.organization}/${contractId}`, {
        ...terms,
        fixedFees: [],
      });
    const depositTerms = h.state.rental.deposits.get(contractId);
    const depositTerm = depositTerms?.[0];
    if (!depositTerm) throw new Error("Test contract deposit term missing");
    h.state.rental.deposits.set(contractId, [
      {
        ...depositTerm,
        type: "rental",
        calculationMode: "fixed_amount",
        fixedAmountMinor: 300_000,
        rentMultiple: null,
        finalAmountMinor: 300_000,
        sortOrder: 0,
      },
    ]);
  }

  function removeLegacyBillAdjustPermission() {
    const member = [...harness.state.members.values()].find(
      (item) => item.organizationId === testIds.organization && item.userId === testIds.ownerUser,
    );
    const role = member && harness.state.roles.get(member.roleId);
    if (!role) throw new Error("Test owner role missing");
    role.permissions = role.permissions.filter(
      (permission) => permission !== "rental_bills:adjust",
    );
  }

  function setContractEnd(endDate: string) {
    const contractId = harness.financeContractId;
    const contract = harness.state.rental.contracts.get(contractId);
    if (!contract) throw new Error("Test contract missing");
    harness.state.rental.contracts.set(contractId, { ...contract, endDate });
  }

  function setContractDates(startDate: string, endDate: string) {
    const contractId = harness.financeContractId;
    const contract = harness.state.rental.contracts.get(contractId);
    if (!contract) throw new Error("Test contract missing");
    harness.state.rental.contracts.set(contractId, { ...contract, startDate, endDate });
    Object.assign(harness.source.contract, { startDate, endDate });
  }

  function seedFutureTerminalReadings(readingDate: string) {
    for (const [kind, reading] of [
      ["water", "101"],
      ["electricity", "51"],
    ] as const) {
      const baseline = harness.state.rental.meterReadings.find(
        (item) =>
          item.contractId === harness.financeContractId &&
          item.kind === kind &&
          item.predecessorId === null,
      );
      if (!baseline) throw new Error(`Expected the ${kind} baseline`);
      const billedEnd = harness.state.rental.bills
        .filter(
          (bill) =>
            bill.contractId === harness.financeContractId &&
            bill.type === "monthly" &&
            bill.status === "active" &&
            bill.modelVersion === 2,
        )
        .flatMap((bill) => bill.lines.map((line) => line.feeSnapshot))
        .filter(
          (
            snapshot,
          ): snapshot is Extract<NonNullable<typeof snapshot>, { kind: "water" | "electricity" }> =>
            snapshot?.kind === kind,
        )
        .toSorted((left, right) => left.endDate.localeCompare(right.endDate))
        .at(-1);
      const predecessorId = billedEnd?.endReadingId ?? baseline.id;
      harness.state.rental.meterReadings.push({
        ...structuredClone(baseline),
        id: randomUUID(),
        readingDate,
        reading,
        predecessorId,
        revision: 1,
        reason: "未来终止读数测试fixture",
      });
    }
  }

  async function billVersion(billId: string) {
    const detail = await harness.request(`/rental-bills/detail?id=${billId}`);
    expect(detail.statusCode, detail.payload).toBe(200);
    return harness.parse<{ financial: { version: string } }>(detail).financial.version;
  }

  function seedReceipt(billId: string, amountMinor: number) {
    harness.state.rental.cashEntries.push({
      id: randomUUID(),
      organizationId: testIds.organization,
      contractId: harness.financeContractId,
      billId,
      settlementId: null,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor,
      occurredOn: "2026-10-31",
      note: null,
      createdByUserId: testIds.ownerUser,
      createdAt: new Date("2026-10-31T12:00:00.000Z"),
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    });
  }

  function seedVoidedDepositWithReceiptAndRefund(currentDepositId: string, amountMinor: number) {
    const current = harness.state.rental.bills.find((bill) => bill.id === currentDepositId);
    if (!current) throw new Error("Expected the current generated deposit bill");
    const oldSourceBillId = randomUUID();
    harness.state.rental.bills.push({
      ...structuredClone(current),
      id: oldSourceBillId,
      billNumber: "RB-OLD-VOIDED-DEPOSIT",
      status: "voided",
      amountMinor,
      lines: current.lines.map((line) => ({ ...line, amountMinor })),
      organizationId: testIds.organization,
    });
    for (const [kind, purpose] of [
      ["receipt", "deposit_receipt"],
      ["refund", "refund"],
    ] as const) {
      harness.state.rental.cashEntries.push({
        id: randomUUID(),
        organizationId: testIds.organization,
        contractId: harness.financeContractId,
        billId: oldSourceBillId,
        settlementId: null,
        kind,
        purpose,
        amountMinor,
        occurredOn: "2026-08-31",
        note: null,
        createdByUserId: testIds.ownerUser,
        createdAt: new Date("2026-08-31T12:00:00.000Z"),
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      });
    }
    return oldSourceBillId;
  }
});

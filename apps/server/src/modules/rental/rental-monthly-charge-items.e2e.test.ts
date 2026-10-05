import { randomUUID } from "node:crypto";
import type {
  GenerateRentalMonthlyBillRequest,
  RentalBillDetail,
  RentalBillRevisionInput,
  RentalBillRevisionPreview,
  RentalCashEntry,
  RentalChargeTerms,
  RentalContractDetail,
  RentalMonthlyBillPreview,
} from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { testIds } from "../../test/auth-test-helpers.js";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";

const feeId = "00000000-0000-4000-8000-000000000091";

describe("月度收费事项完整 HTTP 流程", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;

  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
    const owner = [...harness.state.roles.values()].find(({ key }) => key === "owner");
    if (!owner) throw new Error("Rental monthly charge test owner role unavailable");
    owner.permissions.push("rental_monthly_bills:adjust");
    harness.state.rental.contractCounters.set(`${testIds.organization}/2026`, 1);
  });

  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it("从合同创建到收费更正保留历史标准、收款事实和精确可退差额", async () => {
    const created = await harness.request("/rental-contracts/create-confirmed", {
      propertyId: rentalTestIds.property,
      startDate: "2026-10-16",
      endDate: "2026-12-31",
      rentAmountMinor: 10_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      spaces: [{ spaceId: rentalTestIds.childSpace }],
      parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
      depositTerms: [],
      chargeSetup: {
        chargeTerms: {
          waterCollectionEnabled: true,
          electricityCollectionEnabled: false,
          waterUnitPrice: "3.0000",
          electricityUnitPrice: "0.0000",
          fixedFees: [{ id: feeId, name: "管理费", monthlyAmountMinor: 5_000 }],
        },
        baselineReadings: [],
      },
    });
    expect(created.statusCode, created.payload).toBe(200);
    const contract = harness.parse<RentalContractDetail>(created);
    expect(contract).toMatchObject({
      lifecycleStatus: "confirmed",
      billingMode: "monthly_settlement",
      startDate: "2026-10-16T00:00:00",
      endDate: "2026-12-31T23:59:59",
      rentAmountMinor: 10_000,
      contractNumber: "RC-2026-000002",
    });
    expect(contract.id).not.toBe(harness.financeContractId);
    const terms = await getTerms(contract.id);
    expect(terms).toMatchObject({
      waterCollectionEnabled: true,
      electricityCollectionEnabled: false,
      fixedFees: [{ id: feeId, monthlyAmountMinor: 5_000 }],
    });

    const octoberInput: Omit<
      GenerateRentalMonthlyBillRequest,
      "expectedVersion" | "idempotencyKey"
    > = {
      contractId: contract.id,
      billingMonth: "2026-10",
      dueDate: "2026-10-31",
      readings: [{ kind: "water", readingDate: "2026-10-31", reading: "10" }],
      extraFees: [],
    };
    const incompleteResponse = await harness.request("/rental-monthly-bills/preview", octoberInput);
    expect(incompleteResponse.statusCode, incompleteResponse.payload).toBe(200);
    const incomplete = harness.parse<RentalMonthlyBillPreview>(incompleteResponse);
    expect(incomplete.canConfirm).toBe(false);
    expect(incomplete.missingFields).toEqual(["waterBaseline"]);
    const beforeBlockedGeneration = cloneRentalTestState(harness.state.rental);
    const blocked = await harness.request("/rental-monthly-bills/generate", {
      ...octoberInput,
      expectedVersion: incomplete.version,
      idempotencyKey: randomUUID(),
    });
    expect(blocked.statusCode, blocked.payload).toBe(400);
    expect(JSON.parse(blocked.payload).code).toBe("VALIDATION_FAILED");
    expect(harness.state.rental).toEqual(beforeBlockedGeneration);

    const meters = await harness.request(`/rental-meters/detail?id=${contract.id}`);
    expect(meters.statusCode, meters.payload).toBe(200);
    const savedBaseline = await harness.request("/rental-meters/update", {
      contractId: contract.id,
      readings: [{ kind: "water", readingDate: "2026-10-16", reading: "0" }],
      expectedVersion: harness.parse<{ version: string }>(meters).version,
      idempotencyKey: randomUUID(),
      reason: "交房登记水表零底数",
    });
    expect(savedBaseline.statusCode, savedBaseline.payload).toBe(200);
    const october = await generate(octoberInput);
    expect(october).toMatchObject({
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      billingMonth: "2026-10",
      amountMinor: 13_161,
      modelVersion: 2,
      revision: 1,
    });
    expect(october.lines.filter(({ kind }) => kind === "rent_period")).toMatchObject([
      { amountMinor: 5_161 },
    ]);
    expect(october.lines.filter(({ kind }) => kind === "water")).toMatchObject([
      { amountMinor: 3_000, feeSnapshot: { startReading: "0", endReading: "10" } },
    ]);
    expect(october.lines.some(({ kind }) => kind === "electricity")).toBe(false);
    expect(fixedFee(october)).toMatchObject({
      amountMinor: 5_000,
      periodStart: "2026-10-16",
      periodEnd: "2026-10-31",
      coveredDays: 16,
      referenceDays: 31,
      feeSnapshot: { feeId, monthlyAmountMinor: 5_000, calculationMode: "full_month" },
    });
    expect(
      harness.state.rental.meterReadings
        .filter(({ contractId }) => contractId === contract.id)
        .map(({ kind }) => kind),
    ).toEqual(["water", "water"]);

    const standardUpdate = await harness.request("/rental-charges/update", {
      contractId: contract.id,
      expectedVersion: (await getTerms(contract.id)).version,
      idempotencyKey: randomUUID(),
      reason: "下期管理费调整为三十元",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: false,
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "0.0000",
      fixedFees: [{ id: feeId, name: "管理费", monthlyAmountMinor: 3_000 }],
    });
    expect(standardUpdate.statusCode, standardUpdate.payload).toBe(200);
    expect(fixedFee(await getBill(october.id))).toEqual(fixedFee(october));
    const november = await generate({
      contractId: contract.id,
      billingMonth: "2026-11",
      dueDate: "2026-11-30",
      readings: [{ kind: "water", readingDate: "2026-11-30", reading: "10" }],
      extraFees: [],
    });
    expect(november.amountMinor).toBe(13_000);
    expect(fixedFee(november)).toMatchObject({
      amountMinor: 3_000,
      feeSnapshot: { monthlyAmountMinor: 3_000, calculationMode: "full_month" },
    });

    await adjust(november.id, "edit_unpaid", { feeId, action: "set_amount", amountMinor: 2_000 });
    const edited = await getBill(november.id);
    expect(edited.amountMinor).toBe(12_000);
    expect(fixedFee(edited)).toMatchObject({
      amountMinor: 2_000,
      feeSnapshot: { calculationMode: "manual_amount" },
    });
    await adjust(november.id, "edit_unpaid", { feeId, action: "set_amount", amountMinor: 0 });
    const zeroFee = await getBill(november.id);
    expect(zeroFee.amountMinor).toBe(10_000);
    expect(fixedFee(zeroFee)).toMatchObject({
      amountMinor: 0,
      feeSnapshot: { feeId, calculationMode: "manual_amount" },
    });
    await adjust(november.id, "edit_unpaid", { feeId, action: "remove" });
    const removed = await getBill(november.id);
    expect(removed.amountMinor).toBe(10_000);
    expect(fixedFee(removed)).toBeUndefined();
    expect((await getTerms(contract.id)).fixedFees).toEqual([
      { id: feeId, name: "管理费", monthlyAmountMinor: 3_000 },
    ]);
    expect((await getBill(october.id)).lines).toEqual(october.lines);

    const historyResponse = await harness.request(
      `/rental-bills/revisions?billId=${november.id}&page=1&pageSize=100`,
    );
    expect(historyResponse.statusCode, historyResponse.payload).toBe(200);
    const history = harness.parse<{
      total: number;
      items: Array<{
        revision: number;
        amountMinor: number;
        linesSnapshot: RentalBillDetail["lines"];
      }>;
    }>(historyResponse);
    expect(history.total).toBe(3);
    expect(history.items.map(({ amountMinor }) => amountMinor)).toEqual([10_000, 12_000, 13_000]);
    expect(
      history.items[0]?.linesSnapshot.find(({ kind }) => kind === "fixed_fee")?.amountMinor,
    ).toBe(0);
    expect(
      history.items[1]?.linesSnapshot.find(({ kind }) => kind === "fixed_fee")?.amountMinor,
    ).toBe(2_000);

    const octoberBeforeReceipt = await getBill(october.id);
    const receiptResponse = await harness.request("/rental-receipts/create", {
      target: { kind: "bill", billId: october.id },
      amountMinor: 13_161,
      occurredOn: "2026-10-31",
      expectedVersion: octoberBeforeReceipt.financial?.version,
      idempotencyKey: randomUUID(),
      note: "十月账单全额收清",
    });
    expect(receiptResponse.statusCode, receiptResponse.payload).toBe(200);
    const receipt = harness.parse<RentalCashEntry>(receiptResponse);
    const cashBeforeCorrection = structuredClone(harness.state.rental.cashEntries);
    const staleEdit = await harness.request("/rental-monthly-bills/adjust-preview", {
      billId: october.id,
      expectedVersion: "preview-seed",
      mode: "edit_unpaid",
      fixedFeeAdjustments: [{ feeId, action: "set_amount", amountMinor: 3_000 }],
      reason: "已收款不能使用未收款编辑",
    });
    expect(staleEdit.statusCode, staleEdit.payload).toBe(409);

    const correctedPreview = await adjust(october.id, "correction", {
      feeId,
      action: "set_amount",
      amountMinor: 3_000,
    });
    expect(correctedPreview.affectedBills).toEqual([
      { billId: october.id, beforeAmountMinor: 13_161, afterAmountMinor: 11_161 },
    ]);
    const corrected = await getBill(october.id);
    expect(corrected.amountMinor).toBe(11_161);
    expect(corrected.financial).toMatchObject({
      receivedMinor: 13_161,
      refundedMinor: 0,
      netReceivedMinor: 13_161,
      outstandingMinor: 0,
      refundableMinor: 2_000,
      state: "refundable",
    });
    expect(harness.state.rental.cashEntries).toEqual(cashBeforeCorrection);
    const cashResponse = await harness.request(`/rental-cash/list?kind=bill&billId=${october.id}`);
    expect(cashResponse.statusCode, cashResponse.payload).toBe(200);
    expect(harness.parse<{ total: number; items: RentalCashEntry[] }>(cashResponse)).toMatchObject({
      total: 1,
      items: [receipt],
    });
    expect((await getBill(november.id)).lines).toEqual(removed.lines);
    expect((await getTerms(contract.id)).fixedFees[0]?.monthlyAmountMinor).toBe(3_000);
  });

  async function getTerms(contractId: string): Promise<RentalChargeTerms> {
    const response = await harness.request(`/rental-charges/detail?id=${contractId}`);
    expect(response.statusCode, response.payload).toBe(200);
    return harness.parse<RentalChargeTerms>(response);
  }

  async function getBill(billId: string): Promise<RentalBillDetail> {
    const response = await harness.request(`/rental-bills/detail?id=${billId}`);
    expect(response.statusCode, response.payload).toBe(200);
    return harness.parse<RentalBillDetail>(response);
  }

  async function generate(
    input: Omit<GenerateRentalMonthlyBillRequest, "expectedVersion" | "idempotencyKey">,
  ): Promise<RentalBillDetail> {
    const previewResponse = await harness.request("/rental-monthly-bills/preview", input);
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<RentalMonthlyBillPreview>(previewResponse);
    expect(preview.canConfirm).toBe(true);
    expect(preview.missingFields).toEqual([]);
    const response = await harness.request("/rental-monthly-bills/generate", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(response.statusCode, response.payload).toBe(200);
    return harness.parse<RentalBillDetail>(response);
  }

  async function adjust(
    billId: string,
    mode: RentalBillRevisionInput["mode"],
    adjustment: NonNullable<RentalBillRevisionInput["fixedFeeAdjustments"]>[number],
  ): Promise<RentalBillRevisionPreview> {
    const input: RentalBillRevisionInput = {
      billId,
      mode,
      expectedVersion: "preview-seed",
      fixedFeeAdjustments: [adjustment],
      reason: mode === "edit_unpaid" ? "仅编辑本期管理费" : "已收款账单管理费核对更正",
    };
    const previewResponse = await harness.request("/rental-monthly-bills/adjust-preview", input);
    expect(previewResponse.statusCode, previewResponse.payload).toBe(200);
    const preview = harness.parse<RentalBillRevisionPreview>(previewResponse);
    const adjusted = await harness.request("/rental-monthly-bills/adjust", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(adjusted.statusCode, adjusted.payload).toBe(200);
    expect(harness.parse<RentalBillRevisionPreview>(adjusted)).toEqual(preview);
    return preview;
  }
});

function fixedFee(bill: RentalBillDetail): RentalBillDetail["lines"][number] | undefined {
  return bill.lines.find(
    ({ feeSnapshot }) => feeSnapshot?.kind === "fixed_fee" && feeSnapshot.feeId === feeId,
  );
}

import { randomUUID } from "node:crypto";
import type {
  RentalBillDetail,
  RentalPeriodBillContext,
  RentalPeriodBillPreview,
  RentalSettlementPreview,
} from "@xpense/shared";
import { expect } from "vitest";
import { createRentalFinanceHttpHarness } from "./rental-finance-http-harness.js";
/** 固定账期的真实HTTP财务流程；测试仓储仍使用可回滚内存状态。 */
export async function createPeriodHttpScenario() {
  const h = await createRentalFinanceHttpHarness();
  h.source.today = "2026-12-04";
  const id = h.financeContractId;
  const header = h.state.rental.contracts.get(id)!;
  Object.assign(header, {
    startDate: "2026-10-05T00:00:00",
    endDate: "2026-12-04T23:59:59",
    rentAmountMinor: 300000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
  });
  const terms = h.state.rental.chargeTerms.get(`${header.organizationId}/${id}`)!;
  Object.assign(terms, {
    waterUnitPrice: "3.0000",
    electricityUnitPrice: "4.0000",
    fixedFees: [{ id: randomUUID(), name: "管理费", periodAmountMinor: 10000 }],
  });
  for (const reading of h.state.rental.meterReadings) {
    reading.reading = reading.kind === "water" ? "3500" : "50";
  }
  async function ok<T>(url: string, input?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
    const response = await h.request(url, input, undefined, method);
    expect(response.statusCode, response.payload).toBe(200);
    return h.parse<T>(response);
  }
  const detail = (billId: string) =>
    ok<RentalBillDetail>(`/rental-bills/detail?id=${billId}`, undefined, "GET");
  async function generate(
    water: string,
    extraFees: import("@xpense/shared").RentalExtraFeeInput[] = [],
  ) {
    const context = await ok<RentalPeriodBillContext>(
      `/rental-period-bills/context?contractId=${id}`,
      undefined,
      "GET",
    );
    const input = {
      contractId: id,
      periodStart: context.nextPeriod!.periodStart,
      dueDate: context.defaultDueDate!,
      readings: context.defaultReadings.map((reading) => ({
        ...reading,
        reading: reading.kind === "water" ? water : reading.reading,
      })),
      extraFees,
    };
    const preview = await ok<RentalPeriodBillPreview>("/rental-period-bills/preview", input);
    const dto = { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() };
    return { dto, bill: await ok<RentalBillDetail>("/rental-period-bills/generate", dto) };
  }
  async function receipt(billId: string, amountMinor: number) {
    const bill = await detail(billId);
    return ok<import("@xpense/shared").RentalCashEntry>("/rental-receipts/create", {
      target: { kind: "bill", billId },
      amountMinor,
      occurredOn: "2026-12-04",
      expectedVersion: bill.financial!.version,
      idempotencyKey: randomUUID(),
    });
  }
  async function voidBill(billId: string) {
    const bill = await detail(billId);
    return ok<RentalBillDetail>("/rental-period-bills/void", {
      billId,
      reason: "核对读数后重开",
      expectedVersion: bill.version,
      idempotencyKey: randomUUID(),
    });
  }
  const settlementInput = (extraFees: import("@xpense/shared").RentalExtraFeeInput[] = []) => ({
    contractId: id,
    extraFees,
    finalReadings: [
      { kind: "water" as const, reading: "3700" },
      { kind: "electricity" as const, reading: "50" },
    ],
  });
  const previewSettlement = (input = settlementInput()) =>
    ok<RentalSettlementPreview>("/rental-settlements/preview", input);
  return {
    h,
    id,
    header,
    terms,
    ok,
    detail,
    generate,
    receipt,
    voidBill,
    settlementInput,
    previewSettlement,
  };
}

import { randomUUID } from "node:crypto";
import type { RentalBillDetail, RentalSettlementDetail } from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createPeriodHttpScenario } from "../../test/rental-period-http-fixtures.js";

describe("合同账期到最终退款的完整HTTP流程", () => {
  let scenario: Awaited<ReturnType<typeof createPeriodHttpScenario>>;
  afterEach(async () => {
    if (scenario) await scenario.h.app.close();
  });
  it("底数→两期→收款撤销→逐期作废重开→独立退租费用→实际退款归零", async () => {
    scenario = await createPeriodHttpScenario();
    const s = scenario;
    const first = await s.generate("3600");
    const second = await s.generate("3680");
    expect(first.bill.amountMinor).toBe(340000);
    expect(second.bill.amountMinor).toBe(334000);
    const count = s.h.state.rental.bills.length;
    const receipt = await s.receipt(second.bill.id, 334000);
    const paid = await s.detail(second.bill.id);
    expect(paid.canVoid).toBe(false);
    expect(
      (
        await s.h.request("/rental-period-bills/void", {
          billId: paid.id,
          reason: "重开",
          expectedVersion: paid.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    await s.ok("/rental-receipts/revoke", {
      entryId: receipt.id,
      reason: "先撤销收款",
      expectedVersion: paid.financial!.version,
      idempotencyKey: randomUUID(),
    });
    await s.voidBill(second.bill.id);
    expect((await s.ok<RentalBillDetail>("/rental-period-bills/generate", second.dto)).status).toBe(
      "voided",
    );
    const context = await s.ok<import("@xpense/shared").RentalPeriodBillContext>(
      `/rental-period-bills/context?contractId=${s.id}`,
      undefined,
      "GET",
    );
    expect(context.nextPeriod?.periodStart).toBe("2026-11-05");
    expect(context.defaultReadings.find((item) => item.kind === "water")?.reading).toBe("3600");
    const reopened = await s.generate("3650");
    expect(reopened.bill.id).not.toBe(second.bill.id);
    expect(reopened.bill.amountMinor).toBe(325000);
    await s.receipt(first.bill.id, 340000);
    await s.receipt(reopened.bill.id, 325000);
    const depositInput = {
      contractId: s.id,
      scope: "deposits",
      depositDueDates: {} as Record<string, string>,
    };
    const missing = await s.ok<import("@xpense/shared").RentalBillPreview>(
      "/rental-bills/preview",
      depositInput,
    );
    for (const key of missing.missingDepositSourceKeys)
      depositInput.depositDueDates[key] = "2026-10-05";
    const ready = await s.ok<import("@xpense/shared").RentalBillPreview>(
      "/rental-bills/preview",
      depositInput,
    );
    await s.ok("/rental-bills/generate", {
      ...depositInput,
      expectedVersion: ready.version,
      idempotencyKey: randomUUID(),
    });
    for (const deposit of s.h.state.rental.bills.filter((bill) => bill.type === "deposit")) {
      const detail = await s.detail(deposit.id);
      await s.ok("/rental-receipts/confirm-deposit", {
        billId: deposit.id,
        occurredOn: "2026-12-04",
        expectedVersion: detail.financial!.version,
        idempotencyKey: randomUUID(),
      });
    }
    const charges = await s.ok<import("@xpense/shared").RentalChargeTerms>(
      `/rental-charges/detail?id=${s.id}`,
      undefined,
      "GET",
    );
    await s.ok("/rental-charges/update", {
      contractId: s.id,
      expectedVersion: charges.version,
      idempotencyKey: randomUUID(),
      reason: "最新水价",
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
      fixedFees: charges.fixedFees,
    });
    const input = s.settlementInput([
      { id: randomUUID(), name: "固定费用退款事项", amountMinor: -2000, note: "房东核定" },
    ]);
    const preview = await s.previewSettlement(input);
    expect(preview.terminalLines.find((line) => line.kind === "water")?.amountMinor).toBe(20000);
    expect(preview.finalCostMinor).toBe(683000);
    expect(preview.receivedMinor).toBe(975000);
    expect(preview.refundedMinor).toBe(0);
    expect(preview.differenceMinor).toBe(-292000);
    const before = structuredClone(s.h.state.rental.bills);
    const settlement = await s.ok<RentalSettlementDetail>("/rental-settlements/confirm", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(s.h.state.rental.bills).toEqual(before);
    expect(s.h.state.rental.bills.filter((bill) => bill.type === "period")).toHaveLength(count + 1);
    await s.ok("/rental-refunds/create", {
      target: { kind: "settlement", settlementId: settlement.id },
      occurredOn: "2026-12-04",
      expectedVersion: settlement.version,
      idempotencyKey: randomUUID(),
    });
    const final = await s.ok<{ settlement: RentalSettlementDetail }>(
      `/rental-settlements/detail?contractId=${s.id}`,
      undefined,
      "GET",
    );
    expect(final.settlement.finalCostMinor).toBe(683000);
    expect(final.settlement.balance).toMatchObject({
      receivedMinor: 975000,
      refundedMinor: 292000,
      outstandingMinor: 0,
      refundableMinor: 0,
    });
    expect(final.settlement.status).toBe("settled");
    expect(
      (
        await s.h.request("/rental-period-bills/preview", {
          contractId: s.id,
          periodStart: first.dto.periodStart,
          readings: first.dto.readings,
          extraFees: [],
        })
      ).statusCode,
    ).toBe(409);
    const old = await s.detail(first.bill.id);
    expect(old.canVoid).toBe(false);
    expect(old.settlementId).toBe(settlement.id);
  });
});

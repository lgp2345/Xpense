import { randomUUID } from "node:crypto";
import type {
  RentalBillDetail,
  RentalChargeTerms,
  RentalPeriodBillContext,
  RentalPeriodBillPreview,
} from "@xpense/shared";
import { expect, it } from "vitest";
import { createPeriodHttpScenario } from "../../test/rental-period-http-fixtures.js";

it("收费标准变化、单期覆盖、零值、作废重开和手动退款均保留历史账单", async () => {
  const s = await createPeriodHttpScenario();
  try {
    const first = await s.generate("3600");
    const original = structuredClone(first.bill.lines);
    const terms = await s.ok<RentalChargeTerms>(
      `/rental-charges/detail?id=${s.id}`,
      undefined,
      "GET",
    );
    await s.ok("/rental-charges/update", {
      contractId: s.id,
      waterUnitPrice: "4.0000",
      electricityUnitPrice: terms.electricityUnitPrice,
      fixedFees: terms.fixedFees.map((fee) => ({ ...fee, periodAmountMinor: 20000 })),
      reason: "合同新标准",
      expectedVersion: terms.version,
      idempotencyKey: randomUUID(),
    });
    const context = await s.ok<RentalPeriodBillContext>(
      `/rental-period-bills/context?contractId=${s.id}`,
      undefined,
      "GET",
    );
    const input = {
      contractId: s.id,
      periodStart: context.nextPeriod!.periodStart,
      dueDate: context.defaultDueDate!,
      readings: context.defaultReadings.map((r) => ({
        ...r,
        reading: r.kind === "water" ? "3680" : r.reading,
      })),
      extraFees: [],
      overrides: {
        fixedFees: terms.fixedFees.map((fee) => ({ id: fee.id, periodAmountMinor: 0 })),
        reason: "本期管理费减免",
      },
    };
    const preview = await s.ok<RentalPeriodBillPreview>("/rental-period-bills/preview", input);
    const second = await s.ok<RentalBillDetail>("/rental-period-bills/generate", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(second.lines.find((l) => l.kind === "water")).toMatchObject({
      amountMinor: 32000,
      periodStart: null,
      periodEnd: null,
    });
    expect(second.lines.find((l) => l.kind === "water")?.feeSnapshot).not.toHaveProperty(
      "startDate",
    );
    expect(second.lines.find((l) => l.kind === "fixed_fee")?.feeSnapshot).toMatchObject({
      periodAmountMinor: 0,
      overrideReason: "本期管理费减免",
    });
    expect((await s.detail(first.bill.id)).lines).toEqual(original);
    await s.receipt(first.bill.id, 100);
    await s.voidBill(second.id);
    const reopened = await s.generate("3680");
    expect(reopened.bill.lines.find((l) => l.kind === "fixed_fee")?.amountMinor).toBe(20000);
    expect((await s.detail(first.bill.id)).financial?.receivedMinor).toBe(100);
    const before = await s.previewSettlement();
    const after = await s.previewSettlement(
      s.settlementInput([
        { id: randomUUID(), name: "固定费用退款", amountMinor: -10000, note: "房东核定" },
      ]),
    );
    expect(after.finalCostMinor).toBe(before.finalCostMinor - 10000);
    expect(after.receivedMinor).toBe(before.receivedMinor);
    expect(after.refundedMinor).toBe(0);
    expect((await s.detail(first.bill.id)).lines).toEqual(original);
  } finally {
    await s.h.app.close();
  }
});

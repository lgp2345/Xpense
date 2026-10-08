import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testIds } from "../../test/auth-test-helpers.js";
import { createPeriodHttpScenario } from "../../test/rental-period-http-fixtures.js";
import { rentalTestIds } from "../../test/rental-test-state.js";

describe("不可变账单的替代更正流程", () => {
  let s: Awaited<ReturnType<typeof createPeriodHttpScenario>>;
  beforeEach(async () => {
    s = await createPeriodHttpScenario();
  });
  afterEach(async () => {
    await s.h.app.close();
  });
  it("只能逐期作废重开，历史快照、默认价格和相邻资金不改写", async () => {
    const first = await s.generate("3600");
    const second = await s.generate("3680");
    const original = structuredClone(s.h.state.rental.bills.find((b) => b.id === first.bill.id));
    const detail = await s.detail(first.bill.id);
    expect(
      (
        await s.h.request("/rental-period-bills/void", {
          billId: first.bill.id,
          reason: "核对",
          expectedVersion: detail.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    await s.voidBill(second.bill.id);
    const reopened = await s.generate("3650");
    expect(reopened.bill.lines.find((line) => line.kind === "water")?.feeSnapshot).toMatchObject({
      startReading: "3600",
      endReading: "3650",
    });
    expect(s.h.state.rental.bills.find((b) => b.id === first.bill.id)).toEqual(original);
    expect(s.terms.waterUnitPrice).toBe("3.0000");
    expect((await s.h.request("/rental-monthly-bills/adjust", {})).statusCode).toBe(404);
    expect(s.h.state.rental.billRevisions).toHaveLength(0);
  });
  it("原因、身份、权限和组织边界拒绝非法作废，资金事实保留", async () => {
    const { bill } = await s.generate("3600");
    const receipt = await s.receipt(bill.id, 100);
    const detail = await s.detail(bill.id);
    const dto = {
      billId: bill.id,
      reason: "核对",
      expectedVersion: detail.version,
      idempotencyKey: randomUUID(),
    };
    expect(
      (await s.h.request("/rental-period-bills/void", { ...dto, reason: "" })).statusCode,
    ).toBe(400);
    expect((await s.h.request("/rental-period-bills/void", dto, {})).statusCode).toBe(401);
    expect(
      (await s.h.request("/rental-period-bills/void", dto, s.h.memberHeaders)).statusCode,
    ).toBe(403);
    const stored = s.h.state.rental.bills.find((b) => b.id === bill.id)!;
    const foreignId = randomUUID();
    s.h.state.rental.bills.push({
      ...structuredClone(stored),
      id: foreignId,
      contractId: rentalTestIds.foreignContract,
      organizationId: testIds.otherOrganization,
    });
    expect(
      (await s.h.request("/rental-period-bills/void", { ...dto, billId: foreignId })).statusCode,
    ).toBe(404);
    expect((await s.h.request("/rental-period-bills/void", dto)).statusCode).toBe(409);
    expect(
      s.h.state.rental.cashEntries.find((entry) => entry.id === receipt.id)?.revokedAt,
    ).toBeNull();
    expect(stored.status).toBe("active");
  });
  it("已结算账单关闭作废与账单收款，只接受当前结算资金目标", async () => {
    const { bill } = await s.generate("3600");
    const input = s.settlementInput();
    const preview = await s.previewSettlement(input);
    const settlement = await s.ok<import("@xpense/shared").RentalSettlementDetail>(
      "/rental-settlements/confirm",
      { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() },
    );
    const detail = await s.detail(bill.id);
    expect(detail.canVoid).toBe(false);
    expect(
      (
        await s.h.request("/rental-period-bills/void", {
          billId: bill.id,
          reason: "核对",
          expectedVersion: detail.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await s.h.request("/rental-receipts/create", {
          target: { kind: "bill", billId: bill.id },
          amountMinor: 100,
          occurredOn: "2026-12-04",
          expectedVersion: detail.financial!.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    await s.ok("/rental-receipts/create", {
      target: { kind: "settlement", settlementId: settlement.id },
      amountMinor: 100,
      occurredOn: "2026-12-04",
      expectedVersion: settlement.balance.version,
      idempotencyKey: randomUUID(),
    });
  });
});

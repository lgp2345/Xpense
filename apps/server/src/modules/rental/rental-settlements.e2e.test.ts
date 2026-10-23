import { randomUUID } from "node:crypto";
import type { RentalSettlementDetail } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeriodHttpScenario } from "../../test/rental-period-http-fixtures.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";
import { AuditService } from "../audit/audit.service.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";

describe("独立账期结算HTTP", () => {
  let s: Awaited<ReturnType<typeof createPeriodHttpScenario>>;
  beforeEach(async () => {
    s = await createPeriodHttpScenario();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (s) await s.h.app.close();
  });
  it("尾期水电、固定费退款事项保存独立快照，收退款后不丢费用", async () => {
    const first = await s.generate("3600");
    await s.generate("3680");
    const input = s.settlementInput([
      { id: randomUUID(), name: "固定费退款事项", amountMinor: -2000, note: "房东核定" },
    ]);
    const preview = await s.previewSettlement(input);
    expect(preview.terminalLines.find((line) => line.kind === "water")?.amountMinor).toBe(6000);
    expect(preview.finalCostMinor).toBe(678000);
    const before = structuredClone(s.h.state.rental.bills);
    const dto = { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() };
    const settlement = await s.ok<RentalSettlementDetail>("/rental-settlements/confirm", dto);
    expect(s.h.state.rental.bills).toEqual(before);
    expect(s.h.state.rental.settlements[0]?.snapshot.terminalLines[0]?.feeSnapshot).toMatchObject({
      endReading: "3700",
    });
    expect(
      s.h.state.rental.meterReadings.filter((reading) => reading.source === "settlement"),
    ).toHaveLength(2);
    const replay = await s.ok<RentalSettlementDetail>("/rental-settlements/confirm", dto);
    expect(replay.id).toBe(settlement.id);
    expect(
      s.h.state.rental.meterReadings.filter((reading) => reading.source === "settlement"),
    ).toHaveLength(2);
    const detail = await s.detail(first.bill.id);
    expect(detail.settlementId).toBe(settlement.id);
    expect(
      (
        await s.h.request("/rental-receipts/create", {
          target: { kind: "bill", billId: first.bill.id },
          amountMinor: 100,
          occurredOn: "2026-12-04",
          expectedVersion: detail.financial!.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    await s.ok("/rental-receipts/create", {
      target: { kind: "settlement", settlementId: settlement.id },
      amountMinor: 678000,
      occurredOn: "2026-12-04",
      expectedVersion: settlement.version,
      idempotencyKey: randomUUID(),
    });
    expect(s.h.state.rental.settlements[0]?.finalCostMinor).toBe(678000);
    expect(s.h.state.rental.settlements[0]?.snapshot.extraLines[0]?.amountMinor).toBe(-2000);
  });
  it("缺终值不可确认，低于最后有效基准拒绝；同值和同日合法", async () => {
    await s.generate("3680");
    const missing = await s.ok<import("@xpense/shared").RentalSettlementPreview>(
      "/rental-settlements/preview",
      { contractId: s.id, extraFees: [] },
    );
    expect(missing.canConfirm).toBe(false);
    expect(missing.missingFields).toContain("waterReading");
    const input = s.settlementInput();
    input.finalReadings[0]!.reading = "3679";
    expect((await s.h.request("/rental-settlements/preview", input)).statusCode).toBe(400);
    input.finalReadings[0]!.reading = "3680";
    expect(
      (await s.previewSettlement(input)).terminalLines.find((line) => line.kind === "water")
        ?.amountMinor,
    ).toBe(0);
  });
  it("400严格校验、401未认证、403无权限、404跨组织、409过期版本", async () => {
    const input = s.settlementInput();
    expect(
      (await s.h.request("/rental-settlements/preview", { ...input, finalCostMinor: 0 }))
        .statusCode,
    ).toBe(400);
    expect((await s.h.request("/rental-settlements/preview", input, {})).statusCode).toBe(401);
    expect(
      (await s.h.request("/rental-settlements/preview", input, s.h.memberHeaders)).statusCode,
    ).toBe(403);
    expect(
      (
        await s.h.request("/rental-settlements/preview", {
          ...input,
          contractId: rentalTestIds.foreignContract,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await s.h.request("/rental-settlements/confirm", {
          ...input,
          expectedVersion: "stale",
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it.each([
    "readings",
    "snapshot",
    "audit",
  ])("%s失败回滚结算头、终值、快照、关联和请求", async (seam) => {
    await s.generate("3680");
    const input = s.settlementInput();
    const preview = await s.previewSettlement(input);
    const before = cloneRentalTestState(s.h.state.rental);
    if (seam === "readings")
      vi.spyOn(s.h.app.get(MeterReadingsRepository), "appendBoundary").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    if (seam === "snapshot")
      vi.spyOn(s.h.app.get(RentalSettlementsRepository), "finalizeSnapshot").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    if (seam === "audit")
      vi.spyOn(s.h.app.get(AuditService), "appendRequired").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    expect(
      (
        await s.h.request("/rental-settlements/confirm", {
          ...input,
          expectedVersion: preview.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(500);
    expect(cloneRentalTestState(s.h.state.rental)).toEqual(before);
  });
  it("未来结束日只预览，正式结束日前不能确认", async () => {
    s.h.source.today = "2026-10-08";
    const preview = await s.ok<import("@xpense/shared").RentalSettlementPreview>(
      "/rental-settlements/preview",
      { contractId: s.id, extraFees: [] },
    );
    expect(preview.canConfirm).toBe(false);
    expect(
      (
        await s.h.request("/rental-settlements/confirm", {
          contractId: s.id,
          extraFees: [],
          expectedVersion: preview.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
  });
  it.each([
    "mixed",
    "foreign",
  ])("%s historical currencies cannot bypass settlement preview/confirm", async (scenario) => {
    await s.generate("3600");
    await s.generate("3680");
    const input = s.settlementInput();
    const preview = await s.previewSettlement(input);
    const bills = s.h.state.rental.bills;
    const [first, second] = bills;
    if (!first || !second) throw new Error("测试账单未生成");
    first.currencyCode = "USD";
    if (scenario === "foreign") second.currencyCode = "USD";
    const before = cloneRentalTestState(s.h.state.rental);
    for (const [url, payload] of [
      ["/rental-settlements/preview", input],
      [
        "/rental-settlements/confirm",
        { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() },
      ],
    ] as const) {
      const result = await s.h.request(url, payload);
      expect(result.statusCode, result.payload).toBe(400);
      expect(result.payload).toContain("币种");
    }
    expect(cloneRentalTestState(s.h.state.rental)).toEqual(before);
    // A standalone bill still displays its own historical snapshot.
    expect((await s.detail(first.id)).currencyCode).toBe("USD");
  });
  it("ambiguous confirmed settlements reject detail/history and cash writes", async () => {
    const generated = await s.generate("3600");
    const receipt = await s.receipt(generated.bill.id, 100);
    await s.generate("3680");
    const input = s.settlementInput();
    const preview = await s.previewSettlement(input);
    const settlement = await s.ok<RentalSettlementDetail>("/rental-settlements/confirm", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    const [first] = s.h.state.rental.bills;
    if (!first) throw new Error("测试账单未生成");
    first.currencyCode = "USD";
    const before = cloneRentalTestState(s.h.state.rental);
    for (const action of ["detail", "history"]) {
      const result = await s.h.request(
        `/rental-settlements/${action}?contractId=${s.id}`,
        undefined,
        undefined,
        "GET",
      );
      expect(result.statusCode, result.payload).toBe(400);
      expect(result.payload).toContain("币种");
    }
    for (const url of ["/rental-receipts/create", "/rental-refunds/create"]) {
      const result = await s.h.request(url, {
        target: { kind: "settlement", settlementId: settlement.id },
        ...(url.includes("receipts") ? { amountMinor: 100 } : {}),
        occurredOn: "2026-12-04",
        expectedVersion: settlement.version,
        idempotencyKey: randomUUID(),
      });
      expect(result.statusCode, result.payload).toBe(400);
      expect(result.payload).toContain("币种");
    }
    const revoke = await s.h.request("/rental-receipts/revoke", {
      entryId: receipt.id,
      reason: "核对退款",
      expectedVersion: settlement.version,
      idempotencyKey: randomUUID(),
    });
    expect(revoke.statusCode, revoke.payload).toBe(400);
    expect(revoke.payload).toContain("币种");
    const cashList = await s.h.request(
      `/rental-cash/list?kind=settlement&settlementId=${settlement.id}`,
      undefined,
      undefined,
      "GET",
    );
    expect(cashList.statusCode, cashList.payload).toBe(400);
    expect(cashList.payload).toContain("币种");
    expect(cloneRentalTestState(s.h.state.rental)).toEqual(before);
  });
  it("USD bills and settlement costs keep normal preview and confirmation", async () => {
    s.h.source.currencyCode = "USD";
    const first = await s.generate("3600");
    await s.generate("3680");
    const input = s.settlementInput();
    const preview = await s.previewSettlement(input);
    expect(first.bill.currencyCode).toBe("USD");
    expect(preview.canConfirm).toBe(true);
    const settlement = await s.ok<RentalSettlementDetail>("/rental-settlements/confirm", {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: randomUUID(),
    });
    expect(settlement.finalCostMinor).toBe(680000);
  });
});

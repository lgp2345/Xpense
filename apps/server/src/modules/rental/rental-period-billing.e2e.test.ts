import { randomUUID } from "node:crypto";
import type {
  RentalBillDetail,
  RentalPeriodBillContext,
  RentalPeriodBillPreview,
} from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";
import { AuditService } from "../audit/audit.service.js";
import { BillsRepository } from "./bills.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";

describe("合同账期HTTP", () => {
  let h: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;
  beforeEach(async () => {
    h = await createRentalFinanceHttpHarness();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (h) await h.app.close();
  });
  async function input() {
    const response = await h.request(
      `/rental-period-bills/context?contractId=${h.financeContractId}`,
      undefined,
      undefined,
      "GET",
    );
    expect(response.statusCode).toBe(200);
    const context = h.parse<RentalPeriodBillContext>(response);
    return {
      contractId: h.financeContractId,
      periodStart: context.nextPeriod!.periodStart,
      dueDate: context.defaultDueDate!,
      readings: context.defaultReadings,
      extraFees: [],
    };
  }
  it("200预览、400严格校验、401未认证、403无权限、404跨组织及409过期版本", async () => {
    const dto = await input();
    const preview = await h.request("/rental-period-bills/preview", dto);
    expect(preview.statusCode).toBe(200);
    const invalid = await h.request("/rental-period-bills/preview", { ...dto, amountMinor: 1 });
    expect(invalid.statusCode).toBe(400);
    expect(
      (
        await h.request(
          `/rental-period-bills/context?contractId=${h.financeContractId}`,
          undefined,
          {},
          "GET",
        )
      ).statusCode,
    ).toBe(401);
    expect((await h.request("/rental-period-bills/preview", dto, h.memberHeaders)).statusCode).toBe(
      403,
    );
    expect(
      (
        await h.request(
          `/rental-period-bills/context?contractId=${rentalTestIds.foreignContract}`,
          undefined,
          undefined,
          "GET",
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await h.request("/rental-period-bills/generate", {
          ...dto,
          expectedVersion: "stale",
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("同日生成多期，零用量独立读数，幂等重放不推进", async () => {
    for (let i = 0; i < 2; i++) {
      const dto = await input();
      const preview = h.parse<RentalPeriodBillPreview>(
        await h.request("/rental-period-bills/preview", dto),
      );
      const generate = { ...dto, expectedVersion: preview.version, idempotencyKey: randomUUID() };
      const response = await h.request("/rental-period-bills/generate", generate);
      expect(response.statusCode).toBe(200);
      const bill = h.parse<RentalBillDetail>(response);
      expect(bill.lines.find((line) => line.kind === "water")?.amountMinor).toBe(0);
      expect((await h.request("/rental-period-bills/generate", generate)).statusCode).toBe(200);
    }
    expect(h.state.rental.bills.filter((bill) => bill.type === "period")).toHaveLength(2);
    expect(
      h.state.rental.meterReadings.filter((reading) => reading.source === "bill"),
    ).toHaveLength(4);
  });
  it.each(["readings", "lines", "audit"])("%s故障整体回滚起点、账单、读数和请求", async (seam) => {
    const dto = await input();
    const preview = h.parse<RentalPeriodBillPreview>(
      await h.request("/rental-period-bills/preview", dto),
    );
    const before = cloneRentalTestState(h.state.rental);
    if (seam === "readings")
      vi.spyOn(h.app.get(MeterReadingsRepository), "appendBoundary").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    if (seam === "lines")
      vi.spyOn(h.app.get(BillsRepository), "insertPeriodLines").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    if (seam === "audit")
      vi.spyOn(h.app.get(AuditService), "appendRequired").mockRejectedValueOnce(
        new Error("fixture failure"),
      );
    expect(
      (
        await h.request("/rental-period-bills/generate", {
          ...dto,
          expectedVersion: preview.version,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(500);
    expect(cloneRentalTestState(h.state.rental)).toEqual(before);
  });
});

import { randomUUID } from "node:crypto";
import type { RentalBillGenerationResult, RentalBillPage, RentalBillPreview } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createRentalBillingHttpHarness } from "../../test/rental-billing-http-harness.js";
import { cloneRentalTestState, FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";

describe("账单 HTTP 全流程", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });
  afterEach(() => vi.useRealTimers());
  it("生成→合同修正→旧单作废→补齐，未知结果重试返回原批次", async () => {
    const h = await createRentalBillingHttpHarness({
      startDate: "2026-09-01",
      endDate: "2027-08-31",
    });
    try {
      const input = {
        contractId: h.source.contract.id,
        depositDueDates: {} as Record<string, string>,
      };
      const blankResponse = await h.request("/rental-bills/preview", input);
      expect(blankResponse.statusCode).toBe(200);
      const blank = h.parse<RentalBillPreview>(blankResponse);
      for (const key of blank.missingDepositSourceKeys) input.depositDueDates[key] = "2026-09-01";
      const preview = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
      expect(preview.createCount).toBe(6);
      const request = { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() };
      const response = await h.request("/rental-bills/generate", request);
      expect(response.statusCode).toBe(200);
      const result = h.parse<RentalBillGenerationResult>(response);
      expect(result.createdCount).toBe(6);
      expect(
        h.parse<RentalBillGenerationResult>(await h.request("/rental-bills/generate", request)),
      ).toMatchObject({ generationId: result.generationId, replayed: true });
      const stale = await h.request("/rental-bills/preview", {
        contractId: input.contractId,
        depositDueDates: {},
        page: 2,
        expectedVersion: preview.version,
      });
      expect(stale.statusCode).toBe(409);
      const correction = await h.request("/rental-contracts/update", {
        id: input.contractId,
        rentAmountMinor: 400000,
      });
      expect(correction.statusCode).toBe(200);
      expect(h.state.rental.bills.filter((bill) => bill.status === "voided")).toHaveLength(5);
      const missing = h.parse<RentalBillPreview>(
        await h.request("/rental-bills/preview", { ...input, depositDueDates: {} }),
      );
      expect(missing.createCount).toBe(5);
      const dates = Object.fromEntries(
        missing.missingDepositSourceKeys.map((key) => [key, "2026-09-02"]),
      );
      const again = h.parse<RentalBillPreview>(
        await h.request("/rental-bills/preview", {
          contractId: input.contractId,
          depositDueDates: dates,
        }),
      );
      expect(
        (
          await h.request("/rental-bills/generate", {
            contractId: input.contractId,
            depositDueDates: dates,
            expectedVersion: again.version,
            idempotencyKey: randomUUID(),
          })
        ).statusCode,
      ).toBe(200);
      const page = h.parse<RentalBillPage>(
        await h.request(`/rental-bills/list?contractId=${input.contractId}`),
      );
      expect(page.total).toBe(6);
      expect(page.totals).toEqual({ rentAmountMinor: 4800000, depositAmountMinor: 410000 });
    } finally {
      await h.app.close();
    }
  });
  it("未认证、三项权限、跨组织、校验及原子失败边界", async () => {
    const h = await createRentalBillingHttpHarness(
      {},
      { managerPermissions: ["rental_contracts:read", "rental_bills:read"] },
    );
    try {
      expect(
        (await h.app.inject({ method: "GET", url: "/api/rental-bills/list" })).statusCode,
      ).toBe(401);
      const manager = await login(h.app, TEST_PHONES.manager);
      expect(
        (
          await h.app.inject({
            method: "POST",
            url: "/api/rental-bills/preview",
            headers: { authorization: `Bearer ${manager.accessToken}` },
            payload: { contractId: h.source.contract.id, depositDueDates: {} },
          })
        ).statusCode,
      ).toBe(403);
      const invalid = await h.request("/rental-bills/generate", {
        contractId: h.source.contract.id,
        rentAmountMinor: 1,
      });
      expect(invalid.statusCode).toBe(400);
      expect(JSON.parse(invalid.payload).code).toBe("VALIDATION_FAILED");
      expect(
        (
          await h.request("/rental-bills/preview", {
            contractId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
            depositDueDates: {},
          })
        ).statusCode,
      ).toBe(404);
      const input = {
        contractId: h.source.contract.id,
        depositDueDates: {} as Record<string, string>,
      };
      const blank = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
      for (const key of blank.missingDepositSourceKeys) input.depositDueDates[key] = "2026-01-01";
      const preview = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
      const request = { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() };
      const snapshot = cloneRentalTestState(h.state.rental);
      h.state.rental.failNextRepositoryOperation = "billing.lines";
      expect((await h.request("/rental-bills/generate", request)).statusCode).toBe(500);
      expect(cloneRentalTestState(h.state.rental)).toEqual(snapshot);
      expect((await h.request("/rental-bills/generate", request)).statusCode).toBe(200);
      const ownerRole = [...h.state.roles.values()].find((role) => role.key === "owner");
      if (!ownerRole) throw new Error("owner fixture");
      ownerRole.permissions = ownerRole.permissions.filter(
        (key) => key !== "rental_bills:generate",
      );
      expect((await h.request("/rental-bills/generate", request)).statusCode).toBe(403);
      expect(h.state.rental.bills).toHaveLength(6);
      expect(
        h.state.rental.bills.every((bill) => bill.organizationId === testIds.organization),
      ).toBe(true);
    } finally {
      await h.app.close();
    }
  });
});

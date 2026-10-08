import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testIds } from "../../test/auth-test-helpers.js";
import { createRentalBillingHttpHarness } from "../../test/rental-billing-http-harness.js";
import {
  cloneRentalTestState,
  FIXED_RENTAL_NOW,
  rentalTestIds,
} from "../../test/rental-test-state.js";

describe("生命周期只改变合同边界，不重写账单", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });
  afterEach(() => vi.useRealTimers());
  it("终止审计失败回滚，恢复冲突回滚，成功恢复不创建财务更正", async () => {
    const h = await createRentalBillingHttpHarness();
    try {
      const input = { id: h.source.contract.id, terminationDate: "2026-11-15", reason: "协商终止" };
      const before = cloneRentalTestState(h.state.rental);
      h.state.failNextRequiredAuditAppendAfterPersist = true;
      expect((await h.request("/rental-contracts/terminate", input)).statusCode).toBe(500);
      expect(cloneRentalTestState(h.state.rental)).toEqual(before);
      expect((await h.request("/rental-contracts/terminate", input)).statusCode).toBe(200);
      const conflict = {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2026-11-16",
        endDate: "2026-12-31",
        excludeContractId: input.id,
      };
      h.state.rentalQuery.registerSpaceConflict(conflict, [
        {
          contractId: rentalTestIds.foreignContract,
          contractNumber: "RC-other",
          spaceId: rentalTestIds.childSpace,
        },
      ]);
      const terminated = cloneRentalTestState(h.state.rental);
      expect(
        (await h.request("/rental-contracts/revoke-termination", { id: input.id, reason: "恢复" }))
          .statusCode,
      ).toBe(409);
      expect(cloneRentalTestState(h.state.rental)).toEqual(terminated);
      h.state.rentalQuery.registerSpaceConflict(conflict, []);
      expect(
        (await h.request("/rental-contracts/revoke-termination", { id: input.id, reason: "恢复" }))
          .statusCode,
      ).toBe(200);
      expect(h.state.rental.billAdjustments).toHaveLength(0);
      expect(h.state.rental.bills).toHaveLength(0);
      expect(
        (
          await h.request("/rental-bills/termination-preview", {
            contractId: input.id,
            terminationDate: input.terminationDate,
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await h.app.close();
    }
  });
  it("无普通账单可直接终止，押金接口不补租金或接受整期金额", async () => {
    const h = await createRentalBillingHttpHarness({ depositTerms: [] });
    try {
      const id = h.source.contract.id;
      expect(
        (
          await h.request("/rental-contracts/terminate", {
            id,
            terminationDate: "2026-11-15",
            reason: "终止",
          })
        ).statusCode,
      ).toBe(200);
      const result = await h.request("/rental-bills/preview", {
        contractId: id,
        scope: "deposits",
        depositDueDates: {},
      });
      expect(result.statusCode).toBe(200);
      expect(h.parse<{ createCount: number }>(result).createCount).toBe(0);
      expect(
        (
          await h.request("/rental-bills/preview", {
            contractId: id,
            scope: "deposits",
            depositDueDates: {},
            terminationConfirmation: { finalAmountMinor: 0, reason: "免除" },
          })
        ).statusCode,
      ).toBe(400);
      expect(h.state.rental.bills).toHaveLength(0);
      expect(h.state.rental.billAdjustments).toHaveLength(0);
    } finally {
      await h.app.close();
    }
  });
});

import { randomUUID } from "node:crypto";
import type { RentalBillPreview, RentalTerminationPreview } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testIds } from "../../test/auth-test-helpers.js";
import { createRentalBillingHttpHarness } from "../../test/rental-billing-http-harness.js";
import {
  cloneRentalTestState,
  FIXED_RENTAL_NOW,
  rentalTestIds,
} from "../../test/rental-test-state.js";

async function generate(h: Awaited<ReturnType<typeof createRentalBillingHttpHarness>>) {
  const input = { contractId: h.source.contract.id, depositDueDates: {} as Record<string, string> };
  const blank = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
  for (const key of blank.missingDepositSourceKeys) input.depositDueDates[key] = "2026-01-01";
  const preview = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
  expect(
    (
      await h.request("/rental-bills/generate", {
        ...input,
        expectedVersion: preview.version,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(200);
}
describe("账单与合同生命周期 HTTP 事务", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });
  afterEach(() => vi.useRealTimers());
  it("终止→确认整期金额→恢复冲突回滚→撤销→补齐→同日新事件", async () => {
    const h = await createRentalBillingHttpHarness();
    try {
      await generate(h);
      const dto = { id: h.source.contract.id, terminationDate: "2026-11-15", reason: "协商终止" };
      expect((await h.request("/rental-contracts/terminate", dto)).statusCode).toBe(400);
      const response = await h.request("/rental-bills/termination-preview", {
        contractId: dto.id,
        terminationDate: dto.terminationDate,
      });
      expect(response.statusCode).toBe(200);
      const preview = h.parse<RentalTerminationPreview>(response);
      expect(preview).toMatchObject({ originalAmountMinor: 900000, referenceAmountMinor: 450000 });
      const request = {
        ...dto,
        billingConfirmation: {
          expectedVersion: preview.version,
          finalAmountMinor: 500000,
          reason: "当期协商",
        },
      };
      const snapshot = cloneRentalTestState(h.state.rental);
      h.state.rental.failNextRepositoryOperation = "billing.adjustment";
      expect((await h.request("/rental-contracts/terminate", request)).statusCode).toBe(500);
      expect(cloneRentalTestState(h.state.rental)).toEqual(snapshot);
      h.state.failNextRequiredAuditAppendAfterPersist = true;
      expect((await h.request("/rental-contracts/terminate", request)).statusCode).toBe(500);
      expect(cloneRentalTestState(h.state.rental)).toEqual(snapshot);
      const terminated = await h.request("/rental-contracts/terminate", request);
      expect(terminated.statusCode).toBe(200);
      const adjustment = h.state.rental.billAdjustments[0];
      expect(adjustment?.finalAmountMinor).toBe(500000);
      const replacement = h.state.rental.bills.find((bill) => bill.adjustmentId === adjustment?.id);
      expect(replacement?.amountMinor).toBe(500000);
      expect(replacement?.lines.at(-1)?.amountMinor).toBe(-400000);
      const conflictInput = {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2026-11-16",
        endDate: "2026-12-31",
        excludeContractId: dto.id,
      };
      h.state.rentalQuery.registerSpaceConflict(conflictInput, [
        {
          contractId: rentalTestIds.foreignContract,
          contractNumber: "RC-other",
          spaceId: rentalTestIds.childSpace,
        },
      ]);
      const beforeRevoke = cloneRentalTestState(h.state.rental);
      expect(
        (await h.request("/rental-contracts/revoke-termination", { id: dto.id, reason: "恢复" }))
          .statusCode,
      ).toBe(409);
      expect(cloneRentalTestState(h.state.rental)).toEqual(beforeRevoke);
      h.state.rentalQuery.registerSpaceConflict(conflictInput, []);
      expect(
        (await h.request("/rental-contracts/revoke-termination", { id: dto.id, reason: "恢复" }))
          .statusCode,
      ).toBe(200);
      expect(h.state.rental.billAdjustments[0]?.revokedAt).not.toBeNull();
      expect(h.state.rental.bills.filter((bill) => bill.status === "voided")).toHaveLength(2);
      const missingInput = { contractId: dto.id, depositDueDates: {} };
      const missing = h.parse<RentalBillPreview>(
        await h.request("/rental-bills/preview", missingInput),
      );
      expect(missing.createCount).toBe(1);
      expect(
        (
          await h.request("/rental-bills/generate", {
            ...missingInput,
            expectedVersion: missing.version,
            idempotencyKey: randomUUID(),
          })
        ).statusCode,
      ).toBe(200);
      const second = h.parse<RentalTerminationPreview>(
        await h.request("/rental-bills/termination-preview", {
          contractId: dto.id,
          terminationDate: dto.terminationDate,
        }),
      );
      expect(
        (
          await h.request("/rental-contracts/terminate", {
            ...request,
            billingConfirmation: {
              ...request.billingConfirmation,
              expectedVersion: second.version,
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(h.state.rental.billAdjustments).toHaveLength(2);
      expect(h.state.rental.billAdjustments[1]?.id).not.toBe(adjustment?.id);
    } finally {
      await h.app.close();
    }
  });
  it("无账单旧客户端仍可终止，首次生成需要确认；调整失败不改合同与承租关系", async () => {
    const h = await createRentalBillingHttpHarness({ depositTerms: [] });
    try {
      const dto = { id: h.source.contract.id, terminationDate: "2026-11-15", reason: "终止" };
      expect((await h.request("/rental-contracts/terminate", dto)).statusCode).toBe(200);
      expect(h.state.rental.billAdjustments).toHaveLength(0);
      const input = { contractId: dto.id, depositDueDates: {} };
      const blank = h.parse<RentalBillPreview>(await h.request("/rental-bills/preview", input));
      expect(blank.canGenerate).toBe(false);
      const confirmed = {
        ...input,
        terminationConfirmation: { finalAmountMinor: 0, reason: "当期免除" },
      };
      const preview = h.parse<RentalBillPreview>(
        await h.request("/rental-bills/preview", confirmed),
      );
      expect(preview.createCount).toBe(4);
      expect(
        (
          await h.request("/rental-bills/generate", {
            ...confirmed,
            expectedVersion: preview.version,
            idempotencyKey: randomUUID(),
          })
        ).statusCode,
      ).toBe(200);
      expect(h.state.rental.bills.at(-1)?.amountMinor).toBe(0);
      expect(h.state.rental.billAdjustments).toHaveLength(1);
    } finally {
      await h.app.close();
    }
  });
});

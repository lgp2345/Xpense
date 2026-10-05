import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";

describe("合同事项名称唯一的 HTTP 校验", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;
  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
  });
  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it.each(["rental", "other"])("创建和更新均拒绝同名 %s 押金且不写入", async (type) => {
    const deposit = {
      type,
      ...(type === "other" ? { customName: "钥匙" } : {}),
      calculationMode: "fixed_amount",
      fixedAmountMinor: 100,
    };
    const depositTerms = [
      deposit,
      { ...deposit, ...(type === "other" ? { customName: " 钥匙 " } : {}) },
    ];
    const before = cloneRentalTestState(harness.state.rental);
    const requests = [
      ["/rental-contracts/create", { propertyId: rentalTestIds.property, depositTerms }],
      ["/rental-contracts/update", { id: harness.financeContractId, depositTerms }],
      [
        "/rental-contracts/create-confirmed",
        {
          propertyId: rentalTestIds.property,
          startDate: "2026-10-16",
          endDate: "2026-12-31",
          rentAmountMinor: 10000,
          billingAnchor: "calendar_month",
          paymentIntervalMonths: 1,
          dueDaysBefore: 0,
          spaces: [{ spaceId: rentalTestIds.childSpace }],
          parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
          depositTerms,
        },
      ],
    ] as const;
    for (const [path, input] of requests) {
      const response = await harness.request(path, input);
      expect(response.statusCode, response.payload).toBe(400);
      expect(JSON.parse(response.payload).code).toBe("VALIDATION_FAILED");
      expect(harness.state.rental).toEqual(before);
    }
  });

  it("初始收费和收费标准更新均拒绝不同 ID 的同名固定月费", async () => {
    const chargeTerms = {
      waterCollectionEnabled: false,
      electricityCollectionEnabled: false,
      waterUnitPrice: "0",
      electricityUnitPrice: "0",
      fixedFees: [
        { id: randomUUID(), name: "管理费", monthlyAmountMinor: 100 },
        { id: randomUUID(), name: " 管理费 ", monthlyAmountMinor: 200 },
      ],
    };
    const before = cloneRentalTestState(harness.state.rental);
    const requests = [
      [
        "/rental-contracts/create",
        { propertyId: rentalTestIds.property, chargeSetup: { chargeTerms, baselineReadings: [] } },
      ],
      [
        "/rental-charges/update",
        {
          ...chargeTerms,
          contractId: harness.financeContractId,
          expectedVersion: "v1",
          idempotencyKey: randomUUID(),
          reason: "修改月费",
        },
      ],
    ] as const;
    for (const [path, input] of requests) {
      const response = await harness.request(path, input);
      expect(response.statusCode, response.payload).toBe(400);
      expect(JSON.parse(response.payload).code).toBe("VALIDATION_FAILED");
      expect(harness.state.rental).toEqual(before);
    }
  });
});

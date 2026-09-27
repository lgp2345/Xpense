import type { RentalContractDepositTerm } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import type { BillingSource } from "./billing.types.js";
import { billingFingerprint, buildDepositDrafts } from "./billing-source.rules.js";

const deposit: RentalContractDepositTerm = {
  id: "first",
  type: "rental",
  customName: null,
  calculationMode: "rent_multiple",
  fixedAmountMinor: null,
  rentMultiple: "1.0",
  finalAmountMinor: 300000,
  sortOrder: 0,
};
describe("押金业务身份", () => {
  it("UUID 重建、排序和倍数规范化不改变来源键，重复项独立", () => {
    const before = buildDepositDrafts([deposit, { ...deposit, id: "second", sortOrder: 1 }], {});
    const after = buildDepositDrafts(
      [
        { ...deposit, id: "new-second", sortOrder: 9, rentMultiple: "1.0000" },
        { ...deposit, id: "new-first", sortOrder: 3 },
      ],
      {},
    );
    expect(before.map((x) => x.sourceKey).sort()).toEqual(after.map((x) => x.sourceKey).sort());
    expect(new Set(before.map((x) => x.sourceKey)).size).toBe(2);
    const retained = buildDepositDrafts([deposit], {
      [before[0]?.sourceKey as string]: "2026-01-01",
    });
    expect(retained[0]?.sourceKey).toBe(before[0]?.sourceKey);
    expect(retained[0]?.dueDate).toBe("2026-01-01");
  });
  it("固定押金与倍数金额使用已确认的最终值，费用名称变化换来源", () => {
    const draft = buildDepositDrafts(
      [
        {
          ...deposit,
          calculationMode: "fixed_amount",
          fixedAmountMinor: 100,
          rentMultiple: null,
          finalAmountMinor: 100,
        },
      ],
      {},
    );
    expect(draft[0]?.amountMinor).toBe(100);
    expect(buildDepositDrafts([{ ...deposit, customName: "新名称" }], {})[0]?.sourceKey).not.toBe(
      buildDepositDrafts([deposit], {})[0]?.sourceKey,
    );
  });
  it("指纹排除重建标识和纯排序，包含金额及请求日期，键顺序无关", () => {
    const source = {
      organizationId: "org",
      currencyCode: "CNY",
      timezone: "Asia/Shanghai",
      today: "2026-01-01",
      terminationRecordedAt: null,
      contract: {
        id: "contract",
        lifecycleStatus: "confirmed",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        rentAmountMinor: 300000,
        billingAnchor: "calendar_month",
        paymentIntervalMonths: 3,
        dueDaysBefore: 0,
        terminationDate: null,
        depositTerms: [deposit],
        spaces: [],
        parties: [],
      },
      activeBills: [],
      adjustment: null,
    } as unknown as BillingSource;
    const input = { contractId: "contract", depositDueDates: { a: "2026-01-01", b: "2026-02-01" } };
    const changed = {
      ...source,
      contract: {
        ...source.contract,
        depositTerms: [{ ...deposit, id: "new", sortOrder: 99, rentMultiple: "1.0000" }],
      },
    };
    expect(billingFingerprint(source, input)).toBe(
      billingFingerprint(changed, {
        ...input,
        depositDueDates: { b: "2026-02-01", a: "2026-01-01" },
      }),
    );
    expect(billingFingerprint(source, input)).not.toBe(
      billingFingerprint(
        { ...source, contract: { ...source.contract, rentAmountMinor: 1 } },
        input,
      ),
    );
    expect(billingFingerprint(source, input)).not.toBe(
      billingFingerprint(source, { ...input, depositDueDates: { a: "2026-02-01" } }),
    );
  });
});

import { describe, expect, it } from "vitest";

import { calculateBillFinancialTotals } from "./bill-financial-summary.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

function projectionFacts(input: {
  contractId: string;
  bills: RentalCashProjectionFacts["bills"];
  cashEntries?: RentalCashProjectionFacts["cashEntries"];
  settlement?: RentalCashProjectionFacts["settlement"];
  settlementBillIds?: string[];
}): RentalCashProjectionFacts {
  return {
    organizationId: "org",
    contractId: input.contractId,
    contract: {
      billingMode: "monthly_settlement",
      lifecycleStatus: "confirmed",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      rentAmountMinor: 100_000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
      terminationDate: null,
      cancelledAt: null,
    },
    bills: input.bills,
    cashEntries: input.cashEntries ?? [],
    settlement: input.settlement ?? null,
    settlementBillIds: input.settlementBillIds ?? [],
    readings: [],
  };
}

function bill(input: {
  id: string;
  contractId: string;
  amountMinor: number;
  status?: string;
}): RentalCashProjectionFacts["bills"][number] {
  return {
    id: input.id,
    type: "monthly",
    status: input.status ?? "active",
    modelVersion: 2,
    billingMonth: "2026-09",
    revision: 1,
    amountMinor: input.amountMinor,
    sourceKey: `monthly:${input.id}`,
    dueDate: "2026-09-30",
  };
}

function cash(input: {
  id: string;
  contractId: string;
  billId?: string | null;
  settlementId?: string | null;
  kind: string;
  amountMinor: number;
  revokedAt?: Date | null;
}): RentalCashProjectionFacts["cashEntries"][number] {
  return {
    id: input.id,
    contractId: input.contractId,
    billId: input.billId ?? null,
    settlementId: input.settlementId ?? null,
    kind: input.kind,
    purpose: "bill_receipt",
    amountMinor: input.amountMinor,
    occurredOn: "2026-09-01",
    revokedAt: input.revokedAt ?? null,
  };
}

describe("匹配账单的未结算财务对象汇总", () => {
  it("按独立对象求应收和应退，不用另一个合同的余额抵销", () => {
    const result = calculateBillFinancialTotals(
      [
        { id: "bill-receivable", contractId: "contract-a", modelVersion: 2 },
        { id: "bill-refundable", contractId: "contract-b", modelVersion: 2 },
      ],
      [
        projectionFacts({
          contractId: "contract-a",
          bills: [bill({ id: "bill-receivable", contractId: "contract-a", amountMinor: 100 })],
        }),
        projectionFacts({
          contractId: "contract-b",
          bills: [bill({ id: "bill-refundable", contractId: "contract-b", amountMinor: 0 })],
          cashEntries: [
            cash({
              id: "cash-b",
              contractId: "contract-b",
              billId: "bill-refundable",
              kind: "receipt",
              amountMinor: 70,
            }),
          ],
        }),
      ],
      "org",
      "2026-10-01",
    );

    expect(result).toEqual({
      receivedMinor: 70,
      refundedMinor: 0,
      outstandingMinor: 100,
      refundableMinor: 70,
    });
    expect(
      calculateBillFinancialTotals(
        [{ id: "legacy-bill", contractId: "legacy-contract", modelVersion: 1 }],
        [],
        "org",
        "2026-10-01",
      ),
    ).toBeNull();
    expect(calculateBillFinancialTotals([], [], "org", "2026-10-01")).toBeNull();
  });

  it("匹配到结算真实关联账单时只计当前结算一次，排除关联账单自身缺口", () => {
    const result = calculateBillFinancialTotals(
      [
        { id: "bill-a", contractId: "contract-a", modelVersion: 2 },
        { id: "bill-b", contractId: "contract-a", modelVersion: 2 },
        { id: "bill-c", contractId: "contract-a", modelVersion: 2 },
      ],
      [
        projectionFacts({
          contractId: "contract-a",
          bills: [
            bill({ id: "bill-a", contractId: "contract-a", amountMinor: 100 }),
            bill({ id: "bill-b", contractId: "contract-a", amountMinor: 200 }),
            bill({ id: "bill-c", contractId: "contract-a", amountMinor: 100 }),
            {
              ...bill({ id: "deposit", contractId: "contract-a", amountMinor: 1_000 }),
              type: "deposit",
            },
          ],
          settlement: {
            id: "settlement-a",
            eventId: "event-a",
            kind: "termination",
            effectiveEndDate: "2026-09-30",
            revision: 1,
            finalCostMinor: 1_000,
            status: "settled",
          },
          settlementBillIds: ["bill-a", "bill-b"],
          cashEntries: [
            cash({
              id: "receipt",
              contractId: "contract-a",
              billId: "deposit",
              kind: "receipt",
              amountMinor: 100,
            }),
            cash({
              id: "bill-c-receipt",
              contractId: "contract-a",
              billId: "bill-c",
              kind: "receipt",
              amountMinor: 40,
            }),
          ],
        }),
      ],
      "org",
      "2026-10-01",
    );

    expect(result).toEqual({
      receivedMinor: 140,
      refundedMinor: 0,
      outstandingMinor: 920,
      refundableMinor: 0,
    });
  });

  it("没有命中真实关联时不因合同存在结算而加入整份结算差额", () => {
    const result = calculateBillFinancialTotals(
      [{ id: "unlinked-bill", contractId: "contract-a", modelVersion: 2 }],
      [
        projectionFacts({
          contractId: "contract-a",
          bills: [
            bill({ id: "unlinked-bill", contractId: "contract-a", amountMinor: 100 }),
            {
              ...bill({ id: "deposit", contractId: "contract-a", amountMinor: 1_000 }),
              type: "deposit",
            },
          ],
          settlement: {
            id: "settlement-a",
            eventId: "event-a",
            kind: "termination",
            effectiveEndDate: "2026-09-30",
            revision: 1,
            finalCostMinor: 1_000,
            status: "settled",
          },
          settlementBillIds: ["different-bill"],
          cashEntries: [
            cash({
              id: "deposit-receipt",
              contractId: "contract-a",
              billId: "deposit",
              kind: "receipt",
              amountMinor: 1_000,
            }),
          ],
        }),
      ],
      "org",
      "2026-10-01",
    );

    expect(result).toEqual({
      receivedMinor: 0,
      refundedMinor: 0,
      outstandingMinor: 100,
      refundableMinor: 0,
    });
  });

  it("保留作废账单的有效历史现金、忽略撤销现金并把它作为零应收对象", () => {
    const result = calculateBillFinancialTotals(
      [
        { id: "legacy-bill", contractId: "contract-a", modelVersion: 1 },
        { id: "voided-bill", contractId: "contract-a", modelVersion: 2 },
      ],
      [
        projectionFacts({
          contractId: "contract-a",
          bills: [
            bill({
              id: "voided-bill",
              contractId: "contract-a",
              amountMinor: 300_000,
              status: "voided",
            }),
          ],
          cashEntries: [
            cash({
              id: "receipt",
              contractId: "contract-a",
              billId: "voided-bill",
              kind: "receipt",
              amountMinor: 300_000,
            }),
            cash({
              id: "revoked-refund",
              contractId: "contract-a",
              billId: "voided-bill",
              kind: "refund",
              amountMinor: 300_000,
              revokedAt: new Date("2026-09-15T00:00:00.000Z"),
            }),
            cash({
              id: "refund",
              contractId: "contract-a",
              billId: "voided-bill",
              kind: "refund",
              amountMinor: 100,
            }),
          ],
        }),
      ],
      "org",
      "2026-10-01",
    );

    expect(result).toEqual({
      receivedMinor: 300_000,
      refundedMinor: 100,
      outstandingMinor: 0,
      refundableMinor: 299_900,
    });
  });

  it("拒绝不匹配的组织合同身份、缺失目标事实及超出安全整数的跨对象合计", () => {
    const row = { id: "bill-a", contractId: "contract-a", modelVersion: 2 };
    const facts = projectionFacts({
      contractId: "contract-a",
      bills: [bill({ id: "bill-a", contractId: "contract-a", amountMinor: 1 })],
    });
    expect(() => calculateBillFinancialTotals([row], [facts], "other-org", "2026-10-01")).toThrow();
    expect(() => calculateBillFinancialTotals([row], [], "org", "2026-10-01")).toThrow();
    expect(() =>
      calculateBillFinancialTotals(
        [
          { id: "bill-a", contractId: "contract-a", modelVersion: 2 },
          { id: "bill-b", contractId: "contract-b", modelVersion: 2 },
        ],
        [
          facts,
          projectionFacts({
            contractId: "contract-b",
            bills: [
              bill({
                id: "bill-b",
                contractId: "contract-b",
                amountMinor: Number.MAX_SAFE_INTEGER,
              }),
            ],
          }),
        ],
        "org",
        "2026-10-01",
      ),
    ).toThrow("超出安全整数范围");
  });

  it("方案 A 按 linked settlement 与匹配独立账单现金并集汇总，重叠现金只计一次", () => {
    const result = calculateBillFinancialTotals(
      [
        { id: "linked-month", contractId: "contract-a", modelVersion: 2 },
        { id: "independent-month", contractId: "contract-a", modelVersion: 2 },
      ],
      [
        projectionFacts({
          contractId: "contract-a",
          bills: [
            bill({ id: "linked-month", contractId: "contract-a", amountMinor: 100 }),
            bill({ id: "independent-month", contractId: "contract-a", amountMinor: 100 }),
            {
              ...bill({ id: "deposit", contractId: "contract-a", amountMinor: 1_000 }),
              type: "deposit",
            },
          ],
          settlement: {
            id: "settlement-a",
            eventId: "event-a",
            kind: "termination",
            effectiveEndDate: "2026-09-30",
            revision: 1,
            finalCostMinor: 200,
            status: "settled",
          },
          settlementBillIds: ["linked-month", "deposit"],
          cashEntries: [
            cash({
              id: "independent-receipt",
              contractId: "contract-a",
              billId: "independent-month",
              kind: "receipt",
              amountMinor: 100,
            }),
            cash({
              id: "deposit-receipt",
              contractId: "contract-a",
              billId: "deposit",
              kind: "receipt",
              amountMinor: 1_000,
            }),
            cash({
              id: "settlement-refund",
              contractId: "contract-a",
              settlementId: "settlement-a",
              kind: "refund",
              amountMinor: 900,
            }),
          ],
        }),
      ],
      "org",
      "2026-10-01",
    );

    expect(result).toEqual({
      receivedMinor: 1_100,
      refundedMinor: 900,
      outstandingMinor: 0,
      refundableMinor: 0,
    });
  });

  it("历史收款合计超出安全整数时失败", () => {
    expect(() =>
      calculateBillFinancialTotals(
        [
          { id: "bill-a", contractId: "contract-a", modelVersion: 2 },
          { id: "bill-b", contractId: "contract-a", modelVersion: 2 },
        ],
        [
          projectionFacts({
            contractId: "contract-a",
            bills: [
              bill({ id: "bill-a", contractId: "contract-a", amountMinor: 0 }),
              bill({ id: "bill-b", contractId: "contract-a", amountMinor: 0 }),
            ],
            cashEntries: [
              cash({
                id: "receipt-a",
                contractId: "contract-a",
                billId: "bill-a",
                kind: "receipt",
                amountMinor: Number.MAX_SAFE_INTEGER,
              }),
              cash({
                id: "receipt-b",
                contractId: "contract-a",
                billId: "bill-b",
                kind: "receipt",
                amountMinor: 1,
              }),
            ],
          }),
        ],
        "org",
        "2026-10-01",
      ),
    ).toThrow("超出安全整数范围");
  });
});

import { describe, expect, it } from "vitest";

import { rentalBillLines } from "../../db/schema.js";
import { loadBillDetails } from "./bills.queries.js";
import type { BillRecord } from "./bills.repository.types.js";

describe("账单明细兼容可选财务快照", () => {
  it("legacy 空值字段不泄漏，新费用行保留 note 和 feeSnapshot", async () => {
    const common = {
      organizationId: "org",
      contractId: "contract",
      billId: "bill",
      kind: "water" as const,
      label: "水费",
      amountMinor: 100,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
    };
    const lines = [
      { ...common, id: "legacy-line", sortOrder: 0, note: null, feeSnapshot: null },
      {
        ...common,
        id: "monthly-line",
        sortOrder: 1,
        note: "修正读数",
        feeSnapshot: {
          kind: "water" as const,
          startReadingId: "reading-start",
          endReadingId: "reading-end",
          startDate: "2026-08-01",
          endDate: "2026-09-01",
          startReading: "10",
          endReading: "11",
          unitPrice: "100",
          overrideReason: null,
        },
      },
    ];
    const executor = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            orderBy: async () => (table === rentalBillLines ? lines : []),
          }),
        }),
      }),
    };
    const bill = {
      id: "bill",
      organizationId: "org",
      contractId: "contract",
      propertyId: "property",
      billNumber: "RB-2026-000001",
      contractNumber: "RC-2026-0001",
      propertyName: "房产",
      currencyCode: "CNY",
      type: "monthly",
      status: "active",
      sourceKey: "monthly:2026-09",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-09-30",
      amountMinor: 100,
      generationId: "generation",
      adjustmentId: null,
      snapshot: {
        propertyId: "property",
        propertyName: "房产",
        contractNumber: "RC-2026-0001",
        spaces: [],
        parties: [],
      },
      depositSourceId: null,
      depositSnapshot: null,
      voidReason: null,
      voidedAt: null,
      voidedBy: null,
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 1,
      createdByUserId: "user",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    } as unknown as BillRecord;

    const [detail] = await loadBillDetails([bill], executor as never);

    expect(detail?.lines[0]).not.toHaveProperty("note");
    expect(detail?.lines[0]).not.toHaveProperty("feeSnapshot");
    expect(detail?.lines[1]).toMatchObject({
      note: "修正读数",
      feeSnapshot: { startReadingId: "reading-start", endReadingId: "reading-end" },
    });
  });
});

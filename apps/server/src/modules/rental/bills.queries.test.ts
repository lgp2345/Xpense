import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { rentalBillLines, rentalBills } from "../../db/schema.js";
import { loadBillDetails, queryBillPage } from "./bills.queries.js";
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

describe("月度账单列表投影", () => {
  it("保留版本元数据，并将月度应收独立汇总，不混入租金或押金", async () => {
    const bill = {
      id: "monthly-bill",
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
      amountMinor: 12_300,
      generationId: "generation",
      adjustmentId: null,
      snapshot: {},
      depositSourceId: null,
      depositSnapshot: null,
      voidReason: null,
      voidedAt: null,
      voidedBy: null,
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 3,
      createdByUserId: "user",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    } as unknown as BillRecord;
    let selectedTotals = false;
    let totalsSelection: Record<string, unknown> | undefined;
    const executor = {
      select: (selection?: Record<string, unknown>) => {
        selectedTotals = selection !== undefined;
        if (selection) totalsSelection = selection;
        return {
          from: (table: unknown) => ({
            where: () =>
              selectedTotals
                ? Promise.resolve([{ total: 1, rent: "10200", deposit: "500", monthly: "12300" }])
                : {
                    orderBy: () => ({
                      limit: () => ({ offset: async () => (table === rentalBills ? [bill] : []) }),
                    }),
                  },
          }),
        };
      },
    };

    const page = await queryBillPage("org", {}, executor as never);

    expect(page.items[0]).toMatchObject({ modelVersion: 2, billingMonth: "2026-09", revision: 3 });
    expect(page.totals).toMatchObject({
      rentAmountMinor: 10_200,
      depositAmountMinor: 500,
      monthlyAmountMinor: 12_300,
    });
    const rentExpression = new PgDialect().sqlToQuery(totalsSelection?.rent as never);
    const rentSql = rentExpression.sql.toLowerCase();
    expect(rentSql).toContain(
      `when "rental_bills"."status" = 'active' and "rental_bills"."type" = 'rent' then "rental_bills"."amount_minor"`,
    );
    expect(rentSql).toContain(
      `when "rental_bills"."status" = 'active' and "rental_bills"."type" = 'monthly' then (`,
    );
    expect(rentSql).toContain('from "rental_bill_lines"');
    expect(rentSql).toContain('"rental_bill_lines"."bill_id" = "rental_bills"."id"');
    expect(rentSql).toContain(`"rental_bill_lines"."kind" = 'rent_period'`);
    expect(rentSql).not.toContain(" join ");
    expect(new PgDialect().sqlToQuery(totalsSelection?.monthly as never).sql).toContain(
      `"rental_bills"."type" = 'monthly' then "rental_bills"."amount_minor"`,
    );
    expect(new PgDialect().sqlToQuery(totalsSelection?.deposit as never).sql).toContain(
      `"rental_bills"."type" = 'deposit' then "rental_bills"."amount_minor"`,
    );
  });
});

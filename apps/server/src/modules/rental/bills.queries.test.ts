import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { rentalBillLines, rentalBills } from "../../db/schema.js";
import * as billQueries from "./bills.queries.js";
import {
  billListCondition,
  loadBillDetails,
  queryBillPage,
  withBillFinancial,
} from "./bills.queries.js";
import type { BillRecord } from "./bills.repository.types.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

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

  it("按现金命令对已作废新版账单用零应收投影，保留历史票据金额且不改旧版账单", () => {
    const bill = {
      id: "voided-deposit",
      billNumber: "RB-2026-000002",
      contractId: "contract",
      contractNumber: "RC-2026-0001",
      propertyId: "property",
      propertyName: "房产",
      currencyCode: "CNY",
      type: "deposit",
      status: "voided",
      sourceKey: "deposit:original",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-12-01",
      amountMinor: 300_000,
      dueState: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      modelVersion: 2,
      billingMonth: null,
      revision: 1,
    } as const;
    const facts = (refunded: boolean): RentalCashProjectionFacts => ({
      organizationId: "org",
      contractId: "contract",
      contract: {
        billingMode: "monthly_settlement",
        lifecycleStatus: "confirmed",
        startDate: "2026-12-01",
        endDate: "2027-11-30",
        rentAmountMinor: 50_000,
        billingAnchor: "contract_start",
        paymentIntervalMonths: 1,
        dueDaysBefore: 0,
        terminationDate: null,
        cancelledAt: null,
      },
      bills: [
        {
          id: bill.id,
          type: bill.type,
          status: bill.status,
          modelVersion: bill.modelVersion,
          billingMonth: bill.billingMonth,
          revision: bill.revision,
          amountMinor: bill.amountMinor,
          sourceKey: bill.sourceKey,
          dueDate: bill.dueDate,
        },
      ],
      cashEntries: [
        {
          id: "receipt",
          contractId: "contract",
          billId: bill.id,
          settlementId: null,
          target: { kind: "bill", billId: bill.id },
          kind: "receipt",
          purpose: "deposit_receipt",
          amountMinor: 300_000,
          occurredOn: "2026-12-01",
          revokedAt: null,
        },
        ...(refunded
          ? [
              {
                id: "refund",
                contractId: "contract",
                billId: bill.id,
                settlementId: null,
                target: { kind: "bill" as const, billId: bill.id },
                kind: "refund",
                purpose: "refund",
                amountMinor: 300_000,
                occurredOn: "2026-12-01",
                revokedAt: null,
              },
            ]
          : []),
      ],
      settlement: null,
      settlementBillIds: [],
      readings: [],
    });

    const beforeRefund = withBillFinancial(bill, facts(false), "2026-12-01", "org");
    expect(beforeRefund).toMatchObject({
      amountMinor: 300_000,
      status: "voided",
      financial: { outstandingMinor: 0, refundableMinor: 300_000 },
    });
    const afterRefund = withBillFinancial(bill, facts(true), "2026-12-01", "org");
    expect(afterRefund).toMatchObject({
      financial: { outstandingMinor: 0, refundableMinor: 0 },
    });

    const legacy = { ...bill, modelVersion: 1 as const };
    expect(withBillFinancial(legacy, facts(false), "2026-12-01", "org")).toBe(legacy);
  });
});

describe("全筛选财务账单身份查询", () => {
  it("复用全部列表筛选，只取身份字段且不分页、不联接明细或现金", async () => {
    const selected: Record<string, unknown>[] = [];
    const conditions: unknown[] = [];
    const rows = [{ id: "bill-a", contractId: "contract-a", modelVersion: 2 }];
    const executor = {
      select: (selection: Record<string, unknown>) => {
        selected.push(selection);
        return {
          from: (table: unknown) => ({
            where: (condition: unknown) => {
              expect(table).toBe(rentalBills);
              conditions.push(condition);
              return Promise.resolve(rows);
            },
          }),
        };
      },
    };
    const queryMatching = (billQueries as unknown as Record<string, unknown>)
      .queryMatchingFinancialBills;
    expect(queryMatching).toBeTypeOf("function");
    if (typeof queryMatching !== "function") return;

    await expect(
      queryMatching(
        billListCondition("org", {
          contractId: "contract-a",
          propertyId: "property-a",
          type: "monthly",
          status: "voided",
          dueDateFrom: "2026-09-01",
          dueDateTo: "2026-09-30",
          keyword: "RB%_",
          page: 9,
          pageSize: 1,
        }),
        executor as never,
      ),
    ).resolves.toEqual(rows);

    expect(selected).toHaveLength(1);
    expect(Object.keys(selected[0] ?? {}).sort()).toEqual(["contractId", "id", "modelVersion"]);
    const query = new PgDialect().sqlToQuery(conditions[0] as never);
    expect(query.params).toEqual(
      expect.arrayContaining([
        "org",
        "contract-a",
        "property-a",
        "monthly",
        "voided",
        "2026-09-01",
        "2026-09-30",
      ]),
    );
    expect(query.sql).toContain('"organization_id"');
    expect(query.sql).toContain('"bill_number"');
    expect(query.sql.toLowerCase()).not.toContain("limit");
    expect(query.sql.toLowerCase()).not.toContain("offset");
    expect(query.sql.toLowerCase()).not.toContain("join");
  });
});

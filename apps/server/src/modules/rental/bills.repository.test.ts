import { writeFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { DB } from "../../db/db.tokens.js";
import { rentalBillLines, rentalBillMeterIntervals, rentalBills } from "../../db/schema.js";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import type { BillingSource, PersistableBillingDraft } from "./billing.types.js";
import { assembleBillingPreview } from "./billing-plan.rules.js";
import { billListCondition } from "./bills.queries.js";
import { BillsRepository, buildNextBillNumbersStatement } from "./bills.repository.js";

const dialect = new PgDialect();
describe("账单仓储作用域及原子编号", () => {
  it.each([1, 30, 100])("%i 年月付合同完整预览及批量写入，无按行查询", async (years) => {
    const source = rentalBillingSource({
      endDate: `${2025 + years}-12-31`,
      paymentIntervalMonths: 1,
    });
    const start = performance.now();
    const initial = assembleBillingPreview(source, {
      contractId: source.contract.id,
      depositDueDates: {},
    });
    const plan = assembleBillingPreview(source, {
      contractId: source.contract.id,
      depositDueDates: Object.fromEntries(
        initial.missingDepositSourceKeys.map((key) => [key, "2026-01-01"]),
      ),
    });
    const previewMs = performance.now() - start;
    const drafts = plan.creates.map((draft) => {
      if (!draft.dueDate) throw new Error("missing due date");
      return { ...draft, dueDate: draft.dueDate, adjustmentId: null };
    });
    const lines = drafts.reduce((sum, draft) => sum + draft.lines.length, 0);
    expect(drafts).toHaveLength(years * 12 + 2);
    expect(lines).toBe(years * 12 + 2);
    let billQueries = 0,
      lineQueries = 0;
    const executor = {
      execute: vi.fn().mockResolvedValue([{ lastValue: drafts.length }]),
      insert: (table: unknown) => ({
        values: (rows: unknown[]) => {
          if (table === rentalBills) {
            billQueries++;
            return { returning: async () => rows };
          }
          if (table === rentalBillLines) {
            lineQueries++;
            return Promise.resolve();
          }
          throw new Error("unexpected table");
        },
      }),
    };
    const module = await Test.createTestingModule({
      providers: [BillsRepository, { provide: DB, useValue: {} }],
    }).compile();
    const generateStart = performance.now();
    const records = await module
      .get(BillsRepository)
      .insertBills(
        { organizationId: source.organizationId, userId: "user", today: source.today },
        source,
        "generation",
        drafts,
        executor as never,
      );
    const generateMs = performance.now() - generateStart;
    expect(records).toHaveLength(years * 12 + 2);
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(billQueries).toBe(Math.ceil(drafts.length / 500));
    expect(lineQueries).toBe(Math.ceil(lines / 500));
    await writeFile(
      `/tmp/xpense-billing-perf-${years}.json`,
      JSON.stringify({
        years,
        bills: records.length,
        rentFragments: years * 12,
        lines,
        writeQueries: 1 + billQueries + lineQueries,
        previewMs,
        generateMs,
        environment:
          "local pure preview and real repository with instrumented executor; excludes database I/O",
      }),
    );
    await module.close();
  });
  it("筛选 SQL 参数化且组织隔离，有效与作废可查询", () => {
    const query = dialect.sqlToQuery(
      billListCondition("org", {
        contractId: "contract",
        type: "rent",
        status: "voided",
        keyword: "100%_",
      }),
    );
    expect(query.params).toEqual(expect.arrayContaining(["org", "contract", "rent", "voided"]));
    expect(query.sql).toContain('"organization_id"');
    expect(query.sql).not.toContain("100%_");
  });
  it("整批分配组织年度编号，不按行执行编号查询", () => {
    const query = dialect.sqlToQuery(buildNextBillNumbersStatement("org", 2026, 101));
    expect(query.params).toEqual(expect.arrayContaining(["org", 2026, 101]));
    expect(query.sql.toLowerCase()).toContain("on conflict");
    expect(query.sql.toLowerCase()).toContain("returning");
  });
  it("生成查询使用提供的事务，记录不存在返回 null", async () => {
    const module = await Test.createTestingModule({
      providers: [BillsRepository, { provide: DB, useValue: {} }],
    }).compile();
    const where = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) });
    const executor = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
    };
    await expect(
      module.get(BillsRepository).findGeneration("org", "request", executor as never),
    ).resolves.toBeNull();
    expect(dialect.sqlToQuery(where.mock.calls[0]?.[0]).params).toEqual(["org", "request"]);
    await module.close();
  });
  it("批量保存快照不携带承租人电话或证件，明细归属同一事务账单", async () => {
    const source = {
      currencyCode: "CNY",
      contract: {
        id: "contract",
        propertyId: "property",
        propertyName: "房产",
        contractNumber: "RC",
        spaces: [
          {
            spaceId: "space",
            spaceName: "101",
            spaceCode: null,
            spacePath: [],
            rentAllocationMinor: null,
          },
        ],
        parties: [
          {
            tenantId: "tenant",
            name: "租户",
            isPrimaryPayer: true,
            phone: "sensitive-fixture",
            maskedDocumentNumber: "private-fixture",
          },
        ],
      },
    } as unknown as BillingSource;
    const line = {
      kind: "deposit" as const,
      label: "押金",
      amountMinor: 100,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 0,
    };
    const draft: PersistableBillingDraft = {
      type: "deposit",
      sourceKey: "deposit-key",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-01-01",
      amountMinor: 100,
      lines: [line],
      depositSourceId: null,
      depositSnapshot: null,
      adjustmentId: null,
    };
    let billRows: unknown[] = [];
    let lineRows: unknown[] = [];
    const executor = {
      execute: vi.fn().mockResolvedValue([{ lastValue: 1 }]),
      insert: (table: unknown) => ({
        values: (rows: unknown[]) => {
          if (table === rentalBills) {
            billRows = rows;
            return { returning: async () => rows };
          }
          if (table === rentalBillLines) {
            lineRows = rows;
            return Promise.resolve();
          }
          throw new Error("unexpected table");
        },
      }),
    };
    const module = await Test.createTestingModule({
      providers: [BillsRepository, { provide: DB, useValue: {} }],
    }).compile();
    const records = await module
      .get(BillsRepository)
      .insertBills(
        { organizationId: "org", userId: "user", today: "2026-01-01" },
        source,
        "generation",
        [draft],
        executor as never,
      );
    expect(records).toHaveLength(1);
    expect(billRows[0]).toMatchObject({
      billNumber: "RB-2026-000001",
      organizationId: "org",
      contractId: "contract",
      generationId: "generation",
      snapshot: { parties: [{ tenantId: "tenant", name: "租户", isPrimaryPayer: true }] },
    });
    expect(JSON.stringify(billRows)).not.toContain("sensitive-fixture");
    expect(JSON.stringify(billRows)).not.toContain("private-fixture");
    expect(lineRows[0]).toMatchObject({
      billId: records[0]?.id,
      organizationId: "org",
      contractId: "contract",
      amountMinor: 100,
    });
    await expect(
      module
        .get(BillsRepository)
        .insertBills(
          { organizationId: "org", userId: "user", today: "2026-01-01" },
          source,
          "generation",
          [{ ...draft, amountMinor: 99 }],
          executor as never,
        ),
    ).rejects.toThrow("lines do not match");
    await module.close();
  });

  it("月度账单插入保留 v2 月份和修订输入，旧调用仍由默认值兼容", async () => {
    const source = {
      currencyCode: "CNY",
      contract: {
        id: "contract",
        propertyId: "property",
        propertyName: "房产",
        contractNumber: "RC",
        spaces: [
          {
            spaceId: "space",
            spaceName: "101",
            spaceCode: null,
            spacePath: [],
            rentAllocationMinor: null,
          },
        ],
        parties: [],
      },
    } as unknown as BillingSource;
    const draft = {
      type: "monthly",
      sourceKey: "monthly:2026-09",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-09-30",
      amountMinor: 100,
      lines: [
        {
          kind: "water",
          label: "水费",
          amountMinor: 100,
          periodStart: null,
          periodEnd: null,
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 0,
          feeSnapshot: {
            kind: "water",
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
      ],
      depositSourceId: null,
      depositSnapshot: null,
      adjustmentId: null,
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 1,
    } as unknown as PersistableBillingDraft;
    const billRows: unknown[] = [];
    const lineRows: unknown[] = [];
    const intervalRows: unknown[] = [];
    const executor = {
      execute: vi.fn().mockResolvedValue([{ lastValue: 1 }]),
      insert: (table: unknown) => ({
        values: (rows: unknown[]) => {
          if (table === rentalBills) {
            billRows.push(...rows);
            return { returning: async () => rows };
          }
          if (table === rentalBillLines) {
            lineRows.push(...rows);
            return Promise.resolve();
          }
          if (table === rentalBillMeterIntervals) {
            intervalRows.push(...rows);
            return Promise.resolve();
          }
          throw new Error("unexpected table");
        },
      }),
    };
    const module = await Test.createTestingModule({
      providers: [BillsRepository, { provide: DB, useValue: {} }],
    }).compile();

    await module
      .get(BillsRepository)
      .insertBills(
        { organizationId: "org", userId: "user", today: "2026-09-01" },
        source,
        "generation",
        [draft],
        executor as never,
      );

    expect(billRows[0]).toMatchObject({
      type: "monthly",
      sourceKey: "monthly:2026-09",
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 1,
    });
    expect(lineRows[0]).toMatchObject({
      feeSnapshot: expect.objectContaining({ endReadingId: "reading-end" }),
    });
    expect(intervalRows[0]).toMatchObject({
      organizationId: "org",
      contractId: "contract",
      spaceId: "space",
      billId: billRows.length ? (billRows[0] as { id: string }).id : undefined,
      billLineId: (lineRows[0] as { id: string }).id,
      kind: "water",
      startReadingId: "reading-start",
      endReadingId: "reading-end",
    });
    await module.close();
  });

  it("v2 押金账单保留空月份并落成 modelVersion 2", async () => {
    const source = rentalBillingSource();
    const depositTerm = source.contract.depositTerms[0];
    if (!depositTerm) throw new Error("missing fixture deposit term");
    const draft: PersistableBillingDraft = {
      type: "deposit",
      modelVersion: 2,
      billingMonth: null,
      revision: 1,
      sourceKey: `deposit:${depositTerm.id}`,
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-01-01",
      amountMinor: 300000,
      lines: [
        {
          kind: "deposit",
          label: "租赁押金",
          amountMinor: 300000,
          periodStart: null,
          periodEnd: null,
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 0,
        },
      ],
      depositSourceId: depositTerm.id,
      depositSnapshot: depositTerm,
      adjustmentId: null,
    };
    const billRows: unknown[] = [];
    const executor = {
      execute: vi.fn().mockResolvedValue([{ lastValue: 1 }]),
      insert: (table: unknown) => ({
        values: (rows: unknown[]) => {
          if (table === rentalBills) {
            billRows.push(...rows);
            return { returning: async () => rows };
          }
          if (table === rentalBillLines) return Promise.resolve();
          throw new Error("unexpected table");
        },
      }),
    };
    const module = await Test.createTestingModule({
      providers: [BillsRepository, { provide: DB, useValue: {} }],
    }).compile();

    await module
      .get(BillsRepository)
      .insertBills(
        { organizationId: source.organizationId, userId: "user", today: source.today },
        source,
        "generation",
        [draft],
        executor as never,
      );

    expect(billRows[0]).toMatchObject({
      type: "deposit",
      modelVersion: 2,
      billingMonth: null,
      revision: 1,
      amountMinor: 300000,
      depositSourceId: depositTerm.id,
    });
    await module.close();
  });
});

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  rentalBillLines,
  rentalBillMeterIntervals,
  rentalBillRevisions,
  rentalBills,
  rentalMeterReadings,
} from "../../db/schema.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("BillRevisionsRepository", () => {
  it("append 保留当前快照，稳定账单 ID 并递增 revision、替换带真实行 ID 的区间", async () => {
    const currentBill = {
      id: "bill",
      ...scope,
      type: "monthly",
      modelVersion: 2,
      billingMonth: "2026-09",
      revision: 1,
      amountMinor: 100,
      snapshot: { propertyName: "房产" },
    };
    const currentLine = {
      id: "line-before",
      ...scope,
      billId: "bill",
      kind: "water",
      label: "水费",
      amountMinor: 100,
      feeSnapshot: { kind: "water", endReadingId: "reading-before" },
    };
    const newLine = {
      kind: "water" as const,
      label: "水费",
      amountMinor: 125,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 0,
      note: "修正读数",
      feeSnapshot: {
        kind: "water" as const,
        startReadingId: "reading-start",
        endReadingId: "reading-end",
        startDate: "2026-08-01",
        endDate: "2026-09-01",
        startReading: "10",
        endReading: "11.25",
        unitPrice: "100",
        overrideReason: null,
      },
    };
    const conditions: unknown[] = [];
    const writes: Array<{ table: unknown; value: unknown }> = [];
    const updateValues: unknown[] = [];
    const deletes: unknown[] = [];
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((condition: unknown) => {
            conditions.push(condition);
            return Promise.resolve(
              table === rentalBills
                ? [currentBill]
                : table === rentalBillLines
                  ? [currentLine]
                  : table === rentalMeterReadings
                    ? [
                        {
                          id: "reading-start",
                          spaceId: "space",
                          kind: "water",
                          predecessorId: null,
                        },
                        {
                          id: "reading-end",
                          spaceId: "space",
                          kind: "water",
                          predecessorId: "reading-start",
                        },
                      ]
                    : [],
            );
          }),
        })),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: unknown) => {
          writes.push({ table, value });
          const rows = Array.isArray(value) ? value : [value];
          return {
            returning: vi.fn().mockResolvedValue(rows.map((row) => ({ id: "new-line", ...row }))),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: Record<string, unknown>) => {
          updateValues.push(value);
          return {
            where: vi.fn(() => ({
              returning: vi
                .fn()
                .mockResolvedValue([
                  { ...currentBill, amountMinor: value.amountMinor, revision: 2 },
                ]),
            })),
          };
        }),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn((condition: unknown) => {
          deletes.push({ table, condition });
          return Promise.resolve();
        }),
      })),
    };

    const result = await new BillRevisionsRepository().append(
      scope,
      "bill",
      [newLine],
      125,
      "修正水表读数",
      actor,
      executor as never,
    );

    expect(result.bill).toMatchObject({ id: "bill", revision: 2, amountMinor: 125 });
    expect(writes[0]?.table).toBe(rentalBillRevisions);
    expect(writes[0]?.value).toMatchObject({
      ...scope,
      billId: "bill",
      revision: 1,
      amountMinor: 100,
      reason: "修正水表读数",
      createdByUserId: actor.userId,
      linesSnapshot: [currentLine],
    });
    expect(updateValues[0]).toMatchObject({ amountMinor: 125 });
    expect(
      dialect.sqlToQuery((updateValues[0] as Record<string, unknown>).revision as never).sql,
    ).toContain("+ 1");
    expect(writes.find((write) => write.table === rentalBillLines)?.value).toMatchObject([
      expect.objectContaining({ billId: "bill", kind: "water", feeSnapshot: newLine.feeSnapshot }),
    ]);
    const intervalRows = writes.find((write) => write.table === rentalBillMeterIntervals)?.value;
    expect(intervalRows).toMatchObject([
      expect.objectContaining({
        ...scope,
        spaceId: "space",
        billId: "bill",
        billLineId: (
          writes.find((write) => write.table === rentalBillLines)?.value as Array<{ id: string }>
        )[0]?.id,
        kind: "water",
        startReadingId: "reading-start",
        endReadingId: "reading-end",
      }),
    ]);
    expect(conditions.map((condition) => dialect.sqlToQuery(condition as never).params)).toEqual(
      expect.arrayContaining([expect.arrayContaining(["org", "contract", "bill"])]),
    );
    expect(deletes.map((value) => (value as { table: unknown }).table)).toEqual([
      rentalBillMeterIntervals,
      rentalBillLines,
    ]);
  });
});

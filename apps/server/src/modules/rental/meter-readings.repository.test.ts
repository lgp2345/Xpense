import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalMeterReadings } from "../../db/schema.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("MeterReadingsRepository", () => {
  it("list 每次都按组织和合同读取读数", async () => {
    let condition: unknown;
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((value: unknown) => {
            condition = value;
            return { orderBy: vi.fn().mockResolvedValue([]) };
          }),
        })),
      })),
    };

    await new MeterReadingsRepository().list(scope, executor as never);

    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "contract"]);
  });

  it("appendBoundary 只保存服务端派生的空间和前驱，并追加操作者及原因", async () => {
    let insertedTable: unknown;
    let inserted: Record<string, unknown> | undefined;
    const executor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: Record<string, unknown>) => {
          insertedTable = table;
          inserted = value;
          return {
            returning: vi
              .fn()
              .mockResolvedValue([{ ...value, id: "reading", revision: 1, createdAt: new Date() }]),
          };
        }),
      })),
    };

    const result = await new MeterReadingsRepository().appendBoundary(
      scope,
      {
        kind: "water",
        readingDate: "2026-09-01",
        reading: "12.5000",
        spaceId: "server-space",
        predecessorId: "server-predecessor",
      },
      "新抄表边界",
      actor,
      executor as never,
    );

    expect(insertedTable).toBe(rentalMeterReadings);
    expect(inserted).toMatchObject({
      ...scope,
      spaceId: "server-space",
      predecessorId: "server-predecessor",
      kind: "water",
      reading: "12.5000",
      revision: 1,
      reason: "新抄表边界",
      createdByUserId: actor.userId,
    });
    expect(result.id).toBe("reading");
  });
});

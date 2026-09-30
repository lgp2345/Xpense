import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalSettlementBills, rentalSettlements } from "../../db/schema.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("RentalSettlementsRepository", () => {
  it("findCurrent 按组织和合同加载当前结算", async () => {
    let condition: unknown;
    const current = { id: "settlement", ...scope, eventId: "event", revision: 1 };
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((value: unknown) => {
            expect(table).toBe(rentalSettlements);
            condition = value;
            return Promise.resolve([current]);
          }),
        })),
      })),
    };

    await expect(
      new RentalSettlementsRepository().findCurrent(scope, executor as never),
    ).resolves.toEqual(current);
    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "contract"]);
  });

  it("scope locator 只凭组织和 settlement id 派生合同范围", async () => {
    let condition: unknown;
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((value: unknown) => {
            expect(table).toBe(rentalSettlements);
            condition = value;
            return { limit: vi.fn().mockResolvedValue([{ contractId: "contract" }]) };
          }),
        })),
      })),
    };

    await expect(
      new RentalSettlementsRepository().findContractId("org", "settlement", executor as never),
    ).resolves.toBe("contract");
    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "settlement"]);
  });

  it("只从实际合同结算关联表读取当前结算纳入的账单", async () => {
    let condition: unknown;
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((value: unknown) => {
            expect(table).toBe(rentalSettlementBills);
            condition = value;
            return { orderBy: vi.fn().mockResolvedValue([{ billId: "bill" }]) };
          }),
        })),
      })),
    };

    await expect(
      new RentalSettlementsRepository().billIds(scope, "settlement", executor as never),
    ).resolves.toEqual(["bill"]);
    expect(dialect.sqlToQuery(condition as never).params).toEqual([
      "org",
      "contract",
      "settlement",
    ]);
  });

  it("linkBills 在单一组织合同范围内替换当前关联账单", async () => {
    let deletedTable: unknown;
    let deleteCondition: unknown;
    let insertedTable: unknown;
    let links: unknown;
    const executor = {
      delete: vi.fn((table: unknown) => ({
        where: vi.fn((condition: unknown) => {
          deletedTable = table;
          deleteCondition = condition;
          return Promise.resolve();
        }),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: unknown) => {
          insertedTable = table;
          links = value;
          return Promise.resolve();
        }),
      })),
    };

    await new RentalSettlementsRepository().linkBills(
      scope,
      "settlement",
      ["bill-a", "bill-b"],
      executor as never,
    );

    expect(deletedTable).toBe(rentalSettlementBills);
    expect(dialect.sqlToQuery(deleteCondition as never).params).toEqual([
      "org",
      "contract",
      "settlement",
    ]);
    expect(insertedTable).toBe(rentalSettlementBills);
    expect(links).toEqual([
      { ...scope, settlementId: "settlement", billId: "bill-a" },
      { ...scope, settlementId: "settlement", billId: "bill-b" },
    ]);
  });

  it("create 保留独立生命周期 eventId 和服务端操作者", async () => {
    const input: Record<string, unknown>[] = [];
    const record = { id: "settlement", ...scope, eventId: "event", revision: 1 };
    const executor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: Record<string, unknown>) => {
          expect(table).toBe(rentalSettlements);
          input.push(value);
          return { returning: vi.fn().mockResolvedValue([record]) };
        }),
      })),
    };

    await new RentalSettlementsRepository().create(
      scope,
      {
        effectiveEndDate: "2026-09-29",
        finalBills: [],
        finalCostMinor: 100,
        differenceMinor: 0,
      },
      { eventId: "event", kind: "termination", status: "settled", version: "v1" },
      actor,
      executor as never,
    );

    expect(input[0]).toMatchObject({
      ...scope,
      eventId: "event",
      kind: "termination",
      effectiveEndDate: "2026-09-29",
      finalCostMinor: 100,
      confirmedByUserId: actor.userId,
      revision: 1,
    });
  });
});

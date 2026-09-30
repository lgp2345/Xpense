import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalCashEntries } from "../../db/schema.js";
import { RentalCashRepository } from "./rental-cash.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("RentalCashRepository", () => {
  it("revoke 保留原金额并只追加撤销字段，查询同时限定组织、合同和记录", async () => {
    let values: Record<string, unknown> | undefined;
    let condition: unknown;
    const executor = {
      update: vi.fn((table: unknown) => ({
        set: vi.fn((value: Record<string, unknown>) => {
          expect(table).toBe(rentalCashEntries);
          values = value;
          return {
            where: vi.fn((where: unknown) => {
              condition = where;
              return { returning: vi.fn().mockResolvedValue([{ id: "cash" }]) };
            }),
          };
        }),
      })),
      delete: vi.fn(() => {
        throw new Error("cash history must not be physically deleted");
      }),
    };

    await new RentalCashRepository().revoke(scope, "cash", "重复登记", actor, executor as never);

    expect(values).toMatchObject({
      revokedByUserId: actor.userId,
      revokeReason: "重复登记",
    });
    expect(values).toHaveProperty("revokedAt");
    expect(values).not.toHaveProperty("amountMinor");
    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "contract", "cash"]);
    expect(executor.delete).not.toHaveBeenCalled();
  });

  it("insert 将 bill target 与真实 kind/purpose 列及 actor 一同写入", async () => {
    let insertedTable: unknown;
    let input: Record<string, unknown> | undefined;
    const record = {
      id: "cash",
      ...scope,
      billId: "bill",
      settlementId: null,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100,
      createdByUserId: actor.userId,
    };
    const executor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: Record<string, unknown>) => {
          insertedTable = table;
          input = value;
          return { returning: vi.fn().mockResolvedValue([record]) };
        }),
      })),
    };

    await new RentalCashRepository().insert(
      scope,
      {
        target: { kind: "bill", billId: "bill" },
        kind: "receipt",
        purpose: "bill_receipt",
        amountMinor: 100,
        occurredOn: "2026-09-29",
        note: null,
      },
      actor,
      executor as never,
    );

    expect(insertedTable).toBe(rentalCashEntries);
    expect(input).toMatchObject({
      ...scope,
      billId: "bill",
      settlementId: null,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100,
      createdByUserId: actor.userId,
    });
  });

  it("entry scope locator 必须同时限定组织和 entry id", async () => {
    let condition: unknown;
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((value: unknown) => {
            expect(table).toBe(rentalCashEntries);
            condition = value;
            return { limit: vi.fn().mockResolvedValue([{ contractId: "contract" }]) };
          }),
        })),
      })),
    };

    await expect(
      new RentalCashRepository().findContractIdByEntryId("org", "cash", executor as never),
    ).resolves.toBe("contract");
    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "cash"]);
  });
});

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalFinanceRequests } from "../../db/schema.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("FinanceRequestsRepository", () => {
  it("find 按组织和幂等键查找，使其他合同或动作的冲突可见", async () => {
    let condition: unknown;
    const existing = {
      id: "request",
      organizationId: scope.organizationId,
      contractId: "another-contract",
      idempotencyKey: "same-key",
      action: "record_receipt",
    };
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((value: unknown) => {
            expect(table).toBe(rentalFinanceRequests);
            condition = value;
            return Promise.resolve([existing]);
          }),
        })),
      })),
    };

    await expect(
      new FinanceRequestsRepository().find(scope, "same-key", executor as never),
    ).resolves.toEqual(existing);
    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "same-key"]);
    expect(dialect.sqlToQuery(condition as never).params).not.toContain("contract");
  });

  it("complete 在当前组织合同、动作及 actor 下保存成功结果", async () => {
    let values: Record<string, unknown> | undefined;
    const record = { id: "request", ...scope, idempotencyKey: "key" };
    const executor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: Record<string, unknown>) => {
          expect(table).toBe(rentalFinanceRequests);
          values = value;
          return { returning: vi.fn().mockResolvedValue([record]) };
        }),
      })),
    };

    await new FinanceRequestsRepository().complete(
      scope,
      {
        idempotencyKey: "key",
        action: "record_receipt",
        requestHash: "sha256",
        result: { resourceId: "cash", resourceKind: "cash" },
      },
      actor,
      executor as never,
    );

    expect(values).toMatchObject({
      ...scope,
      idempotencyKey: "key",
      action: "record_receipt",
      requestHash: "sha256",
      result: { resourceId: "cash", resourceKind: "cash" },
      createdByUserId: actor.userId,
    });
  });
});

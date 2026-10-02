import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalChargeTermRevisions, rentalChargeTerms } from "../../db/schema.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";

const scope = { organizationId: "org", contractId: "contract" };
const actor = { userId: "user" };
const dialect = new PgDialect();

describe("ChargeTermsRepository", () => {
  it("find 使用组织和合同复合范围及调用方 executor", async () => {
    let condition: unknown;
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((value: unknown) => {
            condition = value;
            return Promise.resolve([]);
          }),
        })),
      })),
    };

    await new ChargeTermsRepository().find(scope, executor as never);

    expect(dialect.sqlToQuery(condition as never).params).toEqual(["org", "contract"]);
    expect(executor.select).toHaveBeenCalledOnce();
  });

  it("save 原子更新当前条款并以原因和操作者追加完整价格修订", async () => {
    const current = {
      id: "terms",
      ...scope,
      version: 2,
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "12.5000",
      electricityUnitPrice: "1.2500",
      fixedFees: [{ id: "fee", name: "物业费", monthlyAmountMinor: 500 }],
      updatedByUserId: actor.userId,
    };
    const writes: Array<{ table: unknown; value: unknown }> = [];
    const executor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((value: unknown) => {
          writes.push({ table, value });
          return {
            onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([current]) })),
            returning: vi.fn().mockResolvedValue([{ id: "revision" }]),
          };
        }),
      })),
    };

    await new ChargeTermsRepository().save(
      scope,
      {
        waterCollectionEnabled: true,
        electricityCollectionEnabled: true,
        waterUnitPrice: "12.5000",
        electricityUnitPrice: "1.2500",
        fixedFees: [{ id: "fee", name: "物业费", monthlyAmountMinor: 500 }],
      },
      "按新价格更新",
      actor,
      executor as never,
    );

    expect(writes.map((write) => write.table)).toEqual([
      rentalChargeTerms,
      rentalChargeTermRevisions,
    ]);
    expect(writes[1]?.value).toMatchObject({
      organizationId: scope.organizationId,
      contractId: scope.contractId,
      version: 2,
      reason: "按新价格更新",
      createdByUserId: actor.userId,
      termsSnapshot: expect.objectContaining({
        fixedFees: [{ id: "fee", name: "物业费", monthlyAmountMinor: 500 }],
      }),
    });
  });
});

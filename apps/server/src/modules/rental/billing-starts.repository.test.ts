import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { BillingStartsRepository } from "./billing-starts.repository.js";
it("接续查询严格限定组织和合同，不存在返回 null", async () => {
  let condition: unknown;
  const tx = {
    select: vi.fn(() => ({
      from: () => ({
        where: (value: unknown) => {
          condition = value;
          return Promise.resolve([]);
        },
      }),
    })),
  };
  expect(
    await new BillingStartsRepository().find(
      { organizationId: "org", contractId: "contract" },
      tx as never,
    ),
  ).toBeNull();
  expect(new PgDialect().sqlToQuery(condition as never).params).toEqual(["org", "contract"]);
});

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  rentalBillingStarts,
  rentalBills,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContracts,
  rentalSettlements,
} from "../../db/schema.js";
import { PropertyBillingRepository } from "./property-billing.repository.js";

const org = "org";
const property = "property";
function executor(count: number) {
  const contracts = Array.from({ length: count }, (_, n) => ({
    id: String(n).padStart(4, "0"),
    lifecycleStatus: "confirmed",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    terminationDate: null,
    cancelledAt: null,
  }));
  const rows = new Map<unknown, unknown[]>([
    [rentalContracts, contracts],
    [rentalContractSpaces, contracts.map((c) => ({ contractId: c.id, spaceId: "space" }))],
    [rentalBills, []],
    [rentalBillingStarts, []],
    [rentalSettlements, []],
    [rentalContractPartyPeriods, []],
  ]);
  const queries: Array<{ table: unknown; fields: unknown; condition: unknown; limit?: number }> =
    [];
  const tx = {
    select: (fields: unknown) => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          const record = { table, fields, condition, limit: undefined as number | undefined };
          queries.push(record);
          const result = rows.get(table) ?? [];
          const query = {
            // biome-ignore lint/suspicious/noThenProperty: test query is intentionally awaitable.
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
            orderBy: () => query,
            limit: (n: number) => {
              record.limit = n;
              return Promise.resolve(result.slice(0, n));
            },
          };
          return query;
        },
      }),
    }),
    execute: async () => [{ id: "space", parentId: null, name: "101", sortOrder: 0 }],
  };
  return { tx, queries };
}
describe("房产候选批量读取", () => {
  it.each([1, 100])("%s 合同固定7次查询，窄字段与作用域", async (count) => {
    const { tx, queries } = executor(count);
    const result = await new PropertyBillingRepository().scanSources(
      { organizationId: org, propertyId: property, pageSize: 100 },
      tx as never,
    );
    expect(result.sources).toHaveLength(count);
    expect(queries).toHaveLength(6);
    const dialect = new PgDialect();
    for (const q of queries) {
      const sql = dialect.sqlToQuery(q.condition as never);
      expect(sql.params).toContain(org);
      if (q.table === rentalContracts || q.table === rentalContractSpaces)
        expect(sql.params).toContain(property);
      expect(Object.keys(q.fields as object).join(" ")).not.toMatch(
        /phone|identity|document|reading|cash/i,
      );
    }
    expect(queries[0]?.limit).toBe(101);
    expect(result.sources[0]?.path).toEqual([
      { id: "space", parentId: null, name: "101", sortOrder: 0 },
    ]);
  });
  it("扫描游标取实际第100个合同，最后一页为空", async () => {
    const { tx } = executor(101);
    expect(
      (
        await new PropertyBillingRepository().scanSources(
          { organizationId: org, propertyId: property, pageSize: 100 },
          tx as never,
        )
      ).nextAfterContractId,
    ).toBe("0099");
    const end = executor(1);
    expect(
      (
        await new PropertyBillingRepository().scanSources(
          { organizationId: org, propertyId: property, pageSize: 100, afterContractId: "0099" },
          end.tx as never,
        )
      ).nextAfterContractId,
    ).toBeNull();
  });
});

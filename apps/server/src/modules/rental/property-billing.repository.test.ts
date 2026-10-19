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
import { toPropertyBillingCandidate } from "./property-billing.rules.js";

const org = "org";
const property = "property";
function executor(count: number, exhaustFirstPage = false) {
  const contracts = Array.from({ length: count }, (_, n) => ({
    id: String(n).padStart(4, "0"),
    lifecycleStatus: "confirmed",
    displayStatus: "active",
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
    [
      rentalBills,
      exhaustFirstPage
        ? contracts.slice(0, 100).flatMap((c) =>
            Array.from({ length: 12 }, (_, month) => ({
              contractId: c.id,
              periodStart: `2026-${String(month + 1).padStart(2, "0")}-01`,
              periodEnd: `2026-${String(month + 1).padStart(2, "0")}-${[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]}`,
            })),
          )
        : [],
    ],
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
          let result = rows.get(table) ?? [];
          if (table === rentalContracts) {
            const params = new PgDialect().sqlToQuery(condition as never).params;
            if (params.length === 3) result = contracts.filter((c) => c.id > String(params[2]));
          }
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
  return { tx, queries, rows };
}
describe("房产候选批量读取", () => {
  it.each([1, 100])("%s 合同固定7次查询，窄字段与作用域", async (count) => {
    const { tx, queries } = executor(count);
    const result = await new PropertyBillingRepository().scanSources(
      { organizationId: org, propertyId: property, now: "2026-10-18T09:00:00", pageSize: 100 },
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
    const fields = queries[0]?.fields as { displayStatus: never };
    expect(fields).toHaveProperty("displayStatus");
    const status = dialect.sqlToQuery(fields.displayStatus);
    expect(status.params).toContain("2026-10-18T09:00:00");
    expect(status.sql).toContain("23:59:59");
    expect(result.sources[0]?.displayStatus).toBe("active");
    expect(result.sources[0]?.path).toEqual([
      { id: "space", parentId: null, name: "101", sortOrder: 0 },
    ]);
  });
  it("扫描游标取实际第100个合同，最后一页为空", async () => {
    const { tx } = executor(101);
    expect(
      (
        await new PropertyBillingRepository().scanSources(
          { organizationId: org, propertyId: property, now: "2026-10-18T09:00:00", pageSize: 100 },
          tx as never,
        )
      ).nextAfterContractId,
    ).toBe("0099");
    const end = executor(1);
    expect(
      (
        await new PropertyBillingRepository().scanSources(
          {
            organizationId: org,
            propertyId: property,
            now: "2026-10-18T09:00:00",
            pageSize: 100,
            afterContractId: "0099",
          },
          end.tx as never,
        )
      ).nextAfterContractId,
    ).toBeNull();
  });
});

it("201 个扫描合同分三页；首批无候选也推进，最后一批终止", async () => {
  const { tx, queries } = executor(201, true);
  const repo = new PropertyBillingRepository();
  const first = await repo.scanSources(
    { organizationId: org, propertyId: property, now: "2026-10-18T09:00:00", pageSize: 100 },
    tx as never,
  );
  expect(
    first.sources.flatMap((s) => toPropertyBillingCandidate(s, "2026-10-18") ?? []),
  ).toHaveLength(0);
  expect(first.nextAfterContractId).toBe("0099");
  const second = await repo.scanSources(
    {
      organizationId: org,
      propertyId: property,
      now: "2026-10-18T09:00:00",
      pageSize: 100,
      afterContractId: first.nextAfterContractId ?? undefined,
    },
    tx as never,
  );
  expect(
    second.sources.flatMap((s) => toPropertyBillingCandidate(s, "2026-10-18") ?? []),
  ).toHaveLength(100);
  expect(second.nextAfterContractId).toBe("0199");
  const last = await repo.scanSources(
    {
      organizationId: org,
      propertyId: property,
      now: "2026-10-18T09:00:00",
      pageSize: 100,
      afterContractId: second.nextAfterContractId ?? undefined,
    },
    tx as never,
  );
  expect(last.sources).toHaveLength(1);
  expect(last.nextAfterContractId).toBeNull();
  expect(queries).toHaveLength(18);
});

it("候选承租方按账期闭区间相交筛选并去重", async () => {
  const { tx, rows } = executor(1);
  rows.set(rentalBillingStarts, [{ contractId: "0000", firstPeriodStart: "2026-10-01" }]);
  rows.set(rentalContractPartyPeriods, [
    { contractId: "0000", name: "九月旧承租方", validFrom: "2026-01-01", validTo: "2026-09-30" },
    { contractId: "0000", name: "十月前半承租方", validFrom: "2026-10-01", validTo: "2026-10-15" },
    { contractId: "0000", name: "十月后半承租方", validFrom: "2026-10-16", validTo: "2026-10-31" },
    { contractId: "0000", name: "十一月承租方", validFrom: "2026-11-01", validTo: "2026-12-31" },
  ]);
  const repo = new PropertyBillingRepository();
  const source = (
    await repo.scanSources(
      { organizationId: org, propertyId: property, now: "2026-10-18T09:00:00", pageSize: 100 },
      tx as never,
    )
  ).sources[0];
  expect(source).toBeDefined();
  if (!source) throw new Error("source missing");
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual([
    "十月前半承租方",
    "十月后半承租方",
  ]);
  source.firstPeriodStart = "2026-09-01";
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual(["九月旧承租方"]);
  source.firstPeriodStart = "2026-11-01";
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual(["十一月承租方"]);
});

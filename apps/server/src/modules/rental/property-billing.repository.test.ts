import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  rentalBillingStarts,
  rentalBills,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContracts,
  rentalSettlements,
  rentalSpaces,
} from "../../db/schema.js";
import { PropertyBillingRepository } from "./property-billing.repository.js";
import { toPropertyBillingCandidate } from "./property-billing.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

const org = "org";
const property = "property";

function propertyBillingRepository() {
  return new PropertyBillingRepository({
    readMany: async (organizationId: string, contractIds: string[]) =>
      contractIds.map((contractId) => ({
        organizationId,
        contractId,
        contract: {},
        bills: [],
        cashEntries: [],
        settlement: null,
        settlementBillIds: [],
        readings: [],
      })),
  } as never);
}

function scanInput(pageSize: number, afterContractId?: string) {
  return {
    organizationId: org,
    propertyId: property,
    now: "2026-10-18T09:00:00",
    timezone: "UTC",
    pageSize,
    ...(afterContractId ? { afterContractId } : {}),
  };
}

function executor(count: number, exhaustFirstPage = false) {
  const contracts = Array.from({ length: count }, (_, n) => ({
    id: String(n).padStart(4, "0"),
    contractNumber: `RC-2026-${String(n).padStart(6, "0")}`,
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
    [
      rentalContractSpaces,
      contracts.map((c) => ({ contractId: c.id, spaceId: "space", deletedAt: null })),
    ],
    [
      rentalBills,
      exhaustFirstPage
        ? contracts.flatMap((c, contractIndex) =>
            contractIndex < 100
              ? Array.from({ length: 12 }, (_, month) => ({
                  ...bill(
                    `${c.id}-${String(month + 1).padStart(2, "0")}`,
                    "period",
                    "active",
                    10_000,
                    `period:${month + 1}`,
                    {
                      periodStart: `2026-${String(month + 1).padStart(2, "0")}-01`,
                      periodEnd: `2026-${String(month + 1).padStart(2, "0")}-${[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]}`,
                    },
                  ),
                  contractId: c.id,
                }))
              : [
                  {
                    ...bill(`${c.id}-deposit`, "deposit", "active", 10_000, "deposit:security"),
                    contractId: c.id,
                  },
                ],
          )
        : [],
    ],
    [rentalBillingStarts, []],
    [rentalSettlements, []],
    [rentalContractPartyPeriods, []],
  ]);
  const queries: Array<{ table: unknown; fields: unknown; condition: unknown; limit?: number }> =
    [];
  const joins: Array<{ table: unknown; condition: unknown }> = [];
  const tx = {
    select: (fields: unknown) => ({
      from: (table: unknown) => {
        const selection = {
          innerJoin: (joinedTable: unknown, condition: unknown) => {
            joins.push({ table: joinedTable, condition });
            return selection;
          },
          where: (condition: unknown) => {
            const record = { table, fields, condition, limit: undefined as number | undefined };
            queries.push(record);
            let result = rows.get(table) ?? [];
            const params = new PgDialect().sqlToQuery(condition as never).params;
            const knownContractIds = new Set(
              ((rows.get(rentalContracts) ?? []) as Array<{ id: string }>).map((contract) =>
                String(contract.id),
              ),
            );
            const requestedContractIds = params.filter(
              (param) => typeof param === "string" && knownContractIds.has(param),
            );
            if (table !== rentalContracts && requestedContractIds.length) {
              result = result.filter((row) =>
                requestedContractIds.includes(String((row as { contractId?: unknown }).contractId)),
              );
            }
            if (table === rentalContracts) {
              if (params.length === 3) result = contracts.filter((c) => c.id > String(params[2]));
            }
            if (table === rentalBills && params.includes("active")) {
              result = result.filter((row) => (row as { status?: string }).status === "active");
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
        };
        return selection;
      },
    }),
    execute: async () =>
      [{ id: "space", parentId: null, name: "101", sortOrder: 0 }] as Array<{
        id: string;
        parentId: string | null;
        name: string;
        sortOrder: number;
      }>,
  };
  return { tx, queries, rows, joins };
}
describe("房产候选批量读取", () => {
  it("履行中合同关联已删除空间时跳过，保留其他候选与扫描游标", async () => {
    const { tx, rows } = executor(3);
    rows.set(rentalContractSpaces, [
      { contractId: "0000", spaceId: "deleted-space", deletedAt: new Date("2026-10-01") },
      { contractId: "0001", spaceId: "space", deletedAt: null },
      { contractId: "0002", spaceId: "space", deletedAt: null },
    ]);
    const result = await propertyBillingRepository().scanSources(scanInput(2), tx as never);
    expect(result.sources.map((source) => source.contractId)).toEqual(["0001"]);
    expect(result.nextAfterContractId).toBe("0001");
  });

  it("多空间合同即使只剩一个未删除空间也不能成为单空间候选", async () => {
    const { tx, rows } = executor(1);
    rows.set(rentalContractSpaces, [
      { contractId: "0000", spaceId: "deleted-space", deletedAt: new Date("2026-10-01") },
      { contractId: "0000", spaceId: "space", deletedAt: null },
    ]);
    const result = await propertyBillingRepository().scanSources(scanInput(100), tx as never);
    expect(result.sources).toEqual([]);
  });

  it.each([
    "upcoming",
    "expired",
    "terminated",
  ])("在读取路径前排除 %s 合同，空候选页仍推进扫描游标", async (displayStatus) => {
    const { tx, rows } = executor(2);
    rows.set(
      rentalContracts,
      (rows.get(rentalContracts) as Array<Record<string, unknown>>).map((contract) => ({
        ...contract,
        displayStatus,
        lifecycleStatus: displayStatus === "terminated" ? "terminated" : "confirmed",
      })),
    );
    tx.execute = async () => [];
    await expect(
      propertyBillingRepository().scanSources(scanInput(1), tx as never),
    ).resolves.toEqual({ sources: [], unpaidBills: [], nextAfterContractId: "0000" });
  });

  it("履行中合同的祖先缺失仍报错，不静默丢弃待出账项目", async () => {
    const { tx } = executor(1);
    tx.execute = async () => [];
    await expect(
      propertyBillingRepository().scanSources(scanInput(100), tx as never),
    ).rejects.toThrow("空间祖先路径不完整");
  });

  it.each([1, 100])("%s 合同扫描查询批次固定，窄字段与作用域", async (count) => {
    const { tx, queries, joins } = executor(count);
    const result = await propertyBillingRepository().scanSources(scanInput(100), tx as never);
    expect(result.sources).toHaveLength(count);
    expect(result.sources[0]?.contractNumber).toBe("RC-2026-000000");
    expect(queries.find((query) => query.table === rentalContracts)?.fields).toMatchObject({
      contractNumber: rentalContracts.contractNumber,
    });
    expect(queries).toHaveLength(6);
    const dialect = new PgDialect();
    expect(joins).toHaveLength(1);
    expect(joins[0]?.table === rentalSpaces).toBe(true);
    const joinSql = dialect.sqlToQuery(joins[0]?.condition as never).sql;
    expect(joinSql).toContain('"rental_spaces"."id" = "rental_contract_spaces"."space_id"');
    expect(joinSql).toContain(
      '"rental_spaces"."organization_id" = "rental_contract_spaces"."organization_id"',
    );
    expect(joinSql).toContain(
      '"rental_spaces"."property_id" = "rental_contract_spaces"."property_id"',
    );
    for (const q of queries) {
      const sql = dialect.sqlToQuery(q.condition as never);
      expect(sql.params).toContain(org);
      if (
        q.table === rentalContracts ||
        q.table === rentalContractSpaces ||
        q.table === rentalBills
      )
        expect(sql.params).toContain(property);
      expect(Object.keys(q.fields as object).join(" ")).not.toMatch(
        /phone|identity|document|reading|cash/i,
      );
    }
    expect(queries[0]?.limit).toBe(101);
    const spaceFields = queries.find((q) => q.table === rentalContractSpaces)?.fields as {
      deletedAt: unknown;
    };
    expect(spaceFields.deletedAt === rentalSpaces.deletedAt).toBe(true);
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
      (await propertyBillingRepository().scanSources(scanInput(100), tx as never))
        .nextAfterContractId,
    ).toBe("0099");
    const end = executor(1);
    expect(
      (await propertyBillingRepository().scanSources(scanInput(100, "0099"), end.tx as never))
        .nextAfterContractId,
    ).toBeNull();
  });
});

it("201 个扫描合同分三页；首批无候选也推进，最后一批终止", async () => {
  const { tx, queries } = executor(201, true);
  const repo = propertyBillingRepository();
  const first = await repo.scanSources(scanInput(100), tx as never);
  expect(
    first.sources.flatMap((s) => toPropertyBillingCandidate(s, "2026-10-18") ?? []),
  ).toHaveLength(0);
  expect(first.unpaidBills).toHaveLength(1200);
  expect(first.unpaidBills.every(({ bill }) => bill.contractId < "0100")).toBe(true);
  expect(first.nextAfterContractId).toBe("0099");
  const second = await repo.scanSources(
    {
      ...scanInput(100, first.nextAfterContractId ?? undefined),
    },
    tx as never,
  );
  expect(
    second.sources.flatMap((s) => toPropertyBillingCandidate(s, "2026-10-18") ?? []),
  ).toHaveLength(100);
  expect(second.unpaidBills).toHaveLength(100);
  expect(
    second.unpaidBills.every(({ bill }) => bill.contractId >= "0100" && bill.contractId < "0200"),
  ).toBe(true);
  expect(second.nextAfterContractId).toBe("0199");
  const last = await repo.scanSources(
    {
      ...scanInput(100, second.nextAfterContractId ?? undefined),
    },
    tx as never,
  );
  expect(last.sources).toHaveLength(1);
  expect(last.unpaidBills.map(({ bill }) => bill.contractId)).toEqual(["0200"]);
  expect(last.nextAfterContractId).toBeNull();
  expect(queries).toHaveLength(18);
});

it("候选承租方按账期闭区间相交筛选并去重", async () => {
  const { tx, rows } = executor(1);
  rows.set(rentalBillingStarts, [{ contractId: "0000", firstPeriodStart: "2026-10-01" }]);
  rows.set(rentalBills, [
    {
      ...bill("period-current", "period", "active", 10_000, "period:2026-10", {
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      }),
      contractId: "0000",
    },
  ]);
  rows.set(rentalContractPartyPeriods, [
    { contractId: "0000", name: "九月旧承租方", validFrom: "2026-01-01", validTo: "2026-09-30" },
    { contractId: "0000", name: "十月前半承租方", validFrom: "2026-10-01", validTo: "2026-10-15" },
    { contractId: "0000", name: "十月后半承租方", validFrom: "2026-10-16", validTo: "2026-10-31" },
    { contractId: "0000", name: "十一月承租方", validFrom: "2026-11-01", validTo: "2026-12-31" },
  ]);
  tx.execute = async () => [
    { id: "current-building", parentId: null, name: "新楼", sortOrder: 3 },
    {
      id: "space",
      parentId: "current-building",
      name: "当前房间名",
      sortOrder: 7,
    },
  ];
  const repo = propertyBillingRepository();
  const result = await repo.scanSources(scanInput(100), tx as never);
  const source = result.sources[0];
  expect(source).toBeDefined();
  if (!source) throw new Error("source missing");
  const currentSpacePath = [
    { id: "current-building", parentId: null, name: "新楼", sortOrder: 3 },
    { id: "space", parentId: "current-building", name: "当前房间名", sortOrder: 7 },
  ];
  expect(source.path).toEqual(currentSpacePath);
  expect(result.unpaidBills).toHaveLength(1);
  expect(result.unpaidBills[0]?.spaceId).toBe("space");
  expect(result.unpaidBills[0]?.path).toEqual(currentSpacePath);
  expect(result.unpaidBills[0]?.tenantNames).toEqual(["历史账单租户"]);
  source.activePeriods = [];
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual([
    "十月前半承租方",
    "十月后半承租方",
  ]);
  source.firstPeriodStart = "2026-09-01";
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual(["九月旧承租方"]);
  source.firstPeriodStart = "2026-11-01";
  expect(toPropertyBillingCandidate(source, "2026-10-18")?.tenantNames).toEqual(["十一月承租方"]);
});

it("结束合同仍返回部分收款的周期与押金账单，并排除结清、待退款及作废账单", async () => {
  const { tx, rows } = executor(1);
  rows.set(rentalContracts, [
    {
      id: "ended-contract",
      lifecycleStatus: "terminated",
      displayStatus: "terminated",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      rentAmountMinor: 100_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      terminationDate: "2025-10-31",
      cancelledAt: null,
    },
  ]);
  rows.set(rentalContractSpaces, [
    { contractId: "ended-contract", spaceId: "space", deletedAt: null },
  ]);
  const periodBill = bill("period-partial", "period", "active", 100_000, "period:2025-10", {
    periodStart: "2025-10-01",
    periodEnd: "2025-10-31",
  });
  periodBill.snapshot.parties = [];
  const depositBill = bill("deposit-partial", "deposit", "active", 50_000, "deposit:security");
  const depositWithoutSnapshotTenant = bill(
    "deposit-date-fallback",
    "deposit",
    "active",
    8_000,
    "deposit:date-fallback",
  );
  depositWithoutSnapshotTenant.snapshot.parties = [];
  const bills = [
    periodBill,
    {
      ...depositBill,
      snapshot: {
        ...depositBill.snapshot,
        spaces: [
          ...depositBill.snapshot.spaces,
          {
            spaceId: "space-2",
            spaceName: "账单生成时第二房间",
            spaceCode: "102",
            spacePath: [
              { id: "old-building", name: "旧楼" },
              { id: "space-2", name: "账单生成时第二房间" },
            ],
            rentAllocationMinor: null,
          },
        ],
      },
    },
    depositWithoutSnapshotTenant,
    bill("deposit-settled", "deposit", "active", 20_000, "deposit:settled"),
    bill("settlement-paid-original", "deposit", "active", 2_000, "deposit:settlement-paid"),
    bill("settlement-unpaid-original", "deposit", "active", 3_000, "deposit:settlement-unpaid"),
    bill("deposit-refund-only", "deposit", "active", 10_000, "deposit:refund"),
    bill("period-voided", "period", "voided", 30_000, "period:voided", {
      periodStart: "2025-09-01",
      periodEnd: "2025-09-30",
    }),
  ];
  rows.set(rentalBills, bills);
  rows.set(rentalContractPartyPeriods, [
    {
      contractId: "ended-contract",
      name: "账期历史租户",
      validFrom: "2025-10-01",
      validTo: "2025-10-31",
    },
    {
      contractId: "ended-contract",
      name: "押金开单时租户",
      validFrom: "2025-08-01",
      validTo: "2025-09-30",
    },
    {
      contractId: "ended-contract",
      name: "后来入住租户",
      validFrom: "2025-11-01",
      validTo: "2026-12-31",
    },
  ]);
  rows.set(rentalContractSpaces, [
    { contractId: "ended-contract", spaceId: "space", deletedAt: null },
    { contractId: "ended-contract", spaceId: "space-2", deletedAt: null },
  ]);
  tx.execute = async () => [];
  const projection: RentalCashProjectionFacts = {
    organizationId: org,
    contractId: "ended-contract",
    contract: {
      lifecycleStatus: "terminated",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      rentAmountMinor: 100_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      terminationDate: "2025-10-31",
      cancelledAt: null,
    },
    bills: bills.map(
      ({ id, type, status, periodStart, periodEnd, amountMinor, sourceKey, dueDate }) => ({
        id,
        type,
        status,
        periodStart,
        periodEnd,
        revision: 1,
        amountMinor,
        sourceKey,
        dueDate,
      }),
    ),
    cashEntries: [
      cash("period-partial", "ended-contract", "period-partial", 40_000),
      cash("deposit-partial", "ended-contract", "deposit-partial", 20_000),
      cash("deposit-date-fallback", "ended-contract", "deposit-date-fallback", 3_000),
      cash("deposit-settled", "ended-contract", "deposit-settled", 20_000),
      cash("settlement-paid-original", "ended-contract", "settlement-paid-original", 2_000),
      cash("deposit-refund-only", "ended-contract", "deposit-refund-only", 15_000),
    ],
    settlement: {
      id: "settlement",
      eventId: "termination-event",
      kind: "termination",
      effectiveEndDate: "2025-10-31",
      revision: 1,
      finalCostMinor: 5_000,
      status: "active",
    },
    settlementBillIds: ["settlement-paid-original", "settlement-unpaid-original"],
    readings: [],
  };
  const projectionSources = { readMany: async () => [projection] };
  const result = await new PropertyBillingRepository(projectionSources as never).scanSources(
    scanInput(100),
    tx as never,
  );

  expect(result.sources).toEqual([]);
  expect(
    result.unpaidBills.map(({ bill: item }) => [
      item.id,
      item.amountMinor,
      item.financial?.outstandingMinor,
    ]),
  ).toEqual([
    ["period-partial", 100_000, 60_000],
    ["deposit-partial", 50_000, 30_000],
    ["deposit-date-fallback", 8_000, 5_000],
  ]);
  expect(result.unpaidBills.map(({ tenantNames }) => tenantNames)).toEqual([
    ["账期历史租户"],
    ["历史账单租户"],
    ["押金开单时租户"],
  ]);
  expect(result.unpaidBills.map(({ spaceId }) => spaceId)).toEqual(["space", "space", "space"]);
  expect(result.unpaidBills[0]?.path).toEqual([
    { id: "old-building", parentId: null, name: "旧楼", sortOrder: 0 },
    { id: "space", parentId: "old-building", name: "账单生成时房间", sortOrder: 0 },
  ]);
});

function bill(
  id: string,
  type: "period" | "deposit",
  status: "active" | "voided",
  amountMinor: number,
  sourceKey: string,
  dates: { periodStart: string; periodEnd: string } | undefined = undefined,
) {
  const space = {
    spaceId: "space",
    spaceName: "账单生成时房间",
    spaceCode: "101",
    spacePath: [
      { id: "old-building", name: "旧楼" },
      { id: "space", name: "账单生成时房间" },
    ],
    rentAllocationMinor: null,
  };
  return {
    id,
    organizationId: org,
    contractId: "ended-contract",
    propertyId: property,
    billNumber: id,
    contractNumber: "C-OLD",
    propertyName: "历史房产名",
    currencyCode: "CNY",
    type,
    status,
    revision: 1,
    sourceKey,
    periodStart: dates?.periodStart ?? null,
    periodEnd: dates?.periodEnd ?? null,
    effectiveEnd: dates?.periodEnd ?? null,
    dueDate: "2025-10-10",
    amountMinor,
    generationId: "generation",
    adjustmentId: null,
    snapshot: {
      propertyId: property,
      propertyName: "历史房产名",
      contractNumber: "C-OLD",
      spaces: [space],
      parties: [{ tenantId: "old-tenant", name: "历史账单租户", isPrimaryPayer: true }],
    },
    depositSourceId: null,
    depositSnapshot: null,
    voidReason: status === "voided" ? "已作废" : null,
    voidedAt: status === "voided" ? new Date("2025-09-01T00:00:00Z") : null,
    voidedBy: status === "voided" ? "user" : null,
    createdByUserId: "user",
    createdAt: new Date("2025-09-01T00:00:00Z"),
  };
}

function cash(
  id: string,
  contractId: string,
  billId: string,
  amountMinor: number,
  kind: "receipt" | "refund" = "receipt",
) {
  return {
    id,
    organizationId: org,
    contractId,
    billId,
    settlementId: null,
    kind,
    purpose: kind === "refund" ? "refund" : "bill_receipt",
    amountMinor,
    occurredOn: "2025-10-15",
    revokedAt: null,
  };
}

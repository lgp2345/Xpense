import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { rentalContracts } from "../../db/schema.js";
import {
  createRentalDatabaseFake,
  createRentalQueryFixtureRegistry,
} from "../../test/rental-fake-query.js";
import { createRentalTestState } from "../../test/rental-test-state.js";
import {
  buildSpaceConflictStatement,
  findSpaceConflicts,
  SPACE_CONFLICT_QUERY_ADAPTER,
} from "./contract-conflicts.queries.js";
import {
  buildContractCountQuery,
  buildContractDetailQuery,
  buildContractListQuery,
  buildPropertyContractCountsQuery,
} from "./contracts.queries.js";
import { buildNextContractNumberStatement, ContractsRepository } from "./contracts.repository.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
function compileSql(value: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return new PgDialect().sqlToQuery(value);
}
describe("ContractsRepository queries", () => {
  it("renders organization-scoped stable pagination and the same derived display filter in list and count", () => {
    const input = {
      keyword: "RC-2026",
      propertyId: "property-1",
      tenantId: "tenant-1",
      status: "active" as const,
      startDateFrom: "2026-01-01",
      startDateTo: "2026-12-31",
      endDateFrom: "2026-01-01",
      endDateTo: "2027-12-31",
      page: 2,
      pageSize: 20,
    };
    const list = buildContractListQuery(
      new QueryBuilder() as never,
      "organization-1",
      "2026-08-30",
      input,
    ).toSQL();
    const count = buildContractCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      "2026-08-30",
      input,
    ).toSQL();
    const listSql = normalizeSql(list.sql);
    const countSql = normalizeSql(count.sql);
    for (const sql of [listSql, countSql]) {
      expect(sql).toContain('"rental_contracts"."organization_id" = $');
      expect(sql).toContain('"rental_contracts"."deleted_at" is null');
      expect(sql).toContain('"rental_contracts"."property_id" = $');
      expect(sql).toContain('"rental_contract_party_periods"."tenant_id" = $');
      expect(sql).toContain("case");
      expect(sql).toContain("expiring_soon");
      expect(sql).toContain("termination_date");
    }
    expect(listSql).toContain(
      'order by "rental_contracts"."updated_at" desc, "rental_contracts"."id" desc',
    );
    expect(listSql).toContain("limit $");
    expect(listSql).toContain("offset $");
    expect(list.params).toEqual(
      expect.arrayContaining([
        "organization-1",
        "property-1",
        "tenant-1",
        "2026-08-30",
        "active",
        20,
      ]),
    );
    expect(count.params).toEqual(expect.arrayContaining(["organization-1", "active"]));
  });

  it("uses actualEnd in the display status SQL for scheduled terminations", () => {
    const query = buildContractListQuery(
      new QueryBuilder() as never,
      "organization-1",
      "2026-08-20",
      { page: 1, pageSize: 20 },
    ).toSQL();
    expect(normalizeSql(query.sql)).toContain("coalesce");
    expect(normalizeSql(query.sql)).toContain('"termination_date"');
  });

  it("reads confirmed tenant and space names from frozen snapshots after source records are renamed", () => {
    const detail = buildContractDetailQuery(
      new QueryBuilder() as never,
      "organization-1",
      "contract-1",
      "2026-08-30",
    ).toSQL();
    const sql = normalizeSql(detail.sql);

    expect(sql).toContain('coalesce("period"."tenant_name_snapshot", "tenant"."name")');
    expect(sql).toContain(
      'case when "period"."valid_from" is not null then "period"."masked_document_number_snapshot" else "tenant"."masked_document_number" end',
    );
    expect(sql).not.toContain(
      'coalesce("period"."masked_document_number_snapshot", "tenant"."masked_document_number")',
    );
    expect(sql).toContain('coalesce("contract_space"."space_name_snapshot", "space"."name")');
    expect(sql).toContain('coalesce("contract_space"."space_path_snapshot", jsonb_build_array(');
    expect(sql).not.toContain('"identity_snapshot_ciphertext"');
    expect(sql).not.toContain('"identity_snapshot_key_version"');
    expect(sql).toContain('"rental_contracts"."organization_id" = $');
    expect(sql).toContain('"rental_contracts"."deleted_at" is null');
    expect(detail.params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1", "2026-08-30"]),
    );
  });
});

describe("ContractsRepository", () => {
  it("maps mutually exclusive actual-end contract buckets from one aggregate query", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([
        { activeContractCount: "2", upcomingContractCount: "3", expiringSoonContractCount: "1" },
      ]);
    const repository = new ContractsRepository({} as never);

    await expect(
      repository.countPropertyContracts("organization-1", "property-1", "2026-08-31", {
        execute,
      } as never),
    ).resolves.toEqual({
      activeContractCount: 2,
      upcomingContractCount: 3,
      expiringSoonContractCount: 1,
    });

    const query = compileSql(
      buildPropertyContractCountsQuery("organization-1", "property-1", "2026-08-31"),
    );
    expect(normalizeSql(query.sql)).toContain("coalesce");
    expect(normalizeSql(query.sql)).toContain("count(*) filter");
    expect(normalizeSql(query.sql)).toContain("termination_date");
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", "2026-08-31"]),
    );
  });

  it("fails closed when contract reference protection has no execute executor", async () => {
    const repository = new ContractsRepository({} as never);

    await expect(
      repository.findContractReferenceSummary(
        { organizationId: "organization-1", propertyId: "property-1", today: "2026-08-31" },
        {} as never,
      ),
    ).rejects.toThrow("Contract reference protection requires a database execute executor");
  });

  it("locks only the organization-owned undeleted contract through the supplied executor", async () => {
    const record = { id: "contract-1", organizationId: "organization-1" };
    const limit = vi.fn().mockResolvedValue([record]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new ContractsRepository({} as never);

    await expect(
      repository.findForUpdate("organization-1", "contract-1", { select } as never),
    ).resolves.toEqual(record);

    expect(forUpdate).toHaveBeenCalledWith("update");
    const condition = where.mock.calls[0]?.[0];
    const compiled = normalizeSql(compileSql(condition).sql);
    expect(compiled).toContain('"rental_contracts"."organization_id" = $');
    expect(compiled).toContain('"rental_contracts"."id" = $');
    expect(compiled).toContain('"rental_contracts"."deleted_at" is null');
    expect(compileSql(condition).params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1"]),
    );
  });

  it("atomically advances an organization-year counter and formats six digits without reuse", async () => {
    const statement = compileSql(buildNextContractNumberStatement("organization-1", 2026));
    const sql = normalizeSql(statement.sql);
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ lastValue: 41 }])
      .mockResolvedValueOnce([{ lastValue: 42 }]);
    const repository = new ContractsRepository({} as never);

    await expect(
      repository.nextContractNumber("organization-1", 2026, { execute } as never),
    ).resolves.toBe("RC-2026-000041");
    await expect(
      repository.nextContractNumber("organization-1", 2026, { execute } as never),
    ).resolves.toBe("RC-2026-000042");

    expect(sql).toContain('insert into "rental_contract_number_counters"');
    expect(sql).toContain("on conflict");
    expect(sql).toContain("do update");
    expect(sql).toContain('"last_value" + 1');
    expect(sql).toContain("returning");
    expect(statement.params).toEqual(expect.arrayContaining(["organization-1", 2026, 1]));
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("keeps header writes organization-scoped and on the caller transaction executor", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "contract-1", status: "draft" }])
      .mockResolvedValueOnce([{ id: "contract-1", note: "updated" }])
      .mockResolvedValueOnce([{ id: "contract-1", status: "confirmed" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    const softDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const softDeleteSet = vi.fn().mockReturnValue({ where: softDeleteWhere });
    const insert = vi.fn().mockReturnValue({ values });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set })
      .mockReturnValueOnce({ set })
      .mockReturnValueOnce({ set: softDeleteSet });
    const repository = new ContractsRepository({} as never);
    const executor = { insert, update } as never;

    await repository.createDraft(
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        contractNumber: "RC-2026-000001",
        externalContractNumber: null,
        startDate: null,
        endDate: null,
        rentAmountMinor: null,
        billingAnchor: null,
        paymentIntervalMonths: null,
        dueDaysBefore: null,
        renewedFromContractId: null,
        note: null,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      executor,
    );
    await repository.updateHeader(
      {
        organizationId: "organization-1",
        id: "contract-1",
        propertyId: "property-1",
        externalContractNumber: null,
        startDate: "2026-09-01",
        endDate: "2027-08-31",
        rentAmountMinor: 100_000,
        billingAnchor: "contract_start",
        paymentIntervalMonths: 1,
        dueDaysBefore: 5,
        note: "updated",
        updatedByUserId: "user-1",
      },
      executor,
    );
    await repository.setLifecycle(
      {
        organizationId: "organization-1",
        id: "contract-1",
        status: "confirmed",
        updatedByUserId: "user-1",
      },
      executor,
    );
    await repository.softDelete(
      {
        organizationId: "organization-1",
        id: "contract-1",
        deletedByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      executor,
    );

    expect(insert).toHaveBeenCalledWith(rentalContracts);
    expect(update).toHaveBeenCalledTimes(3);
    for (const call of [...updateWhere.mock.calls, ...softDeleteWhere.mock.calls]) {
      const query = compileSql(call[0]);
      expect(query.params).toEqual(expect.arrayContaining(["organization-1", "contract-1"]));
      expect(normalizeSql(query.sql)).toContain('"rental_contracts"."deleted_at" is null');
    }
    expect(normalizeSql(compileSql(softDeleteWhere.mock.calls[0]?.[0]).sql)).toContain(
      '"rental_contracts"."status" = $',
    );
  });
});

describe("contract space conflicts", () => {
  const input = {
    organizationId: "organization-1",
    propertyId: "property-1",
    spaceIds: ["11111111-1111-4111-8111-111111111111"],
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    excludeContractId: "22222222-2222-4222-8222-222222222222",
  };

  it("renders a parameterized four-level same-property ancestor/descendant inclusive conflict query", () => {
    const query = compileSql(buildSpaceConflictStatement(input));
    const sql = normalizeSql(query.sql);

    expect(sql).toContain("with recursive");
    expect(sql).toContain('"space_ancestors"');
    expect(sql).toContain('"space_descendants"');
    expect(sql).toContain('"organization_id" = $');
    expect(sql).toContain('"property_id" = $');
    expect(sql).toContain('"deleted_at" is null');
    expect(sql).toContain('"depth" < $');
    expect(sql).toContain("in ('confirmed', 'terminated')");
    expect(sql).toContain('"contract"."start_date" <= $');
    expect(sql).toContain('coalesce("contract"."termination_date", "contract"."end_date") >= $');
    expect(sql).toContain('"contract"."id" <> $');
    expect(query.params).toEqual(
      expect.arrayContaining([
        "organization-1",
        "property-1",
        input.spaceIds,
        3,
        input.startDate,
        input.endDate,
        input.excludeContractId,
      ]),
    );
    expect(sql).not.toContain("tenant_name_snapshot");
    expect(sql).not.toContain("phone_snapshot");
  });

  it("returns only safe contract and space identifiers from the supplied executor", async () => {
    const rows = [
      {
        contractId: "contract-2",
        contractNumber: "RC-2026-000002",
        spaceId: "space-2",
      },
    ];
    const execute = vi.fn().mockResolvedValue(rows);

    await expect(findSpaceConflicts(input, { execute } as never)).resolves.toEqual(rows);
    expect(execute).toHaveBeenCalledOnce();
    expect(Object.keys((await findSpaceConflicts(input, { execute } as never))[0] ?? {})).toEqual([
      "contractId",
      "contractNumber",
      "spaceId",
    ]);
  });

  it("uses the branded adapter without building or executing SQL", async () => {
    const rows = [
      {
        contractId: "contract-2",
        contractNumber: "RC-2026-000002",
        spaceId: "space-2",
      },
    ];
    const spaceConflict = vi.fn().mockResolvedValue(rows);
    const execute = vi.fn();
    const executor = {
      [SPACE_CONFLICT_QUERY_ADAPTER]: true,
      spaceConflict,
      execute,
    };

    await expect(findSpaceConflicts(input, executor as never)).resolves.toEqual(rows);
    expect(spaceConflict).toHaveBeenCalledWith(input);
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed for partial or unknown conflict capabilities", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    await expect(
      findSpaceConflicts(input, { [SPACE_CONFLICT_QUERY_ADAPTER]: true, execute } as never),
    ).rejects.toThrow("space-conflict query adapter");
    await expect(
      findSpaceConflicts(input, { spaceConflict: vi.fn(), execute } as never),
    ).rejects.toThrow("space-conflict query adapter");
    await expect(
      findSpaceConflicts(input, {
        [SPACE_CONFLICT_QUERY_ADAPTER]: false,
        spaceConflict: vi.fn(),
        execute,
      } as never),
    ).rejects.toThrow("space-conflict query adapter");
    await expect(
      findSpaceConflicts(input, {
        [SPACE_CONFLICT_QUERY_ADAPTER]: true,
        spaceConflict: "not-a-function",
        execute,
      } as never),
    ).rejects.toThrow("space-conflict query adapter");
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires an exact registered fixture tuple and isolates fixture rows", async () => {
    const registry = createRentalQueryFixtureRegistry();
    const rows = [
      {
        contractId: "contract-2",
        contractNumber: "RC-2026-000002",
        spaceId: "space-2",
      },
    ];
    registry.registerSpaceConflict(input, rows);
    const fake = createRentalDatabaseFake(undefined, registry);
    const result = await findSpaceConflicts(input, fake as never);
    expect(result).toEqual(rows);
    const firstResult = result.at(0);
    expect(firstResult).toBeDefined();
    if (!firstResult) throw new Error("expected fixture row");
    firstResult.contractNumber = "mutated";
    await expect(findSpaceConflicts(input, fake as never)).resolves.toEqual(rows);
    expect(registry.spaceConflictCalls).toHaveLength(2);

    await expect(
      findSpaceConflicts({ ...input, endDate: "2026-10-01" }, fake as never),
    ).rejects.toThrow("space-conflict fixture unavailable");
    const firstSpaceId = input.spaceIds.at(0);
    expect(firstSpaceId).toBeDefined();
    if (!firstSpaceId) throw new Error("expected input space id");
    expect(() =>
      registry.registerSpaceConflict(
        { ...input, spaceIds: [...input.spaceIds, firstSpaceId] },
        rows,
      ),
    ).toThrow("duplicate space id");
    const unsafeRow = Object.assign({}, rows[0], { extra: "nope" }) as never;
    expect(() => registry.registerSpaceConflict(input, [unsafeRow])).toThrow(
      "space-conflict fixture row",
    );
    const mismatches = [
      { ...input, organizationId: "organization-other" },
      { ...input, propertyId: "property-other" },
      { ...input, spaceIds: ["space-other"] },
      { ...input, startDate: "2026-09-02" },
      { ...input, endDate: "2026-10-02" },
      { ...input, excludeContractId: "contract-other" },
      { ...input, extra: "unknown" },
    ] as const;
    for (const mismatch of mismatches) {
      await expect(findSpaceConflicts(mismatch as never, fake as never)).rejects.toThrow(
        "space-conflict fixture",
      );
    }
  });

  it("returns the registered conflict fixture after source state changes", async () => {
    const registry = createRentalQueryFixtureRegistry();
    const state = createRentalTestState();
    const rows = [
      { contractId: "contract-fixed", contractNumber: "RC-2026-000009", spaceId: "space-fixed" },
    ];
    registry.registerSpaceConflict(input, rows);
    const fake = createRentalDatabaseFake(state, registry);

    state.contracts.clear();
    state.spaces.clear();
    state.partyPeriods.clear();
    state.contracts.set("different-contract", {} as never);
    state.spaces.set("different-space", {} as never);
    state.partyPeriods.set("different-contract", []);

    await expect(findSpaceConflicts(input, fake as never)).resolves.toEqual(rows);
  });

  it("keys read fixtures by method and every explicit argument with defensive copies", () => {
    const registry = createRentalQueryFixtureRegistry();
    const result = {
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      ciphertext: Buffer.from("fixture"),
      nested: { ids: ["contract-1"], facts: new Map([["active", true]]) },
    };
    const args = ["organization-1", "contract-1", { page: 1, pageSize: 20 }];
    registry.registerRead("contracts.detail", args, result);

    const resolved = registry.resolveRead<typeof result>("contracts.detail", args);
    resolved.updatedAt.setUTCDate(1);
    resolved.ciphertext[0] = 0;
    resolved.nested.ids.push("mutated");
    resolved.nested.facts.set("changed", false);

    expect(registry.resolveRead<typeof result>("contracts.detail", args)).toEqual(result);
    expect(registry.readCalls).toHaveLength(2);
    expect(() =>
      registry.resolveRead("contracts.detail", ["organization-1", "contract-1", { page: 2 }]),
    ).toThrow("rental read fixture unavailable");
  });
});

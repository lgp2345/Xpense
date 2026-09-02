import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { buildContractListQuery } from "./contracts.queries.js";
import { ContractsRepository } from "./contracts.repository.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("ContractsRepository edge behavior", () => {
  it("continues formatting numbers above the six-digit minimum width", async () => {
    const repository = new ContractsRepository({} as never);
    const execute = vi.fn().mockResolvedValue([{ lastValue: 1_000_000 }]);

    await expect(
      repository.nextContractNumber("organization-1", 2026, { execute } as never),
    ).resolves.toBe("RC-2026-1000000");
  });

  it("matches draft relation source names and frozen relation names without interpolation", () => {
    const query = buildContractListQuery(
      new QueryBuilder() as never,
      "organization-1",
      "2026-08-30",
      { keyword: "north wing", page: 1, pageSize: 20 },
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain(
      'coalesce("keyword_period"."tenant_name_snapshot", "keyword_tenant"."name")',
    );
    expect(sql).toContain(
      'coalesce("keyword_space"."space_name_snapshot", "keyword_space_source"."name")',
    );
    expect(sql).toContain('"keyword_tenant"."deleted_at" is null');
    expect(sql).toContain('"keyword_space_source"."deleted_at" is null');
    expect(query.params).toContain("%north wing%");
    expect(sql).not.toContain("north wing");
  });
});

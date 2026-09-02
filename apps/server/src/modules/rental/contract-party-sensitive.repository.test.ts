import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { buildContractPartySensitiveSnapshotQuery } from "./contract-party-sensitive.queries.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("contract party sensitive snapshot query", () => {
  it("reads only a scoped historical encrypted snapshot instead of tenant master data", () => {
    const query = buildContractPartySensitiveSnapshotQuery(new QueryBuilder() as never, {
      organizationId: "organization-1",
      contractId: "contract-1",
      tenantId: "tenant-1",
      validFrom: "2026-01-01",
    }).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('from "rental_contract_party_periods"');
    expect(sql).toContain('inner join "rental_contracts"');
    expect(sql).toContain('"rental_contract_party_periods"."organization_id" = $');
    expect(sql).toContain('"rental_contract_party_periods"."contract_id" = $');
    expect(sql).toContain('"rental_contract_party_periods"."tenant_id" = $');
    expect(sql).toContain('"rental_contract_party_periods"."valid_from" = $');
    expect(sql).toContain('"identity_snapshot_ciphertext" is not null');
    expect(sql).toContain('"identity_snapshot_key_version" is not null');
    expect(sql).toContain('"rental_contracts"."deleted_at" is null');
    expect(sql).not.toContain("rental_tenants");
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "contract-1", "tenant-1", "2026-01-01"]),
    );
  });
});

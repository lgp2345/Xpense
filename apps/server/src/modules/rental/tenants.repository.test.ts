import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalContractPartyPeriods, rentalContracts, rentalTenants } from "../../db/schema.js";
import { buildTenantCountQuery, buildTenantListQuery } from "./tenants.queries.js";
import { TenantsRepository } from "./tenants.repository.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function expectActiveTenantScope(
  condition: unknown,
  organizationId: string,
  tenantId: string,
): void {
  const query = new PgDialect().sqlToQuery(condition as never);
  const sql = normalizeSql(query.sql);

  expect(sql).toContain('"rental_tenants"."organization_id" = $');
  expect(sql).toContain('"rental_tenants"."id" = $');
  expect(sql).toContain('"rental_tenants"."deleted_at" is null');
  expect(query.params).toEqual([organizationId, tenantId]);
  expect(query.sql).not.toContain(organizationId);
  expect(query.sql).not.toContain(tenantId);
}

function expectTenantDocumentConflictScope(
  condition: unknown,
  organizationId: string,
  documentNumberLookupHash: string,
  excludeId: string,
): void {
  const query = new PgDialect().sqlToQuery(condition as never);
  const sql = normalizeSql(query.sql);

  expect(sql).toContain('"rental_tenants"."organization_id" = $');
  expect(sql).toContain('"rental_tenants"."document_number_lookup_hash" = $');
  expect(sql).toContain('"rental_tenants"."id" <> $');
  expect(sql).toContain('"rental_tenants"."deleted_at" is null');
  expect(query.params).toEqual([organizationId, documentNumberLookupHash, excludeId]);
  expect(query.sql).not.toContain(documentNumberLookupHash);
  expect(query.sql).not.toContain('"sensitive_identity_ciphertext"');
}

function expectContractReferenceScope(
  condition: unknown,
  joinCondition: unknown,
  organizationId: string,
  tenantId: string,
): void {
  const query = new PgDialect().sqlToQuery(condition as never);
  const joinQuery = new PgDialect().sqlToQuery(joinCondition as never);
  const sql = normalizeSql(query.sql);
  const joinSql = normalizeSql(joinQuery.sql);

  expect(joinSql).toContain(
    '"rental_contract_party_periods"."organization_id" = "rental_contracts"."organization_id"',
  );
  expect(joinSql).toContain(
    '"rental_contract_party_periods"."contract_id" = "rental_contracts"."id"',
  );
  expect(sql).toContain('"rental_contract_party_periods"."organization_id" = $');
  expect(sql).toContain('"rental_contract_party_periods"."tenant_id" = $');
  expect(sql).toContain('"rental_contracts"."deleted_at" is null');
  expect(query.params).toEqual([organizationId, tenantId]);
  expect(query.sql).not.toContain(organizationId);
  expect(query.sql).not.toContain(tenantId);
}

const listInput = {
  keyword: "王小明",
  type: "individual" as const,
  isActive: true,
  documentCountryCode: "CN",
  documentType: "national_id" as const,
  documentNumberLookupHash: "tenant-document-hash",
  page: 2,
  pageSize: 20,
};

describe("TenantsRepository", () => {
  it("renders an organization-scoped, soft-delete-safe list and count with one scalar contract count", () => {
    const listQuery = buildTenantListQuery(
      new QueryBuilder() as never,
      "organization-1",
      listInput,
    ).toSQL();
    const countQuery = buildTenantCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      listInput,
    ).toSQL();
    const sql = normalizeSql(listQuery.sql);
    const totalSql = normalizeSql(countQuery.sql);

    expect(sql).toContain('from "rental_tenants"');
    expect(sql).toContain('from "rental_contract_party_periods"');
    expect(sql).toContain('select count(distinct "rental_contract_party_periods"."contract_id")');
    expect(sql).toContain('inner join "rental_contracts"');
    expect(sql).toContain(
      '"rental_contract_party_periods"."organization_id" = "rental_tenants"."organization_id"',
    );
    expect(sql).toContain('"rental_contract_party_periods"."tenant_id" = "rental_tenants"."id"');
    expect(sql).toContain('"rental_contracts"."deleted_at" is null');
    expect(sql).toContain('"rental_tenants"."organization_id" = $');
    expect(sql).toContain('"rental_tenants"."deleted_at" is null');
    expect(sql).toContain('"rental_tenants"."document_number_lookup_hash" = $');
    expect(sql).not.toContain('"sensitive_identity_ciphertext"');
    expect(sql).not.toContain('join "rental_contract_party_periods"');
    expect(sql).toContain(
      'order by "rental_tenants"."updated_at" desc, "rental_tenants"."id" desc',
    );
    expect(listQuery.params).toEqual(
      expect.arrayContaining(["organization-1", "tenant-document-hash", "%王小明%", 20, 20]),
    );
    expect(totalSql).toContain('"rental_tenants"."organization_id" = $');
    expect(totalSql).toContain('"rental_tenants"."deleted_at" is null');
    expect(totalSql).toContain('"rental_tenants"."document_number_lookup_hash" = $');
  });

  it("keeps all tenant point reads in the organization and undeleted boundary", async () => {
    const ownedLimit = vi.fn().mockResolvedValue([{ id: "tenant-1" }]);
    const ownedWhere = vi.fn().mockReturnValue({ limit: ownedLimit });
    const ownedFrom = vi.fn().mockReturnValue({ where: ownedWhere });
    const lockLimit = vi.fn().mockResolvedValue([{ id: "tenant-1" }]);
    const forUpdate = vi.fn().mockReturnValue({ limit: lockLimit });
    const lockWhere = vi.fn().mockReturnValue({ for: forUpdate });
    const lockFrom = vi.fn().mockReturnValue({ where: lockWhere });
    const conflictLimit = vi.fn().mockResolvedValue([{ id: "tenant-2" }]);
    const conflictWhere = vi.fn().mockReturnValue({ limit: conflictLimit });
    const conflictFrom = vi.fn().mockReturnValue({ where: conflictWhere });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: ownedFrom })
      .mockReturnValueOnce({ from: lockFrom })
      .mockReturnValueOnce({ from: conflictFrom });
    const repository = new TenantsRepository({ select: vi.fn() } as never);
    const executor = { select } as never;

    await expect(
      repository.findActiveOwned("organization-1", "tenant-1", executor),
    ).resolves.toEqual({
      id: "tenant-1",
    });
    await expect(
      repository.findActiveOwnedForUpdate("organization-1", "tenant-1", executor),
    ).resolves.toEqual({ id: "tenant-1" });
    await expect(
      repository.findDocumentConflict(
        "organization-1",
        "tenant-document-hash",
        "tenant-1",
        executor,
      ),
    ).resolves.toEqual({ id: "tenant-2" });

    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(select.mock.calls[0]?.[0]).toHaveProperty("contractCount");
    expect(select.mock.calls[1]?.[0]).not.toHaveProperty("contractCount");
    expectActiveTenantScope(ownedWhere.mock.calls[0]?.[0], "organization-1", "tenant-1");
    expectActiveTenantScope(lockWhere.mock.calls[0]?.[0], "organization-1", "tenant-1");
    const documentConflictCondition = conflictWhere.mock.calls[0]?.[0];
    expectTenantDocumentConflictScope(
      documentConflictCondition,
      "organization-1",
      "tenant-document-hash",
      "tenant-1",
    );
  });

  it("uses the supplied executor for all writes and contract-reference checks", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "tenant-1", name: "王小明" }])
      .mockResolvedValueOnce([{ id: "tenant-1", name: "王小明" }])
      .mockResolvedValueOnce([{ id: "tenant-1", isActive: false }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const referenceLimit = vi.fn().mockResolvedValue([{ id: "party-1" }]);
    const referenceWhere = vi.fn().mockReturnValue({ limit: referenceLimit });
    const referenceJoin = vi.fn().mockReturnValue({ where: referenceWhere });
    const referenceFrom = vi.fn().mockReturnValue({ innerJoin: referenceJoin });
    const select = vi.fn().mockReturnValue({ from: referenceFrom });
    const insert = vi.fn().mockReturnValue({ values: insertValues });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const repository = new TenantsRepository({} as never);
    const executor = { insert, update, select } as never;
    const input = {
      organizationId: "organization-1",
      type: "individual" as const,
      name: "王小明",
      phone: null,
      email: null,
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id" as const,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      documentNumberLookupHash: "tenant-document-hash",
      sensitiveIdentityCiphertext: Buffer.from("ciphertext"),
      sensitiveIdentityKeyVersion: 1,
      note: null,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
    };

    await expect(repository.create(input, executor)).resolves.toMatchObject({ id: "tenant-1" });
    await expect(
      repository.update({ ...input, id: "tenant-1", isActive: true }, executor),
    ).resolves.toMatchObject({
      id: "tenant-1",
    });
    await expect(
      repository.setStatus(
        {
          organizationId: "organization-1",
          id: "tenant-1",
          isActive: false,
          updatedByUserId: "user-1",
        },
        executor,
      ),
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      repository.softDelete(
        {
          organizationId: "organization-1",
          id: "tenant-1",
          deletedByUserId: "user-1",
          updatedByUserId: "user-1",
        },
        executor,
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.hasContractReference("organization-1", "tenant-1", executor),
    ).resolves.toBe(true);

    expect(insert).toHaveBeenCalledWith(rentalTenants);
    expect(update).toHaveBeenCalledTimes(3);
    for (const condition of updateWhere.mock.calls.map(([condition]) => condition)) {
      expectActiveTenantScope(condition, "organization-1", "tenant-1");
    }
    expect(select).toHaveBeenCalledWith({ id: rentalContractPartyPeriods.id });
    expect(referenceJoin).toHaveBeenCalledWith(rentalContracts, expect.anything());
    const referenceCondition = referenceWhere.mock.calls[0]?.[0];
    expectContractReferenceScope(
      referenceCondition,
      referenceJoin.mock.calls[0]?.[1],
      "organization-1",
      "tenant-1",
    );
  });
});

import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalProperties, rentalSpaces } from "../../db/schema.js";
import { buildPropertyCountQuery, buildPropertyListQuery } from "./properties.queries.js";
import { PropertiesRepository } from "./properties.repository.js";

function containsReference(
  value: unknown,
  reference: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (value === reference) return true;
  if (typeof value !== "object" || value === null) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) => containsReference(item, reference, visited));
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

const listInput = {
  page: 1,
  pageSize: 20,
  keyword: "阳光",
  city: "上海",
  isActive: true,
};

describe("PropertiesRepository", () => {
  it("renders organization-scoped, soft-delete-safe list and count queries with scalar space counts", () => {
    const query = buildPropertyListQuery(new QueryBuilder() as never, "organization-1", {
      ...listInput,
      page: 2,
    }).toSQL();
    const countQuery = buildPropertyCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      listInput,
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('from "rental_properties"');
    expect(sql).toContain('from "rental_spaces"');
    expect(sql).toContain(
      '"rental_spaces"."organization_id" = "rental_properties"."organization_id"',
    );
    expect(sql).toContain('"rental_spaces"."property_id" = "rental_properties"."id"');
    expect(sql).toContain('"rental_spaces"."deleted_at" is null');
    expect(sql).toContain('"rental_spaces"."is_rentable" is true');
    expect(sql).toContain(
      'order by "rental_properties"."updated_at" desc, "rental_properties"."id" asc',
    );
    expect(sql).toContain("limit $");
    expect(sql).toContain("offset $");
    expect(sql).not.toContain('join "rental_spaces"');
    expect(query.params).toContain("organization-1");
    expect(query.params).toContain("%阳光%");
    expect(countQuery.params).toContain("organization-1");
    expect(normalizeSql(countQuery.sql)).toContain('"rental_properties"."deleted_at" is null');
  });

  it("returns numeric space aggregates with an accurate paged total", async () => {
    const item = {
      id: "property-1",
      ledgerId: "ledger-1",
      name: "阳光公寓",
      type: "apartment_building",
      customTypeName: null,
      countryCode: "CN",
      province: "上海",
      city: "上海",
      district: "浦东",
      addressLine: "世纪大道 1 号",
      isActive: true,
      spaceCount: 3,
      rentableSpaceCount: 2,
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    };
    const listQuery = {} as Record<string, ReturnType<typeof vi.fn>>;
    listQuery.from = vi.fn().mockReturnValue(listQuery);
    listQuery.where = vi.fn().mockReturnValue(listQuery);
    listQuery.orderBy = vi.fn().mockReturnValue(listQuery);
    listQuery.limit = vi.fn().mockReturnValue(listQuery);
    listQuery.offset = vi.fn().mockResolvedValue([item]);
    const countQuery = {} as Record<string, ReturnType<typeof vi.fn>>;
    countQuery.from = vi.fn().mockReturnValue(countQuery);
    countQuery.where = vi.fn().mockResolvedValue([{ total: 1 }]);
    const select = vi.fn().mockReturnValueOnce(listQuery).mockReturnValueOnce(countQuery);
    const repository = new PropertiesRepository({ select } as never);

    await expect(repository.list("organization-1", listInput)).resolves.toMatchObject({
      items: [expect.objectContaining({ spaceCount: 3, rentableSpaceCount: 2 })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(select).toHaveBeenCalledTimes(2);
  });

  it("finds and locks only an active property owned by the current organization", async () => {
    const record = { id: "property-1", organizationId: "organization-1" };
    const limit = vi.fn().mockResolvedValue([record]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate, limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new PropertiesRepository({} as never);

    await expect(
      repository.findActiveOwnedForUpdate("organization-1", "property-1", { select } as never),
    ).resolves.toEqual(record);

    expect(forUpdate).toHaveBeenCalledWith("update");
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      rentalProperties.organizationId,
      "organization-1",
      rentalProperties.id,
      "property-1",
      rentalProperties.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("finds undeleted owned records and name conflicts regardless of status", async () => {
    const ownedLimit = vi.fn().mockResolvedValue([{ id: "property-1" }]);
    const ownedWhere = vi.fn().mockReturnValue({ limit: ownedLimit });
    const ownedFrom = vi.fn().mockReturnValue({ where: ownedWhere });
    const conflictLimit = vi.fn().mockResolvedValue([{ id: "property-2" }]);
    const conflictWhere = vi.fn().mockReturnValue({ limit: conflictLimit });
    const conflictFrom = vi.fn().mockReturnValue({ where: conflictWhere });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: ownedFrom })
      .mockReturnValueOnce({ from: conflictFrom });
    const repository = new PropertiesRepository({ select: vi.fn() } as never);

    await expect(
      repository.findActiveOwned("organization-1", "property-1", { select } as never),
    ).resolves.toEqual({ id: "property-1" });
    await expect(
      repository.findActiveNameConflict(
        { organizationId: "organization-1", name: "阳光公寓", excludeId: "property-1" },
        { select } as never,
      ),
    ).resolves.toEqual({ id: "property-2" });

    for (const condition of [ownedWhere.mock.calls[0]?.[0], conflictWhere.mock.calls[0]?.[0]]) {
      expect(containsReference(condition, rentalProperties.organizationId)).toBe(true);
      expect(containsReference(condition, "organization-1")).toBe(true);
      expect(containsReference(condition, rentalProperties.deletedAt)).toBe(true);
    }
    const conflictSql = new PgDialect().sqlToQuery(conflictWhere.mock.calls[0]?.[0]).sql;
    expect(conflictSql).not.toContain('"rental_properties"."is_active"');
    expect(containsReference(conflictWhere.mock.calls[0]?.[0], "阳光公寓")).toBe(true);
    expect(containsReference(conflictWhere.mock.calls[0]?.[0], "property-1")).toBe(true);
  });

  it("creates, updates, and sets status with returning property records in the supplied executor", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "property-1", name: "阳光公寓" }])
      .mockResolvedValueOnce([{ id: "property-1", name: "阳光公寓二期" }])
      .mockResolvedValueOnce([{ id: "property-1", isActive: false }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) });
    const insert = vi.fn().mockReturnValue({ values: insertValues });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new PropertiesRepository({} as never);
    const executor = { insert, update } as never;
    const createInput = {
      organizationId: "organization-1",
      ledgerId: "ledger-1",
      name: "阳光公寓",
      type: "apartment_building" as const,
      customTypeName: null,
      countryCode: "CN",
      province: null,
      city: "上海",
      district: null,
      addressLine: "世纪大道 1 号",
      note: null,
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
    };

    await expect(repository.create(createInput, executor)).resolves.toMatchObject({
      id: "property-1",
    });
    await expect(
      repository.update({ ...createInput, id: "property-1", isActive: true }, executor),
    ).resolves.toMatchObject({ name: "阳光公寓二期" });
    await expect(
      repository.setStatus(
        {
          organizationId: "organization-1",
          id: "property-1",
          isActive: false,
          updatedByUserId: "user-1",
        },
        executor,
      ),
    ).resolves.toMatchObject({ isActive: false });

    expect(insert).toHaveBeenCalledWith(rentalProperties);
    expect(insertValues).toHaveBeenCalledWith(createInput);
    expect(update).toHaveBeenCalledTimes(2);
    expect(returning).toHaveBeenCalledTimes(3);
  });

  it("checks active spaces and soft deletes only inside the organization-scoped active property boundary", async () => {
    const spaceLimit = vi.fn().mockResolvedValue([{ id: "space-1" }]);
    const spaceWhere = vi.fn().mockReturnValue({ limit: spaceLimit });
    const spaceFrom = vi.fn().mockReturnValue({ where: spaceWhere });
    const select = vi.fn().mockReturnValue({ from: spaceFrom });
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new PropertiesRepository({ select } as never);

    await expect(
      repository.hasActiveSpace("organization-1", "property-1", { select } as never),
    ).resolves.toBe(true);
    await repository.softDelete(
      {
        organizationId: "organization-1",
        id: "property-1",
        deletedByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      { update } as never,
    );

    const spaceCondition = spaceWhere.mock.calls[0]?.[0];
    for (const reference of [
      rentalSpaces.organizationId,
      "organization-1",
      rentalSpaces.propertyId,
      "property-1",
      rentalSpaces.deletedAt,
    ]) {
      expect(containsReference(spaceCondition, reference)).toBe(true);
    }
    expect(update).toHaveBeenCalledWith(rentalProperties);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date), deletedByUserId: "user-1" }),
    );
    const propertyCondition = where.mock.calls[0]?.[0];
    expect(containsReference(propertyCondition, rentalProperties.organizationId)).toBe(true);
    expect(containsReference(propertyCondition, rentalProperties.deletedAt)).toBe(true);
  });
});

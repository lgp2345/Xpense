import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { rentalSpaces } from "../../db/schema.js";
import {
  buildSpaceAncestorsQuery,
  buildSpaceChildrenCountQuery,
  buildSpaceChildrenQuery,
  buildSpaceSearchCountQuery,
  buildSpaceSearchQuery,
  buildSpaceSubtreeDepthQuery,
} from "./spaces.queries.js";
import { SpacesRepository } from "./spaces.repository.js";

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

function containsSqlChunkReference(
  value: unknown,
  reference: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (value === reference) return true;
  if (Array.isArray(value)) {
    return value.some((item) => containsSqlChunkReference(item, reference, visited));
  }
  if (typeof value !== "object" || value === null || visited.has(value)) return false;
  visited.add(value);

  if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.some((item) => containsSqlChunkReference(item, reference, visited));
  }
  if ("value" in value) {
    return containsSqlChunkReference(value.value, reference, visited);
  }

  return false;
}

describe("SpacesRepository recursive queries", () => {
  it("bounds ancestor traversal to the organization and property and orders root to leaf", () => {
    const query = buildSpaceAncestorsQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      "space-1",
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain("with recursive");
    expect(sql).toContain('from "rental_spaces"');
    expect(sql).toContain('"organization_id" = $');
    expect(sql).toContain('"property_id" = $');
    expect(sql).toContain('"deleted_at" is null');
    expect(sql).toContain('"depth" < $');
    expect(sql).toContain('order by "space_ancestor_rows"."depth" desc');
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", "space-1", 3]),
    );
  });

  it("bounds subtree traversal and returns the maximum relative depth from zero", () => {
    const query = buildSpaceSubtreeDepthQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      "space-1",
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain("with recursive");
    expect(sql).toContain('"organization_id" = $');
    expect(sql).toContain('"property_id" = $');
    expect(sql).toContain('"deleted_at" is null');
    expect(sql).toContain('"depth" < $');
    expect(sql).toContain("coalesce(max(");
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", "space-1", 3, 0]),
    );
  });

  it("renders root and child pages with one batched effective-state query and stable ordering", () => {
    const rootQuery = buildSpaceChildrenQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      { parentId: null, page: 2, pageSize: 20 },
    ).toSQL();
    const childQuery = buildSpaceChildrenQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      { parentId: "space-parent", page: 1, pageSize: 10 },
    ).toSQL();
    const rootCountQuery = buildSpaceChildrenCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      { parentId: null, page: 2, pageSize: 20 },
    ).toSQL();
    const rootSql = normalizeSql(rootQuery.sql);
    const childSql = normalizeSql(childQuery.sql);

    expect(rootSql).toContain("with recursive");
    expect(rootSql).toContain('"parent_id" is null');
    expect(rootSql).toContain('"organization_id" = $');
    expect(rootSql).toContain('"property_id" = $');
    expect(rootSql).toContain('"deleted_at" is null');
    expect(rootSql).toContain('"depth" < $');
    expect(rootSql).toContain('from "ancestor_activity"');
    expect(rootSql).toContain('"is_active" is false');
    expect(rootSql).toContain("exists (");
    expect(rootSql).toContain(
      'order by "space_children_rows"."sort_order" asc, "space_children_rows"."name" asc, "space_children_rows"."id" asc',
    );
    expect(rootQuery.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", 3, 20, 20]),
    );
    expect(childSql).toContain('"parent_id" = $');
    expect(childQuery.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", "space-parent", 10, 0]),
    );
    expect(normalizeSql(rootCountQuery.sql)).toContain("count(*)");
    expect(normalizeSql(rootCountQuery.sql)).toContain('"parent_id" is null');
    expect(rootCountQuery.params).toEqual(expect.arrayContaining(["organization-1", "property-1"]));
  });

  it("renders bounded search with ancestor paths, effective state, and stable path pagination", () => {
    const query = buildSpaceSearchQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      { keyword: "A-101", page: 2, pageSize: 10 },
    ).toSQL();
    const countQuery = buildSpaceSearchCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      "property-1",
      { keyword: "A-101", page: 2, pageSize: 10 },
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain("with recursive");
    expect(sql).toContain('"organization_id" = $');
    expect(sql).toContain('"property_id" = $');
    expect(sql).toContain('"deleted_at" is null');
    expect(sql).toContain('"depth" < $');
    expect(sql).toContain("jsonb_build_array(");
    expect(sql).toContain("jsonb_build_object(");
    expect(sql).toContain(
      'order by "space_search_rows"."path_order" asc, "space_search_rows"."id" asc',
    );
    expect(sql).toContain("limit $");
    expect(sql).toContain("offset $");
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", 3, "%A-101%", 10, 10]),
    );
    expect(normalizeSql(countQuery.sql)).toContain("count(*)");
    expect(countQuery.params).toEqual(
      expect.arrayContaining(["organization-1", "property-1", "%A-101%"]),
    );
  });
});

describe("SpacesRepository", () => {
  it("maps a child page, hasChildren, and effective status without per-row queries", async () => {
    const rows = [
      {
        id: "space-1",
        propertyId: "property-1",
        parentId: null,
        name: "1 号楼",
        code: null,
        type: "building",
        customTypeName: null,
        isRentable: false,
        isActive: true,
        isEffectivelyActive: false,
        sortOrder: 1,
        hasChildren: true,
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ orderBy });
    const countWhere = vi.fn().mockResolvedValue([{ total: 1 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
    const repository = new SpacesRepository({ select } as never);

    await expect(
      repository.listChildren("organization-1", "property-1", {
        parentId: null,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "space-1",
          propertyId: "property-1",
          parentId: null,
          name: "1 号楼",
          code: null,
          type: "building",
          customTypeName: null,
          isRentable: false,
          isActive: true,
          isEffectivelyActive: false,
          sortOrder: 1,
          hasChildren: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("maps search rows and root-to-match paths from one bounded query", async () => {
    const rows = [
      {
        id: "space-2",
        propertyId: "property-1",
        parentId: "space-1",
        name: "101",
        code: "A-101",
        type: "room",
        customTypeName: null,
        isRentable: true,
        isActive: true,
        isEffectivelyActive: true,
        sortOrder: 1,
        hasChildren: false,
        path: [
          { id: "space-1", name: "1 号楼" },
          { id: "space-2", name: "101" },
        ],
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ orderBy });
    const countFrom = vi.fn().mockResolvedValue([{ total: 1 }]);
    const select = vi.fn().mockReturnValueOnce({ from }).mockReturnValueOnce({ from: countFrom });
    const repository = new SpacesRepository({ select } as never);

    await expect(
      repository.search("organization-1", "property-1", {
        keyword: "A-101",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: "space-2",
          path: [
            { id: "space-1", name: "1 号楼" },
            { id: "space-2", name: "101" },
          ],
        },
      ],
      total: 1,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("finds and locks only an undeleted space inside both ownership scopes", async () => {
    const record = { id: "space-1", organizationId: "organization-1", propertyId: "property-1" };
    const limit = vi.fn().mockResolvedValue([record]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new SpacesRepository({} as never);

    await expect(
      repository.findActiveOwnedForUpdate("organization-1", "property-1", "space-1", {
        select,
      } as never),
    ).resolves.toEqual(record);

    expect(forUpdate).toHaveBeenCalledWith("update");
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      rentalSpaces.organizationId,
      "organization-1",
      rentalSpaces.propertyId,
      "property-1",
      rentalSpaces.id,
      "space-1",
      rentalSpaces.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("checks all normalized sibling names and codes in one active-scoped query", async () => {
    const orderBy = vi.fn().mockResolvedValue([{ id: "space-2", name: "101", code: "A-101" }]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new SpacesRepository({} as never);

    await expect(
      repository.findSiblingConflicts(
        {
          organizationId: "organization-1",
          propertyId: "property-1",
          parentId: "space-parent",
          names: ["101", "102"],
          codes: ["A-101", "A-102"],
          excludeId: "space-current",
        },
        { select } as never,
      ),
    ).resolves.toEqual([{ id: "space-2", name: "101", code: "A-101" }]);

    expect(select).toHaveBeenCalledTimes(1);
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      rentalSpaces.organizationId,
      "organization-1",
      rentalSpaces.propertyId,
      "property-1",
      rentalSpaces.parentId,
      "space-parent",
      rentalSpaces.name,
      "101",
      "102",
      rentalSpaces.code,
      "A-101",
      "A-102",
      rentalSpaces.isActive,
      rentalSpaces.deletedAt,
      "space-current",
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("distinguishes undeleted children from historical children", async () => {
    const activeLimit = vi.fn().mockResolvedValue([{ id: "child-1" }]);
    const anyLimit = vi.fn().mockResolvedValue([{ id: "child-deleted" }]);
    const activeWhere = vi.fn().mockReturnValue({ limit: activeLimit });
    const anyWhere = vi.fn().mockReturnValue({ limit: anyLimit });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: activeWhere }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: anyWhere }) });
    const repository = new SpacesRepository({ select } as never);

    await expect(
      repository.hasActiveChildren("organization-1", "property-1", "space-1"),
    ).resolves.toBe(true);
    await expect(
      repository.hasAnyChildren("organization-1", "property-1", "space-1"),
    ).resolves.toBe(true);

    expect(containsSqlChunkReference(activeWhere.mock.calls[0]?.[0], rentalSpaces.deletedAt)).toBe(
      true,
    );
    expect(containsSqlChunkReference(anyWhere.mock.calls[0]?.[0], rentalSpaces.deletedAt)).toBe(
      false,
    );
  });

  it("requires every batch insert row to be returned", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "space-1" }, { id: "space-2" }])
      .mockResolvedValueOnce([{ id: "space-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const repository = new SpacesRepository({} as never);
    const inputs = [
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: null,
        name: "1 号楼",
        code: null,
        type: "building" as const,
        customTypeName: null,
        isRentable: false,
        sortOrder: 1,
        createdByUserId: "user-1",
      },
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: null,
        name: "2 号楼",
        code: null,
        type: "building" as const,
        customTypeName: null,
        isRentable: false,
        sortOrder: 2,
        createdByUserId: "user-1",
      },
    ];

    await expect(repository.createMany(inputs, { insert } as never)).resolves.toHaveLength(2);
    await expect(repository.createMany(inputs, { insert } as never)).rejects.toThrow(
      "Failed to create every rental space",
    );
    expect(insert).toHaveBeenCalledWith(rentalSpaces);
    expect(values).toHaveBeenCalledWith(inputs);
  });

  it("provides organization/property-scoped create, update, move, status, and soft-delete writes", async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: "space-1", name: "101" }])
      .mockResolvedValueOnce([{ id: "space-1", name: "102" }])
      .mockResolvedValueOnce([{ id: "space-1", parentId: null }])
      .mockResolvedValueOnce([{ id: "space-1", isActive: false }]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const insert = vi.fn().mockReturnValue({ values: insertValues });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new SpacesRepository({} as never);
    const executor = { insert, update } as never;
    const createInput = {
      organizationId: "organization-1",
      propertyId: "property-1",
      parentId: "space-parent",
      name: "101",
      code: "A-101",
      type: "room" as const,
      customTypeName: null,
      isRentable: true,
      sortOrder: 1,
      createdByUserId: "user-1",
    };

    await expect(repository.create(createInput, executor)).resolves.toMatchObject({
      id: "space-1",
    });
    await expect(
      repository.update({ ...createInput, id: "space-1", name: "102", isActive: true }, executor),
    ).resolves.toMatchObject({ name: "102" });
    await expect(
      repository.move(
        {
          organizationId: "organization-1",
          propertyId: "property-1",
          id: "space-1",
          parentId: null,
          sortOrder: 2,
        },
        executor,
      ),
    ).resolves.toMatchObject({ parentId: null });
    await expect(
      repository.setStatus(
        {
          organizationId: "organization-1",
          propertyId: "property-1",
          id: "space-1",
          isActive: false,
        },
        executor,
      ),
    ).resolves.toMatchObject({ isActive: false });
    await repository.softDelete(
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        id: "space-1",
        deletedByUserId: "user-1",
      },
      executor,
    );

    expect(insertValues).toHaveBeenCalledWith(createInput);
    expect(update).toHaveBeenCalledWith(rentalSpaces);
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date), deletedByUserId: "user-1" }),
    );
    for (const call of where.mock.calls) {
      const condition = call[0];
      expect(containsReference(condition, rentalSpaces.organizationId)).toBe(true);
      expect(containsReference(condition, "organization-1")).toBe(true);
      expect(containsReference(condition, rentalSpaces.propertyId)).toBe(true);
      expect(containsReference(condition, "property-1")).toBe(true);
      expect(containsReference(condition, rentalSpaces.deletedAt)).toBe(true);
    }
  });
});

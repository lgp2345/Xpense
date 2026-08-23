import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { organizations } from "../../db/schema.js";
import {
  BookkeepingWriteLockRepository,
  buildBookkeepingOrganizationWriteLockQuery,
} from "./bookkeeping-write-lock.repository.js";

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

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

describe("BookkeepingWriteLockRepository", () => {
  it("renders one organization row FOR UPDATE query", () => {
    const query = buildBookkeepingOrganizationWriteLockQuery(
      new QueryBuilder() as never,
      "organization-1",
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('select "id" from "organizations"');
    expect(sql).toContain('"organizations"."id" = $1');
    expect(sql).toContain("for update");
    expect(sql).toContain("limit $2");
    expect(query.params).toEqual(["organization-1", 1]);
  });

  it("uses only the supplied transaction executor and returns whether the organization exists", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "organization-1" }]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new BookkeepingWriteLockRepository({ select: dbSelect } as never);

    await expect(
      repository.lockOrganization("organization-1", { select: executorSelect } as never),
    ).resolves.toBe(true);

    expect(executorSelect).toHaveBeenCalledWith({ id: organizations.id });
    expect(dbSelect).not.toHaveBeenCalled();
    expect(forUpdate).toHaveBeenCalledWith("update");
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, organizations.id)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
  });
});

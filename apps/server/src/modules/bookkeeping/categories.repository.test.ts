import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { categories, ledgers, organizations, transactions } from "../../db/schema.js";
import {
  buildAnyCategoryChildrenQuery,
  buildAnyCategoryTransactionReferenceQuery,
} from "./categories.queries.js";
import { CategoriesRepository } from "./categories.repository.js";

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

describe("CategoriesRepository", () => {
  it("locks the organization row with FOR UPDATE through the supplied transaction", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "organization-1" }]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({} as never);

    await expect(
      repository.lockOrganizationForCategoryWrite("organization-1", { select } as never),
    ).resolves.toBe(true);

    expect(select).toHaveBeenCalledWith({ id: organizations.id });
    expect(from).toHaveBeenCalledWith(organizations);
    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(limit).toHaveBeenCalledWith(1);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, organizations.id)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
  });

  it("lists only active categories in the organization, ledger, and optional type scope", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({ select } as never);

    await repository.listActive("organization-1", "ledger-1", "expense");

    expect(from).toHaveBeenCalledWith(categories);
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      categories.organizationId,
      "organization-1",
      categories.ledgerId,
      "ledger-1",
      categories.type,
      "expense",
      categories.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
    const order = orderBy.mock.calls[0] ?? [];
    expect(containsReference(order, categories.sortOrder)).toBe(true);
    expect(containsReference(order, categories.name)).toBe(true);
  });

  it("finds an active owned ledger through the supplied transaction executor", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "ledger-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new CategoriesRepository({ select: dbSelect } as never);

    await expect(
      repository.findActiveOwnedLedger("organization-1", "ledger-1", {
        select: executorSelect,
      } as never),
    ).resolves.toEqual({ id: "ledger-1" });

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      ledgers.organizationId,
      "organization-1",
      ledgers.id,
      "ledger-1",
      ledgers.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("finds an active owned category through the supplied transaction executor", async () => {
    const row = { id: "category-1", organizationId: "organization-1" };
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new CategoriesRepository({ select: dbSelect } as never);

    await expect(
      repository.findActiveOwnedCategory("organization-1", "category-1", {
        select: executorSelect,
      } as never),
    ).resolves.toEqual(row);

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      categories.organizationId,
      "organization-1",
      categories.id,
      "category-1",
      categories.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("checks duplicate names only among active siblings in the exact scope", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({ select } as never);

    await repository.findActiveSiblingByName({
      organizationId: "organization-1",
      ledgerId: "ledger-1",
      type: "expense",
      parentId: null,
      name: "餐饮",
      excludeId: "category-1",
    });

    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      categories.organizationId,
      "organization-1",
      categories.ledgerId,
      "ledger-1",
      categories.type,
      "expense",
      categories.parentId,
      categories.name,
      "餐饮",
      categories.id,
      "category-1",
      categories.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("checks active children within the organization and does not count soft-deleted children", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "child-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({ select } as never);

    await expect(repository.hasActiveChildren("organization-1", "category-1")).resolves.toBe(true);

    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      categories.organizationId,
      "organization-1",
      categories.parentId,
      "category-1",
      categories.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("checks all children in the organization without filtering soft-deleted rows", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "child-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({} as never);

    await expect(
      repository.hasAnyChildren("organization-1", "category-1", { select } as never),
    ).resolves.toBe(true);

    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, categories.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, categories.parentId)).toBe(true);
    expect(containsReference(condition, "category-1")).toBe(true);
    const rendered = buildAnyCategoryChildrenQuery(
      new QueryBuilder() as never,
      "organization-1",
      "category-1",
    ).toSQL();
    expect(rendered.sql.toLowerCase()).not.toContain("deleted_at");
    expect(rendered.params).toEqual(["organization-1", "category-1", 1]);
  });

  it("checks every transaction reference in the organization including soft-deleted history", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "transaction-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new CategoriesRepository({} as never);

    await expect(
      repository.hasAnyTransactionReference("organization-1", "category-1", {
        select,
      } as never),
    ).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith(transactions);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, transactions.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, transactions.categoryId)).toBe(true);
    expect(containsReference(condition, "category-1")).toBe(true);
    const rendered = buildAnyCategoryTransactionReferenceQuery(
      new QueryBuilder() as never,
      "organization-1",
      "category-1",
    ).toSQL();
    expect(rendered.sql.toLowerCase()).not.toContain("deleted_at");
    expect(rendered.params).toEqual(["organization-1", "category-1", 1]);
  });

  it("soft deletes only the active target row so historical transaction references remain intact", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new CategoriesRepository({} as never);

    await repository.softDelete(
      {
        organizationId: "organization-1",
        id: "category-1",
        deletedByUserId: "user-1",
      },
      { update } as never,
    );

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(categories);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedByUserId: "user-1",
        updatedAt: expect.any(Date),
      }),
    );
    const condition = where.mock.calls[0]?.[0];
    for (const reference of [
      categories.organizationId,
      "organization-1",
      categories.id,
      "category-1",
      categories.deletedAt,
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });
});

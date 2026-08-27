import { describe, expect, it, vi } from "vitest";

import { ledgers } from "../../db/schema.js";
import { LedgersRepository } from "./ledgers.repository.js";

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

describe("LedgersRepository", () => {
  it("scopes active ledger list by organization", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new LedgersRepository({ select } as never);

    await expect(repository.listActive("organization-1")).resolves.toEqual([]);

    expect(from).toHaveBeenCalledWith(ledgers);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, ledgers.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, ledgers.deletedAt)).toBe(true);
  });

  it("writes and mutates rental ledgers only within the active organization-scoped rental boundary", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "rental-ledger-1",
        name: "阳光公寓",
        type: "rental",
        isDefault: false,
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
        updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      },
    ]);
    const insertValues = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values: insertValues });
    const updateReturning = vi.fn().mockResolvedValue([{ id: "rental-ledger-1" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const repository = new LedgersRepository({} as never);
    const transaction = { kind: "transaction", insert, update };

    await expect(
      repository.createRental(
        { organizationId: "organization-1", name: "阳光公寓", createdByUserId: "user-1" },
        transaction as never,
      ),
    ).resolves.toMatchObject({ type: "rental", isDefault: false });
    await expect(
      repository.renameActiveRental(
        { organizationId: "organization-1", id: "rental-ledger-1", name: "阳光公寓二期" },
        transaction as never,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.softDeleteActiveRental(
        { organizationId: "organization-1", id: "rental-ledger-1", deletedByUserId: "user-1" },
        transaction as never,
      ),
    ).resolves.toBe(true);

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        name: "阳光公寓",
        type: "rental",
        isDefault: false,
        createdByUserId: "user-1",
      }),
    );
    expect(update).toHaveBeenCalledTimes(2);
    for (const [condition] of updateWhere.mock.calls) {
      expect(containsReference(condition, ledgers.organizationId)).toBe(true);
      expect(containsReference(condition, "organization-1")).toBe(true);
      expect(containsReference(condition, ledgers.id)).toBe(true);
      expect(containsReference(condition, "rental-ledger-1")).toBe(true);
      expect(containsReference(condition, ledgers.type)).toBe(true);
      expect(containsReference(condition, "rental")).toBe(true);
      expect(containsReference(condition, ledgers.deletedAt)).toBe(true);
    }
    expect(updateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ deletedByUserId: "user-1", deletedAt: expect.any(Date) }),
    );
    expect(updateReturning).toHaveBeenCalledTimes(2);
  });

  it("checks rental-ledger transaction references across active and soft-deleted history", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new LedgersRepository({ select } as never);

    await expect(
      repository.hasAnyTransactionReference("organization-1", "rental-ledger-1"),
    ).resolves.toBe(false);

    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, "rental-ledger-1")).toBe(true);
  });
});

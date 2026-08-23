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
});

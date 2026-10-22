import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { OrganizationOwnerRepository } from "./organization-owner.repository.js";

describe("organization owner queries", () => {
  it("serializes writers with a non-key organization lock compatible with session foreign keys", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "org" }]);
    const lock = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: lock });
    const tx = { select: () => ({ from: () => ({ where }) }) };
    const repository = new OrganizationOwnerRepository({} as never);
    expect(await repository.lockOrganization("org", tx as never)).toBe(true);
    expect(lock).toHaveBeenCalledWith("no key update");
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.params).toEqual(["org", "active"]);
  });
  it("counts only active users with active builtin owner memberships", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 1 }]);
    const query = { innerJoin: vi.fn(), where };
    query.innerJoin.mockReturnValue(query);
    const repository = new OrganizationOwnerRepository({} as never);
    expect(
      await repository.countActiveOwners("org", { select: () => ({ from: () => query }) } as never),
    ).toBe(1);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]).params).toEqual([
      "org",
      "active",
      "active",
      "owner",
      true,
    ]);
  });
  it("does not treat a custom role using the owner key as a builtin identity", async () => {
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ key: "owner", isSystem: false }] }) }),
      }),
    };
    const repository = new OrganizationOwnerRepository({} as never);
    expect(await repository.findRoleKey("org", "role", tx as never)).toBeNull();
  });
});

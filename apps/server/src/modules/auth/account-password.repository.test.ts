import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { AccountPasswordRepository } from "./account-password.repository.js";

function harness(results: object[][]) {
  const where = vi.fn();
  const limit = vi.fn();
  for (const result of results) limit.mockResolvedValueOnce(result);
  const executor = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          where(condition);
          return { limit };
        },
      }),
    }),
  };
  return { repository: new AccountPasswordRepository({} as never), executor, where, limit };
}
describe("password scope eligibility query", () => {
  it.each([
    true,
    false,
  ])("requires an active organization even for super admin (%s)", async (active) => {
    const h = harness([active ? [{ id: "org" }] : []]);
    expect(await h.repository.canUseOrganization("user", "org", true, h.executor as never)).toBe(
      active,
    );
    expect(h.where).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(h.where.mock.calls[0]?.[0]);
    expect(query.params).toEqual(["org", "active"]);
  });
  it.each([true, false])("requires the normal user's active membership (%s)", async (active) => {
    const h = harness([[{ id: "org" }], active ? [{ id: "member" }] : []]);
    expect(await h.repository.canUseOrganization("user", "org", false, h.executor as never)).toBe(
      active,
    );
    const query = new PgDialect().sqlToQuery(h.where.mock.calls[1]?.[0]);
    expect(query.params).toEqual(["org", "user", "active"]);
  });
});

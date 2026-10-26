import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { organizations } from "../../db/schema.js";
import { OrganizationsRepository } from "./organizations.repository.js";

describe("OrganizationsRepository", () => {
  it("lists active organizations without membership restrictions in a stable order", async () => {
    const items = [{ id: "org-a", name: "A", status: "active" }];
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(items),
    };
    const select = vi.fn().mockReturnValue(query);
    const repository = new OrganizationsRepository({ select } as never);

    await expect(repository.listActiveOrganizations()).resolves.toEqual(items);

    expect(select).toHaveBeenCalledWith({
      id: organizations.id,
      name: organizations.name,
      status: organizations.status,
    });
    expect(query.from).toHaveBeenCalledWith(organizations);
    const dialect = new PgDialect();
    const condition = dialect.sqlToQuery(query.where.mock.calls[0]?.[0]);
    expect(condition.sql).toBe('"organizations"."status" = $1');
    expect(condition.params).toEqual(["active"]);
    const order = query.orderBy.mock.calls[0] ?? [];
    expect(order.map((item) => dialect.sqlToQuery(item).sql)).toEqual([
      '"organizations"."name" asc',
      '"organizations"."id" asc',
    ]);
  });
});

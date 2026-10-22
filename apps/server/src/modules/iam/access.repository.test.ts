import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { AccessRepository } from "./access.repository.js";

describe("AccessRepository session target", () => {
  it.each([
    null,
    "org-1",
  ])("matches the persisted organization target %s", async (organizationId) => {
    const limit = vi.fn().mockResolvedValue([{ id: "session-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const repository = new AccessRepository({
      select: () => ({ from: () => ({ where }) }),
    } as never);
    await expect(
      repository.findActiveSession({ userId: "user-1", sessionId: "session-1", organizationId }),
    ).resolves.toEqual({ id: "session-1" });
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"refresh_sessions"."user_id" =');
    expect(query.sql).toContain('"refresh_sessions"."expires_at" >');
    expect(query.params).toContain("active");
    if (organizationId === null) {
      expect(query.sql).toContain('"refresh_sessions"."current_organization_id" is null');
      expect(query.params).not.toContain(null);
    } else {
      expect(query.sql).toContain('"refresh_sessions"."current_organization_id" =');
      expect(query.params).toContain(organizationId);
    }
  });
});

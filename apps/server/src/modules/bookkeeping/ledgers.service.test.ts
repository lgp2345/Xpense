import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { LedgersService } from "./ledgers.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

describe("LedgersService", () => {
  it("lists only active ledgers in the current organization", async () => {
    const repository = {
      listActive: vi.fn().mockResolvedValue([]),
    };
    const service = new LedgersService(repository as never);

    await expect(service.list(authContext)).resolves.toEqual([]);

    expect(repository.listActive).toHaveBeenCalledWith("organization-1");
  });
});

import { describe, expect, it, vi } from "vitest";

import { DatabaseReadinessService } from "./database-readiness.service.js";
import type { AppDb } from "./db.module.js";

describe("DatabaseReadinessService", () => {
  it("executes a lightweight database query", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const service = new DatabaseReadinessService({ execute } as unknown as AppDb);

    await expect(service.check()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("propagates database failures to the readiness boundary", async () => {
    const error = new Error("database unavailable");
    const execute = vi.fn().mockRejectedValue(error);
    const service = new DatabaseReadinessService({ execute } as unknown as AppDb);

    await expect(service.check()).rejects.toBe(error);
  });
});

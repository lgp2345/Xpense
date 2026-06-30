import { describe, expect, it, vi } from "vitest";

import { fetchHello } from "./foundation-api";

describe("fetchHello", () => {
  it("requests the shared hello route from the configured API base URL", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appName: "Xpense",
        message: "Hello from Xpense API",
      }),
    });

    await expect(fetchHello({ apiBaseUrl: "http://localhost:4000", fetcher })).resolves.toEqual({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });

    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/foundation/hello");
  });

  it("turns failed responses into a user-facing error", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(fetchHello({ apiBaseUrl: "http://localhost:4000", fetcher })).rejects.toThrow(
      "API request failed with status 503",
    );
  });
});

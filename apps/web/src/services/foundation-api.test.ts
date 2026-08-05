import { describe, expect, it, vi } from "vitest";

import { fetchHello } from "./foundation-api";

describe("fetchHello", () => {
  it("requests the shared hello route and parses the enveloped data", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        appName: "Xpense",
        message: "Hello from Xpense API",
      }),
    };

    await expect(fetchHello({ apiBaseUrl: "http://localhost:4000", client })).resolves.toEqual({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });

    expect(client.get).toHaveBeenCalledWith("/foundation/hello");
  });

  it("rejects when the data does not match the shared contract", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ appName: "Not Xpense", message: "wrong" }),
    };

    await expect(fetchHello({ apiBaseUrl: "http://localhost:4000", client })).rejects.toThrow();
  });

  it("propagates client errors", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error("网络异常，请检查网络连接")),
    };

    await expect(fetchHello({ apiBaseUrl: "http://localhost:4000", client })).rejects.toThrow(
      "网络异常，请检查网络连接",
    );
  });
});

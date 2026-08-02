import { describe, expect, it } from "vitest";

import { API_BASE_URL, createApiBaseUrl } from "./env";

describe("API environment", () => {
  it("falls back to the api prefix when the environment value is missing", () => {
    expect(import.meta.env.VITE_API_PREFIX).toBeUndefined();
    expect(API_BASE_URL).toBe("/api");
  });

  it("builds a base path from a custom prefix", () => {
    expect(createApiBaseUrl("v2")).toBe("/v2");
  });

  it.each(["/api", "api/", ""])('rejects an invalid prefix: %s', (prefix) => {
    expect(() => createApiBaseUrl(prefix)).toThrow(
      "VITE_API_PREFIX must be a non-empty path segment",
    );
  });
});

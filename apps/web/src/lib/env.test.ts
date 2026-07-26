import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "./env";

describe("API environment", () => {
  it("does not fall back to a hardcoded API address when the environment value is missing", () => {
    expect(import.meta.env.VITE_API_BASE_URL).toBeUndefined();
    expect(API_BASE_URL).toBeUndefined();
  });
});

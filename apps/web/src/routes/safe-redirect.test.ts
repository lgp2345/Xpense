import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "./safe-redirect";

describe("getSafeRedirectPath", () => {
  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
  ])("rejects external target %s", (target) => {
    expect(getSafeRedirectPath(target)).toBe("/");
  });

  it("keeps an internal path with search and hash", () => {
    expect(getSafeRedirectPath("/roles?scope=mine#active")).toBe("/roles?scope=mine#active");
  });

  it.each([
    "/login",
    "/login?redirect=/roles",
    "/login/",
  ])("rejects login self-redirect target %s", (target) => {
    expect(getSafeRedirectPath(target)).toBe("/");
  });
});

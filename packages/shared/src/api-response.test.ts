import { describe, expect, it } from "vitest";

import { API_CODES, isApiResponse } from "./api-response";

describe("API_CODES", () => {
  it("declares the success code and a code for every HTTP error state", () => {
    expect(API_CODES.ok).toBe("OK");
    expect(Object.values(API_CODES)).toEqual([
      "OK",
      "VALIDATION_FAILED",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "TOO_MANY_REQUESTS",
      "INTERNAL_ERROR",
      "SERVICE_UNAVAILABLE",
    ]);
  });
});

describe("isApiResponse", () => {
  it("accepts a full envelope", () => {
    expect(isApiResponse({ code: API_CODES.ok, message: "ok", data: { id: "1" } })).toBe(true);
    expect(isApiResponse({ code: "CUSTOM_CODE", message: "x", data: null })).toBe(true);
  });

  it("rejects missing, partial, or non-object payloads", () => {
    expect(isApiResponse(null)).toBe(false);
    expect(isApiResponse("ok")).toBe(false);
    expect(isApiResponse({})).toBe(false);
    expect(isApiResponse({ code: "OK" })).toBe(false);
    expect(isApiResponse({ code: "OK", message: "ok" })).toBe(false);
    expect(isApiResponse({ message: "ok", data: null })).toBe(false);
  });
});

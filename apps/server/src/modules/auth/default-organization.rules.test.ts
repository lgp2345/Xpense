import { describe, expect, it } from "vitest";
import { selectDefaultOrganization } from "./default-organization.rules.js";

const older = { organizationId: "a", joinedAt: new Date("2026-01-01") };
const newer = { organizationId: "b", joinedAt: new Date("2026-02-01") };
describe("default organization", () => {
  it("keeps a valid preference even after joining another organization", () => {
    expect(selectDefaultOrganization("a", [older, newer])).toBe("a");
  });
  it("falls back to the most recently joined eligible organization", () => {
    expect(selectDefaultOrganization("missing", [older, newer])).toBe("b");
  });
  it("uses ascending organization ID as the tie breaker without mutating candidates", () => {
    const candidates = [newer, { ...newer, organizationId: "a" }];
    expect(selectDefaultOrganization(null, candidates)).toBe("a");
    expect(candidates[0]?.organizationId).toBe("b");
  });
  it("does not create platform access when no organization is available", () => {
    expect(selectDefaultOrganization("missing", [])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { inspectOrganizationPreflight } from "./organization-preflight.js";

const row = {
  id: "org-a",
  name: "甲",
  baseCurrency: "CNY",
  timezone: "Asia/Shanghai",
  activeOwnerCount: 1,
};

describe("organization migration preflight", () => {
  it("reports normalized duplicates for both affected organizations without changing data", () => {
    const rows = [
      { ...row, name: " 甲 " },
      { ...row, id: "org-b" },
    ];
    expect(inspectOrganizationPreflight(rows)).toEqual([
      { organizationId: "org-a", code: "unnormalized_name" },
      { organizationId: "org-a", code: "duplicate_name" },
      { organizationId: "org-b", code: "duplicate_name" },
    ]);
    expect(rows[0]?.name).toBe(" 甲 ");
  });

  it("reports invalid currency, timezone, empty name and missing active owner", () => {
    expect(
      inspectOrganizationPreflight([
        { ...row, name: " ", baseCurrency: "EUR", timezone: "Invalid/Zone", activeOwnerCount: 0 },
      ]),
    ).toEqual([
      { organizationId: "org-a", code: "unnormalized_name" },
      { organizationId: "org-a", code: "unsupported_currency" },
      { organizationId: "org-a", code: "invalid_timezone" },
      { organizationId: "org-a", code: "missing_owner" },
    ]);
  });

  it("accepts CNY/USD and exact distinct names without case or width folding", () => {
    expect(
      inspectOrganizationPreflight([
        { ...row, name: "A" },
        {
          ...row,
          id: "org-b",
          name: "a",
          baseCurrency: "USD",
          timezone: "America/New_York",
          activeOwnerCount: 2,
        },
      ]),
    ).toEqual([]);
  });
});

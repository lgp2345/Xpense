import { describe, expect, it } from "vitest";

import { createOrganizationSchema } from "./create-organization.dto.js";
import { listOrganizationsSchema } from "./list-organizations.dto.js";
import { updateOrganizationProfileSchema } from "./update-organization-profile.dto.js";

const owner = { kind: "new", phone: "13800000001" };
const input = { name: "示例组织", baseCurrency: "USD", owners: [owner] };

describe("organization inputs", () => {
  it("normalizes names and optional profile/email fields and defaults new credentials", () => {
    expect(
      createOrganizationSchema.parse({
        ...input,
        name: "  示例组织  ",
        contactName: " ",
        contactPhone: " 123 ",
        address: "",
        owners: [{ ...owner, email: " " }],
      }),
    ).toEqual({
      name: "示例组织",
      baseCurrency: "USD",
      timezone: "Asia/Shanghai",
      contactName: null,
      contactPhone: "123",
      address: null,
      owners: [{ ...owner, email: null, initialPassword: "888888" }],
    });
  });

  it.each([
    { baseCurrency: "EUR" },
    { name: " " },
    { timezone: "Invalid/Zone" },
    { owners: [] },
    { owners: [owner, { ...owner, phone: " 13800000001 " }] },
    { owners: [{ ...owner, phone: "123" }] },
    { owners: [{ ...owner, email: "invalid" }] },
    { owners: [{ ...owner, initialPassword: "12345" }] },
    { owners: [{ ...owner, initialPassword: "a".repeat(129) }] },
    {
      owners: [
        {
          kind: "existing",
          phone: owner.phone,
          userId: "00000000-0000-4000-8000-000000000001",
          confirmed: false,
        },
      ],
    },
    {
      owners: [
        { kind: "existing", phone: owner.phone, userId: "00000000-0000-4000-8000-000000000001" },
      ],
    },
    {
      owners: [
        {
          kind: "existing",
          phone: owner.phone,
          userId: "00000000-0000-4000-8000-000000000001",
          confirmed: true,
          initialPassword: "888888",
        },
      ],
    },
    { logo: "unwanted" },
  ])("rejects invalid or ambiguous creation input %j", (override) => {
    expect(createOrganizationSchema.safeParse({ ...input, ...override }).success).toBe(false);
  });

  it("preserves explicit existing-account association and custom new passwords", () => {
    const existing = {
      kind: "existing",
      phone: "13800000002",
      userId: "00000000-0000-4000-8000-000000000001",
      confirmed: true,
    };
    const newOwner = {
      ...owner,
      email: "owner@example.test",
      initialPassword: "test-initial-password",
    };
    expect(
      createOrganizationSchema.parse({
        ...input,
        timezone: "America/New_York",
        owners: [newOwner, existing],
      }).owners,
    ).toEqual([newOwner, existing]);
  });

  it.each([
    "name",
    "baseCurrency",
    "timezone",
    "owners",
  ])("rejects immutable update field %s even with its original value", (key) => {
    expect(
      updateOrganizationProfileSchema.safeParse({
        contactName: "新联系人",
        [key]: { ...input, timezone: "Asia/Shanghai" }[key as keyof typeof input],
      }).success,
    ).toBe(false);
  });

  it("clears only submitted profile fields", () => {
    expect(updateOrganizationProfileSchema.parse({ contactName: " ", address: null })).toEqual({
      contactName: null,
      address: null,
    });
    expect(updateOrganizationProfileSchema.parse({ contactPhone: " 123 " })).toEqual({
      contactPhone: "123",
    });
  });

  it("normalizes pagination and filters", () => {
    expect(listOrganizationsSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      listOrganizationsSchema.parse({
        page: "2",
        pageSize: "100",
        name: "  示例 ",
        status: "disabled",
      }),
    ).toEqual({ page: 2, pageSize: 100, name: "示例", status: "disabled" });
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 101 },
    { status: "unknown" },
  ])("rejects invalid list filter %j", (query) => {
    expect(listOrganizationsSchema.safeParse(query).success).toBe(false);
  });
});

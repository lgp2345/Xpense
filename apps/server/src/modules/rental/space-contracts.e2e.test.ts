import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { rentalTestIds } from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";

describe("space contract list HTTP", () => {
  let harness: TestAppHarness | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });
  afterEach(async () => {
    vi.useRealTimers();
    await harness?.app.close();
  });

  it.each([
    undefined,
    "related",
  ] as const)("passes validated space and pagination scope to the organization repository (%s)", async (spaceScope) => {
    harness = await createTestApp({ rental: true });
    const { accessToken } = await login(harness.app, TEST_PHONES.owner);
    const input = {
      propertyId: rentalTestIds.property,
      spaceId: rentalTestIds.childSpace,
      currentOnly: true,
      ...(spaceScope ? { spaceScope } : {}),
      page: 2,
      pageSize: 10,
    };
    harness.state.rentalQuery.registerRead(
      "contracts.list",
      [testIds.organization, "2026-08-31T12:00:00", input],
      { items: [], total: 12, page: 2, pageSize: 10 },
    );
    const query = new URLSearchParams(
      Object.entries(input).map(([key, value]) => [key, String(value)]),
    );
    const response = await harness.app.inject({
      method: "GET",
      url: `/api/rental-contracts/list?${query}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(parseJson(response)).toMatchObject({
      data: { items: [], total: 12, page: 2, pageSize: 10 },
    });
  });

  it("requires authentication and rejects invalid space ids", async () => {
    harness = await createTestApp({ rental: true });
    const anonymous = await harness.app.inject({
      method: "GET",
      url: `/api/rental-contracts/list?spaceId=${rentalTestIds.childSpace}`,
    });
    expect(anonymous.statusCode).toBe(401);
    const { accessToken } = await login(harness.app, TEST_PHONES.owner);
    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/rental-contracts/list?spaceId=invalid",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.payload).toContain("VALIDATION_FAILED");
  });

  it("keeps space contract filtering behind contract read permission", async () => {
    harness = await createTestApp({ rental: true });
    const role = harness.state.roles.get(testIds.viewerRole);
    if (!role) throw new Error("Missing viewer test role");
    role.permissions = role.permissions.filter((key) => key !== "rental_contracts:read");
    const { accessToken } = await login(harness.app, TEST_PHONES.viewer);
    const response = await harness.app.inject({
      method: "GET",
      url: `/api/rental-contracts/list?spaceId=${rentalTestIds.childSpace}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});

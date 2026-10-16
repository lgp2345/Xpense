import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { rentalTestIds } from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";

describe("space filter HTTP", () => {
  let harness: TestAppHarness | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });
  afterEach(async () => {
    vi.useRealTimers();
    await harness?.app.close();
  });
  it("combines empty keyword, effective state, lease status and paging within the organization", async () => {
    harness = await createTestApp({ bookkeeping: true, rental: true });
    const { accessToken } = await login(harness.app, TEST_PHONES.owner);
    const input = {
      keyword: "",
      isEffectivelyActive: false,
      leaseFilter: { status: "active", now: "2026-08-31T12:00:00" },
      page: 2,
      pageSize: 20,
    };
    harness.state.rentalQuery.registerRead(
      "spaces.search",
      [testIds.organization, rentalTestIds.property, input],
      { items: [], total: 0, page: 2, pageSize: 20 },
    );
    const response = await harness.app.inject({
      method: "GET",
      url: `/api/rental-spaces/search?propertyId=${rentalTestIds.property}&keyword=&isEffectivelyActive=false&leaseStatus=active&page=2&pageSize=20`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(parseJson(response)).toMatchObject({
      data: { items: [], total: 0, page: 2, pageSize: 20 },
    });
  });
  it("rejects invalid lease and effective state filters through the HTTP boundary", async () => {
    harness = await createTestApp({ bookkeeping: true, rental: true });
    const { accessToken } = await login(harness.app, TEST_PHONES.owner);
    for (const filter of ["leaseStatus=cancelled", "isEffectivelyActive=yes"]) {
      const response = await harness.app.inject({
        method: "GET",
        url: `/api/rental-spaces/search?propertyId=${rentalTestIds.property}&${filter}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

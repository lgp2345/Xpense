import type { AuthorizedMenuNode } from "@xpense/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { MenuRepository } from "./menu.repository.js";

describe("role menus", () => {
  let harness: TestAppHarness;
  afterEach(async () => {
    await harness?.app.close();
  });

  async function setup() {
    harness = await createTestApp({ managerPermissions: ["roles:read"] });
    const { accessToken } = await login(harness.app, TEST_PHONES.manager);
    return { ...harness, headers: { authorization: `Bearer ${accessToken}` } };
  }

  it("returns the selected role's navigation with only roles:read", async () => {
    const { app, state, headers } = await setup();
    const role = state.roles.get(testIds.viewerRole);
    if (!role) throw new Error("viewer role fixture required");
    role.permissions = ["members:read", "members:update"];

    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list?roleId=${role.id}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    const { data } = parseJson<{ data: AuthorizedMenuNode[] }>(response);
    expect(data).toEqual([
      expect.objectContaining({
        name: "访问控制",
        children: [expect.objectContaining({ name: "成员管理", children: [] })],
      }),
    ]);
  });

  it("uses target permissions even when the viewer is a super administrator", async () => {
    const { app, state } = await setup();
    const role = state.roles.get(testIds.viewerRole);
    if (!role) throw new Error("viewer role fixture required");
    role.permissions = [];
    const { accessToken } = await login(app, TEST_PHONES.super);
    const selectedOrganization = await app.inject({
      method: "POST",
      url: "/api/user/current-organization",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { organizationId: testIds.organization },
    });
    expect(selectedOrganization.statusCode).toBe(200);
    const selectedToken = parseJson<{ data: { accessToken: string } }>(selectedOrganization).data
      .accessToken;

    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list?roleId=${role.id}`,
      headers: { authorization: `Bearer ${selectedToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(parseJson<{ data: unknown }>(response).data).toEqual([]);
  });

  it("allows non-editable system roles", async () => {
    const { app, state, headers } = await setup();
    const role = state.roles.get(testIds.ownerRole);
    if (!role) throw new Error("owner role fixture required");
    role.organizationId = null;
    role.isSystem = true;
    role.isEditable = false;
    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list?roleId=${role.id}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(parseJson<{ data: AuthorizedMenuNode[] }>(response).data.length).toBeGreaterThan(0);
  });

  it("rejects a role from another organization", async () => {
    const { app, state, headers } = await setup();
    const role = state.roles.get(testIds.viewerRole);
    if (!role) throw new Error("viewer role fixture required");
    role.organizationId = testIds.otherOrganization;
    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list?roleId=${role.id}`,
      headers,
    });
    expect(response.statusCode).toBe(404);
  });

  it.each(["", "?roleId=invalid"])("validates the role query %s", async (query) => {
    const { app, headers } = await setup();
    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list${query}`,
      headers,
    });
    expect(response.statusCode).toBe(400);
    expect(parseJson<{ code: string }>(response).code).toBe("VALIDATION_FAILED");
  });

  it("requires authentication and roles:read", async () => {
    const { app } = await setup();
    const url = `/api/roles/menus/list?roleId=${testIds.ownerRole}`;
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    const { accessToken } = await login(app, TEST_PHONES.viewer);
    expect(
      (
        await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("maps repository failures through the standard error response", async () => {
    const { app, headers } = await setup();
    vi.spyOn(app.get(MenuRepository), "listByOrganizationId").mockRejectedValueOnce(
      new Error("menu query failed"),
    );
    const response = await app.inject({
      method: "GET",
      url: `/api/roles/menus/list?roleId=${testIds.ownerRole}`,
      headers,
    });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("menu query failed");
  });
});

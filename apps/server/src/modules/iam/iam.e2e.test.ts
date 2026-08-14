import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";

import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import {
  createTestApp,
  type TestAppHarness,
  type TestAppOptions,
} from "../../test/create-test-app.js";

const otherOrganizationRoleId = "22222222-2222-4222-8222-222222222299";
const missingOrganizationId = "00000000-0000-4000-8000-000000000099";

type ExactPermissionCase = {
  title: string;
  method: "GET" | "POST";
  url: string;
  payload?: Record<string, unknown>;
  targetPermission: PermissionKey;
  adjacentPermission: PermissionKey;
  successStatus: number;
};

const exactPermissionCases: readonly ExactPermissionCase[] = [
  {
    title: "menu configuration",
    method: "GET",
    url: "/api/menus/configuration",
    targetPermission: "menus:read",
    adjacentPermission: "menus:create",
    successStatus: 200,
  },
  {
    title: "menu add",
    method: "POST",
    url: "/api/menus/add",
    payload: { type: "directory", name: "Reports", parentId: null },
    targetPermission: "menus:create",
    adjacentPermission: "menus:update",
    successStatus: 200,
  },
  {
    title: "menu edit",
    method: "POST",
    url: "/api/menus/edit",
    payload: {
      id: 2,
      type: "menu",
      name: "Menu settings",
      parentId: 1,
      routeKey: "Menus",
      icon: "ShieldCheck",
      permissionCode: "menus:read",
      isExternal: false,
      isVisible: true,
      keepAlive: true,
    },
    targetPermission: "menus:update",
    adjacentPermission: "menus:delete",
    successStatus: 200,
  },
  {
    title: "menu delete",
    method: "POST",
    url: "/api/menus/delete",
    payload: { id: 5 },
    targetPermission: "menus:delete",
    adjacentPermission: "menus:update",
    successStatus: 200,
  },
  {
    title: "menu edit order",
    method: "POST",
    url: "/api/menus/edit-order",
    payload: { id: 8, direction: "up" },
    targetPermission: "menus:update",
    adjacentPermission: "menus:read",
    successStatus: 200,
  },
  {
    title: "role metadata edit",
    method: "POST",
    url: "/api/roles/update",
    payload: { id: testIds.viewerRole, name: "Read only" },
    targetPermission: "roles:update",
    adjacentPermission: "roles:permissions:update",
    successStatus: 200,
  },
];

type InjectResponse = {
  payload: string;
  statusCode: number;
};

function expectOk<T>(response: InjectResponse): T {
  const body = parseJson<{ code: string; message: string; data: T }>(response);

  expect(Object.keys(body).toSorted()).toEqual(["code", "data", "message"]);
  expect(body.code).toBe("OK");
  expect(body.message).toBe("ok");

  return body.data;
}

function expectApiError(response: InjectResponse, statusCode: number, code: string): void {
  expect(response.statusCode).toBe(statusCode);
  const body = parseJson<{ code: string; message: string; data: unknown }>(response);

  expect(Object.keys(body).toSorted()).toEqual(["code", "data", "message"]);
  expect(body.code).toBe(code);
  expect(body.message).toEqual(expect.any(String));
  expect(body.data).toBeNull();
}

function collectPermissionCodes(nodes: readonly PermissionTreeNode[]): PermissionKey[] {
  return nodes
    .flatMap((node) => [
      ...(node.permissionCode === null ? [] : [node.permissionCode]),
      ...collectPermissionCodes(node.children),
    ])
    .toSorted();
}

describe("IAM e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(options?: TestAppOptions): Promise<TestAppHarness> {
    harness = await createTestApp(options);
    return harness;
  }

  it.each(
    exactPermissionCases,
  )("$title accepts the exact target permission without adjacent permissions", async ({
    method,
    url,
    payload,
    targetPermission,
    adjacentPermission,
    successStatus,
  }) => {
    const { app, state } = await createHarness({ managerPermissions: [targetPermission] });
    const managerPermissions = state.roles.get(testIds.managerRole)?.permissions ?? [];
    const { accessToken } = await login(app, "manager@example.com");

    expect(managerPermissions).toEqual([targetPermission]);
    expect(managerPermissions).not.toContain(adjacentPermission);

    const response = await app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      ...(payload ? { payload } : {}),
    });

    expect(response.statusCode).toBe(successStatus);
    expectOk(response);
  });

  it.each(
    exactPermissionCases,
  )("$title rejects an adjacent permission without the target permission", async ({
    method,
    url,
    payload,
    targetPermission,
    adjacentPermission,
  }) => {
    const { app, state } = await createHarness({ managerPermissions: [adjacentPermission] });
    const managerPermissions = state.roles.get(testIds.managerRole)?.permissions ?? [];
    const { accessToken } = await login(app, "manager@example.com");

    expect(managerPermissions).toEqual([adjacentPermission]);
    expect(managerPermissions).not.toContain(targetPermission);

    const response = await app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      ...(payload ? { payload } : {}),
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("GET /roles/list without permission returns 403", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "viewer@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/roles/list",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("GET /roles/list with roles.read returns 200", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/roles/list",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(parseJson<{ data: unknown }>(response).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: testIds.managerRole,
          key: "manager",
          permissionKeys: expect.arrayContaining(["roles:read", "roles:update", "members:update"]),
        }),
      ]),
    );
  });

  it("super_admin active member can access /roles/list without roles.read", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "super@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/roles/list",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("super_admin non-member cannot access current organization", async () => {
    const { app, auth } = await createHarness();
    const accessToken = await auth.signAccessToken({
      userId: testIds.superNonMemberUser,
      sessionId: "session-super-non-member",
      organizationId: testIds.organization,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/roles/list",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect([401, 403]).toContain(response.statusCode);
  });

  it("POST /roles/update rejects permission changes without roles.permissions.update", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.managerRole,
        permissionKeys: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("POST /members/update writes audit log and ignores body.organizationId", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-request-id": "e2e-request-123",
      },
      payload: {
        id: testIds.viewerMember,
        organizationId: testIds.otherOrganization,
        roleId: testIds.managerRole,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("e2e-request-123");
    expect(parseJson<{ data: unknown }>(response).data).toMatchObject({
      id: testIds.viewerMember,
      organizationId: testIds.organization,
      roleId: testIds.managerRole,
    });
    expect(state.members.get(testIds.viewerMember)?.organizationId).toBe(testIds.organization);
    expect(state.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: testIds.organization,
          action: "member.role.changed",
          targetId: testIds.viewerMember,
          requestId: "e2e-request-123",
        }),
      ]),
    );
  });

  it("POST /members/update rejects disabling without members.disable", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerMember,
        status: "disabled",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(state.members.get(testIds.viewerMember)?.status).toBe("active");
  });

  it("POST /members/update rejects enabling without members.enable", async () => {
    const { app, state } = await createHarness();
    const viewerMember = state.members.get(testIds.viewerMember);

    if (!viewerMember) {
      throw new Error("Viewer member fixture is required");
    }

    state.members.set(testIds.viewerMember, {
      ...viewerMember,
      status: "disabled",
    });
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerMember,
        status: "active",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(state.members.get(testIds.viewerMember)?.status).toBe("disabled");
  });

  it("POST /members/update allows status-only updates without members.update", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerMember,
        status: "disabled",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(state.members.get(testIds.viewerMember)?.status).toBe("disabled");
  });

  it("POST /members/update requires members.update for role assignment", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerMember,
        roleId: testIds.managerRole,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(state.members.get(testIds.viewerMember)?.roleId).toBe(testIds.viewerRole);
  });

  it("POST /members/update requires every permission for a combined update", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerMember,
        roleId: testIds.managerRole,
        status: "disabled",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(state.members.get(testIds.viewerMember)).toMatchObject({
      roleId: testIds.viewerRole,
      status: "active",
    });
  });

  it("POST /roles/create rejects permissions above a non-super-admin actor", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/create",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        key: "elevated",
        name: "Elevated",
        permissionKeys: ["transactions:delete"],
      },
    });

    expect(response.statusCode).toBe(403);
    expect([...state.roles.values()].some((role) => role.key === "elevated")).toBe(false);
  });

  it("POST /roles/update rejects permissions above a non-super-admin actor", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.managerRole,
        permissionKeys: ["transactions:delete"],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(state.roles.get(testIds.managerRole)?.permissions).not.toContain("transactions:delete");
  });

  it("POST /members/create rejects assigning a role above a non-super-admin actor", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/create",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        userId: testIds.outsiderUser,
        roleId: testIds.viewerRole,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(
      [...state.members.values()].some((member) => member.userId === testIds.outsiderUser),
    ).toBe(false);
  });

  it("allows a super admin to grant permissions above their assigned role", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "super@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/create",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        key: "super-managed",
        name: "Super managed",
        permissionKeys: ["transactions:delete"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      state.roles.get(parseJson<{ data: { id: string } }>(response).data.id)?.permissions,
    ).toEqual(["transactions:delete"]);
  });

  it("allows a super admin to assign a role above their assigned role", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "super@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/members/create",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        userId: testIds.outsiderUser,
        roleId: testIds.managerRole,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      [...state.members.values()].find((member) => member.userId === testIds.outsiderUser),
    ).toMatchObject({ roleId: testIds.managerRole });
  });

  it("POST /roles/update updates role metadata through the action API", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerRole,
        name: "Read only",
        description: "Read-only role",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toMatchObject({
      id: testIds.viewerRole,
      name: "Read only",
      description: "Read-only role",
    });
    expect(state.roles.get(testIds.viewerRole)?.permissions).toEqual(["transactions:read"]);
  });

  it("POST /roles/update rejects permissionKeys instead of changing permissions", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerRole,
        name: "Read only",
        permissionKeys: ["roles:read"],
      },
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
    expect(state.roles.get(testIds.viewerRole)?.permissions).toEqual(["transactions:read"]);
  });

  it("POST /roles/update validates id in the request body", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: 7,
        name: "Read only",
      },
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
  });

  it("POST /roles/update returns 403 without roles.update", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "viewer@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: testIds.viewerRole,
        name: "Read only",
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /roles/update returns 404 for a role in another organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/update",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: otherOrganizationRoleId,
        name: "Cross organization",
      },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("GET /permissions/tree applies the actor ceiling and ancestor closure recursively", async () => {
    const { app } = await createHarness({
      managerPermissions: ["roles:permissions:update", "menus:create", "transactions:read"],
    });
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/permissions/tree",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const permissionCodes = collectPermissionCodes(expectOk<PermissionTreeNode[]>(response));

    expect(permissionCodes).toEqual(["roles:permissions:update", "transactions:read"]);
    expect(permissionCodes).not.toContain("menus:create");
    expect(permissionCodes).not.toContain("transactions:delete");
    expect(permissionCodes).not.toContain("audit_logs:read");
  });

  it.each([
    {
      missingAncestor: "top-level menus:read",
      managerPermissions: ["roles:permissions:update", "roles:read", "roles:update"] as const,
      expectedPermissionCodes: ["roles:permissions:update"],
    },
    {
      missingAncestor: "intermediate roles:read",
      managerPermissions: ["roles:permissions:update", "menus:read", "roles:update"] as const,
      expectedPermissionCodes: ["menus:read", "roles:permissions:update"],
    },
    {
      missingAncestor: "no ancestor",
      managerPermissions: [
        "roles:permissions:update",
        "menus:read",
        "roles:read",
        "roles:update",
      ] as const,
      expectedPermissionCodes: [
        "menus:read",
        "roles:permissions:update",
        "roles:read",
        "roles:update",
      ],
    },
  ])("GET /permissions/tree excludes a deep permission when $missingAncestor is missing", async ({
    managerPermissions,
    expectedPermissionCodes,
    missingAncestor,
  }) => {
    const { app, state } = await createHarness({ managerPermissions });
    const roleMenu = state.menus.get(7);

    if (!roleMenu) {
      throw new Error("Role menu fixture is required");
    }

    state.menus.set(7, { ...roleMenu, parentId: 2 });
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/permissions/tree",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const permissionCodes = collectPermissionCodes(expectOk<PermissionTreeNode[]>(response));

    expect(permissionCodes).toEqual(expectedPermissionCodes);
    if (missingAncestor !== "no ancestor") {
      expect(permissionCodes).not.toContain("roles:update");
    }
  });

  it("GET /permissions/tree returns 403 without roles.permissions.update", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/permissions/tree",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /roles/permissions/edit replaces manageable permissions separately from metadata", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/permissions/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        roleId: testIds.viewerRole,
        permissionKeys: ["roles:read", "roles:update"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toBeNull();
    expect(state.roles.get(testIds.viewerRole)?.permissions).toEqual([
      "roles:read",
      "roles:update",
      "transactions:read",
    ]);
  });

  it("POST /roles/permissions/edit returns 400 when a menu ancestor permission is missing", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/permissions/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        roleId: testIds.viewerRole,
        permissionKeys: ["menus:create"],
      },
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
  });

  it("POST /roles/permissions/edit returns 403 without its permission", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/permissions/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        roleId: testIds.viewerRole,
        permissionKeys: [],
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /roles/permissions/edit rejects permissions above the actor", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/permissions/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        roleId: testIds.viewerRole,
        permissionKeys: ["transactions:delete"],
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /roles/permissions/edit returns 404 for a role in another organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/roles/permissions/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        roleId: otherOrganizationRoleId,
        permissionKeys: ["roles:read"],
      },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("GET /menus returns 401 without authentication", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/menus",
    });

    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("GET /menus self-filters for authenticated users without menus.read", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toEqual([
      expect.objectContaining({
        id: 1,
        children: [expect.objectContaining({ id: 7, permissionCode: "roles:read" })],
      }),
    ]);
  });

  it("GET /menus never returns button nodes", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(expectOk(response))).not.toContain('"type":"button"');
  });

  it("GET /menus/resolve resolves an authorized route from the path query", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/resolve?path=%2Froles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toMatchObject({
      id: 7,
      routeKey: "Roles",
      path: "/roles",
      permissionCode: "roles:read",
    });
  });

  it("GET /menus/resolve validates the path query", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/resolve?path=roles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
  });

  it("GET /menus/resolve returns 403 for an unauthorized route", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "viewer@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/resolve?path=%2Froles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("GET /menus/resolve does not resolve another organization's route", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/resolve?path=%2Fsessions",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("GET /menus/configuration returns the complete current-organization tree", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/configuration",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          children: expect.arrayContaining([
            expect.objectContaining({
              id: 2,
              children: expect.arrayContaining([
                expect.objectContaining({ id: 3, type: "button" }),
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it("GET /menus/configuration requires menus.read", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/menus/configuration",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /menus/add creates a menu with a numeric ID", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/add",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        type: "directory",
        name: "Reports",
        parentId: null,
      },
    });

    expect(response.statusCode).toBe(200);
    const created = expectOk<{ id: number; name: string }>(response);
    expect(created).toMatchObject({ id: expect.any(Number), name: "Reports" });
    expect(state.menus.get(created.id)?.organizationId).toBe(testIds.organization);
  });

  it("POST /menus/add rejects string parent IDs", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/add",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        type: "directory",
        name: "Reports",
        parentId: "1",
      },
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
  });

  it.each([
    [
      "/api/menus/edit",
      {
        id: "2",
        type: "menu",
        name: "Menu settings",
        parentId: 1,
        routeKey: "Menus",
        icon: "ShieldCheck",
        permissionCode: "menus:read",
        isExternal: false,
        isVisible: true,
        keepAlive: true,
      },
    ],
    ["/api/menus/delete", { id: "5" }],
    ["/api/menus/edit-order", { id: "8", direction: "up" }],
  ])("POST %s rejects string menu IDs", async (url, payload) => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload,
    });

    expectApiError(response, 400, "VALIDATION_FAILED");
  });

  it("POST /menus/add requires menus.create", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/add",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        type: "directory",
        name: "Reports",
        parentId: null,
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /menus/add returns 409 for a duplicate internal route", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/add",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        type: "menu",
        name: "Duplicate roles",
        parentId: 1,
        routeKey: "Roles",
        icon: "ShieldCheck",
        permissionCode: "roles:read",
        isExternal: false,
        isVisible: true,
        keepAlive: true,
      },
    });

    expectApiError(response, 409, "CONFLICT");
  });

  it("POST /menus/edit updates a menu by numeric body ID", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: 2,
        type: "menu",
        name: "Menu settings",
        parentId: 1,
        routeKey: "Menus",
        icon: "ShieldCheck",
        permissionCode: "menus:read",
        isExternal: false,
        isVisible: true,
        keepAlive: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toMatchObject({ id: 2, name: "Menu settings" });
    expect(state.menus.get(2)?.name).toBe("Menu settings");
  });

  it("POST /menus/edit requires menus.update", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: 1,
        type: "directory",
        name: "Access",
        parentId: null,
        icon: "ShieldCheck",
        isVisible: true,
      },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /menus/edit returns 404 for a numeric ID in another organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        id: 101,
        type: "menu",
        name: "Cross organization",
        parentId: null,
        routeKey: "Sessions",
        icon: "ShieldCheck",
        permissionCode: "sessions:read",
        isExternal: false,
        isVisible: true,
        keepAlive: true,
      },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("POST /menus/delete deletes a leaf by numeric body ID", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/delete",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toBeNull();
    expect(state.menus.has(5)).toBe(false);
  });

  it("POST /menus/delete requires menus.delete", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/delete",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 5 },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /menus/delete returns 409 for a non-leaf menu", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/delete",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 1 },
    });

    expectApiError(response, 409, "CONFLICT");
  });

  it("POST /menus/delete returns 404 for a numeric ID in another organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/delete",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 101 },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("POST /menus/edit-order moves a menu by numeric body ID", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const before = state.menus.get(8)?.sortOrder;
    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit-order",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 8, direction: "up" },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toBeNull();
    expect(state.menus.get(8)?.sortOrder).not.toBe(before);
  });

  it("POST /menus/edit-order requires menus.update", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "owner@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit-order",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 8, direction: "up" },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /menus/edit-order returns 409 at a sibling boundary", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit-order",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 1, direction: "up" },
    });

    expectApiError(response, 409, "CONFLICT");
  });

  it("POST /menus/edit-order returns 404 for a numeric ID in another organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/menus/edit-order",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { id: 101, direction: "up" },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });

  it("POST /organizations/menus/reset checks super-admin status in the service", async () => {
    const allMenuPermissions = [
      "menus:read",
      "menus:create",
      "menus:update",
      "menus:delete",
    ] as const;
    const { app, state } = await createHarness({ managerPermissions: allMenuPermissions });
    const { accessToken } = await login(app, "manager@example.com");

    expect(state.roles.get(testIds.managerRole)?.permissions).toEqual(allMenuPermissions);

    const response = await app.inject({
      method: "POST",
      url: "/api/organizations/menus/reset",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { organizationId: testIds.organization },
    });

    expectApiError(response, 403, "FORBIDDEN");
  });

  it("POST /organizations/menus/reset lets a super admin reset another organization", async () => {
    const { app, state } = await createHarness();
    const superMember = state.members.get(testIds.superMember);
    const superPermissions = superMember
      ? (state.roles.get(superMember.roleId)?.permissions ?? [])
      : [];
    const { accessToken } = await login(app, "super@example.com");

    expect(superPermissions.filter((permission) => permission.startsWith("menus:"))).toEqual([]);

    const response = await app.inject({
      method: "POST",
      url: "/api/organizations/menus/reset",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { organizationId: testIds.otherOrganization },
    });

    expect(response.statusCode).toBe(200);
    expect(expectOk(response)).toBeNull();
    expect(
      [...state.menus.values()].filter((menu) => menu.organizationId === testIds.otherOrganization)
        .length,
    ).toBeGreaterThan(1);
  });

  it("POST /organizations/menus/reset returns 404 for an unknown organization", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "super@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/organizations/menus/reset",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { organizationId: missingOrganizationId },
    });

    expectApiError(response, 404, "NOT_FOUND");
  });
});

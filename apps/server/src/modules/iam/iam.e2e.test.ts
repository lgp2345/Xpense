import { afterEach, describe, expect, it } from "vitest";

import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("IAM e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp();
    return harness;
  }

  it("GET /roles without permission returns 403", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "viewer@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/roles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("GET /roles with roles.read returns 200", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/roles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(parseJson(response)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: testIds.managerRole,
          key: "manager",
        }),
      ]),
    );
  });

  it("super_admin active member can access /roles without roles.read", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "super@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/roles",
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
      url: "/roles",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect([401, 403]).toContain(response.statusCode);
  });

  it("PATCH /members/:id writes audit log and ignores body.organizationId", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "PATCH",
      url: `/members/${testIds.viewerMember}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        organizationId: testIds.otherOrganization,
        roleId: testIds.managerRole,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(parseJson(response)).toMatchObject({
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
        }),
      ]),
    );
  });
});

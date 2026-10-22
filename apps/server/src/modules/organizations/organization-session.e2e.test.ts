import { afterEach, describe, expect, it } from "vitest";
import { TEST_CAPTCHA, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("organization session and account preference", () => {
  let harness: TestAppHarness;
  afterEach(async () => {
    await harness?.app.close();
  });
  async function setup() {
    harness = await createTestApp();
    return harness;
  }
  async function login(phone: string = TEST_PHONES.owner, password = "password") {
    return harness.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { ...TEST_CAPTCHA, phone, password, clientType: "app_ios" },
    });
  }
  async function current(accessToken: string) {
    return harness.app.inject({
      method: "GET",
      url: "/api/user",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }
  async function switchTo(accessToken: string, organizationId: string) {
    return harness.app.inject({
      method: "POST",
      url: "/api/user/current-organization",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { organizationId },
    });
  }
  function addSecondMembership() {
    harness.state.members.set("33333333-3333-4333-8333-333333333399", {
      id: "33333333-3333-4333-8333-333333333399",
      userId: testIds.ownerUser,
      organizationId: testIds.otherOrganization,
      roleId: "22222222-2222-4222-8222-222222222299",
      status: "active",
      joinedAt: new Date("2026-10-01"),
    });
  }

  it("shares the last successful target across devices without changing existing sessions", async () => {
    await setup();
    const first = (await login()).json().data;
    const second = (await login()).json().data;
    addSecondMembership();
    expect(
      (await current((await login()).json().data.accessToken)).json().data.organization.id,
    ).toBe(testIds.organization);
    const switched = await switchTo(first.accessToken, testIds.otherOrganization);
    expect(switched.statusCode).toBe(200);
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBe(
      testIds.otherOrganization,
    );
    expect((await current(first.accessToken)).statusCode).toBe(401);
    expect((await current(second.accessToken)).json().data.organization.id).toBe(
      testIds.organization,
    );
    expect((await current(switched.json().data.accessToken)).json().data.organization.id).toBe(
      testIds.otherOrganization,
    );
    expect(
      (await current((await login()).json().data.accessToken)).json().data.organization.id,
    ).toBe(testIds.otherOrganization);
    const refresh = await harness.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: second.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    expect((await current(refresh.json().data.accessToken)).json().data.organization.id).toBe(
      testIds.organization,
    );
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBe(
      testIds.otherOrganization,
    );
    expect(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { authorization: `Bearer ${refresh.json().data.accessToken}` },
        })
      ).statusCode,
    ).toBe(200);
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBe(
      testIds.otherOrganization,
    );
  });

  it.each([
    "membership",
    "organization",
  ])("falls back when the preferred %s is disabled", async (kind) => {
    await setup();
    const first = (await login()).json().data;
    addSecondMembership();
    expect((await switchTo(first.accessToken, testIds.otherOrganization)).statusCode).toBe(200);
    if (kind === "membership") {
      const member = [...harness.state.members.values()].find(
        (m) => m.userId === testIds.ownerUser && m.organizationId === testIds.otherOrganization,
      );
      if (!member) throw new Error("Missing membership fixture");
      harness.state.members.set(member.id, { ...member, status: "disabled" });
    } else {
      harness.state.organizations.set(testIds.otherOrganization, {
        id: testIds.otherOrganization,
        name: "Other",
        status: "disabled",
      });
    }
    expect(
      (await current((await login()).json().data.accessToken)).json().data.organization.id,
    ).toBe(testIds.organization);
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBe(
      testIds.organization,
    );
  });

  it("does not grant platform identity to a normal account without eligible organizations", async () => {
    await setup();
    harness.state.members.delete(testIds.ownerMember);
    const before = harness.state.sessions.size;
    expect((await login(TEST_PHONES.owner, "wrong")).statusCode).toBe(401);
    const result = await login();
    expect(result.statusCode).toBe(403);
    expect(result.json().message).toContain("没有可访问的组织");
    expect(harness.state.sessions.size).toBe(before);
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBeUndefined();
  });

  it("rejects unauthorized targets and forged identity input without changing the preference", async () => {
    await setup();
    const token = (await login()).json().data.accessToken;
    expect((await switchTo(token, testIds.otherOrganization)).statusCode).toBe(403);
    const forged = await harness.app.inject({
      method: "POST",
      url: "/api/user/current-organization",
      headers: { authorization: `Bearer ${token}` },
      payload: { organizationId: testIds.otherOrganization, isSuperAdmin: true },
    });
    expect(forged.statusCode).toBe(400);
    expect(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/platform",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(harness.state.users.get(testIds.ownerUser)?.lastOrganizationId).toBe(
      testIds.organization,
    );
    expect((await current(token)).statusCode).toBe(200);
  });

  it("enters and returns from a non-member organization, invalidates old targets and always logs in to platform", async () => {
    await setup();
    const token = (await login(TEST_PHONES.superNonMember)).json().data.accessToken;
    const entered = await switchTo(token, testIds.organization);
    expect(entered.statusCode).toBe(200);
    expect((await current(token)).statusCode).toBe(401);
    expect((await current(entered.json().data.accessToken)).json().data).toMatchObject({
      accessScope: "organization",
      role: null,
    });
    const returned = await harness.app.inject({
      method: "POST",
      url: "/api/auth/platform",
      headers: { authorization: `Bearer ${entered.json().data.accessToken}` },
    });
    expect(returned.statusCode).toBe(200);
    expect((await current(entered.json().data.accessToken)).statusCode).toBe(401);
    expect((await current(returned.json().data.accessToken)).json().data).toMatchObject({
      accessScope: "platform",
      organization: null,
    });
    const again = await switchTo(returned.json().data.accessToken, testIds.organization);
    expect(again.statusCode).toBe(200);
    expect(
      (await current((await login(TEST_PHONES.superNonMember)).json().data.accessToken)).json().data
        .accessScope,
    ).toBe("platform");
    expect(harness.state.users.get(testIds.superNonMemberUser)?.lastOrganizationId).toBeUndefined();
    expect(harness.state.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "organization.exited",
        actorUserId: testIds.superNonMemberUser,
        organizationId: testIds.organization,
      }),
    );
  });

  it("rejects entering a disabled organization even as a super admin", async () => {
    await setup();
    harness.state.organizations.set(testIds.otherOrganization, {
      id: testIds.otherOrganization,
      name: "Other",
      status: "disabled",
    });
    const token = (await login(TEST_PHONES.superNonMember)).json().data.accessToken;
    expect((await switchTo(token, testIds.otherOrganization)).statusCode).toBe(403);
    expect((await current(token)).json().data.accessScope).toBe("platform");
  });
});

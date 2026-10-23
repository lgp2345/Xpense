import { permissionKeys } from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";
import { login, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("owner member HTTP protection", () => {
  let h: TestAppHarness;
  afterEach(async () => {
    await h?.app.close();
  });
  async function setup(phone: string = TEST_PHONES.owner) {
    h = await createTestApp();
    const owner = h.state.roles.get(testIds.ownerRole);
    if (!owner) throw new Error("Missing owner role");
    h.state.roles.set(owner.id, { ...owner, isSystem: true, permissions: [...permissionKeys] });
    return (await login(h.app, phone)).accessToken;
  }
  async function update(token: string, payload: unknown) {
    return h.app.inject({
      method: "POST",
      url: "/api/members/update",
      headers: { authorization: `Bearer ${token}` },
      payload: payload as Record<string, unknown>,
    });
  }
  it.each([
    "self-promotion",
    "demotion",
    "disable",
    "create",
  ])("denies %s by a custom role holding every permission", async (operation) => {
    await setup();
    const role = h.state.roles.get(testIds.managerRole);
    if (!role) throw new Error("Missing role");
    h.state.roles.set(role.id, { ...role, key: "custom", permissions: [...permissionKeys] });
    const token = (await login(h.app, TEST_PHONES.manager)).accessToken;
    const response =
      operation === "create"
        ? await h.app.inject({
            method: "POST",
            url: "/api/members/create",
            headers: { authorization: `Bearer ${token}` },
            payload: {
              phone: "13800000005",
              username: "不修改原用户名",
              roleIds: [testIds.ownerRole],
            },
          })
        : await update(
            token,
            operation === "self-promotion"
              ? { id: testIds.managerMember, roleId: testIds.ownerRole }
              : operation === "demotion"
                ? { id: testIds.ownerMember, roleId: testIds.managerRole }
                : { id: testIds.ownerMember, status: "disabled" },
          );
    expect(response.statusCode).toBe(403);
    expect(h.state.members.get(testIds.ownerMember)?.roleId).toBe(testIds.ownerRole);
    expect(h.state.members.get(testIds.ownerMember)?.status).toBe("active");
  });
  it("keeps the last owner but allows a second owner followed by self-demotion", async () => {
    const token = await setup();
    expect((await update(token, { id: testIds.ownerMember, status: "disabled" })).statusCode).toBe(
      409,
    );
    expect(
      (await update(token, { id: testIds.viewerMember, roleId: testIds.ownerRole })).statusCode,
    ).toBe(200);
    expect(
      (await update(token, { id: testIds.ownerMember, roleId: testIds.managerRole })).statusCode,
    ).toBe(200);
    expect((await update(token, { id: testIds.viewerMember, status: "disabled" })).statusCode).toBe(
      401,
    );
    const newOwner = (await login(h.app, TEST_PHONES.viewer)).accessToken;
    expect(
      (await update(newOwner, { id: testIds.viewerMember, status: "disabled" })).statusCode,
    ).toBe(409);
  });
  it("protects the last owner from a platform super admin without counting the admin as an owner", async () => {
    const platform = await setup(TEST_PHONES.superNonMember);
    const entered = await h.app.inject({
      method: "POST",
      url: "/api/user/current-organization",
      headers: { authorization: `Bearer ${platform}` },
      payload: { organizationId: testIds.organization },
    });
    expect(entered.statusCode).toBe(200);
    expect(
      (
        await update(entered.json().data.accessToken, {
          id: testIds.ownerMember,
          status: "disabled",
        })
      ).statusCode,
    ).toBe(409);
  });
  it("blocks enabling an owner for an inactive account", async () => {
    const token = await setup();
    const member = h.state.members.get(testIds.viewerMember),
      user = h.state.users.get(testIds.viewerUser);
    if (!member || !user) throw new Error("Missing target fixture");
    h.state.members.set(member.id, { ...member, roleId: testIds.ownerRole, status: "disabled" });
    h.state.users.set(user.id, { ...user, status: "disabled" });
    expect((await update(token, { id: member.id, status: "active" })).statusCode).toBe(403);
  });
});

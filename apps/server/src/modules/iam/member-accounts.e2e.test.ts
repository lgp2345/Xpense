import { permissionKeys } from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";
import { login, TEST_CAPTCHA, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("member account and multiple role HTTP flow", () => {
  let harness: TestAppHarness;
  afterEach(async () => {
    await harness?.app.close();
  });
  async function setup() {
    harness = await createTestApp();
    const owner = harness.state.roles.get(testIds.ownerRole);
    if (!owner) throw new Error("Missing owner fixture");
    harness.state.roles.set(owner.id, {
      ...owner,
      isSystem: true,
      permissions: [...permissionKeys],
    });
    const { accessToken } = await login(harness.app, TEST_PHONES.owner);
    return { authorization: `Bearer ${accessToken}` };
  }
  const input = {
    phone: "13800000009",
    username: "同名成员",
    roleIds: [testIds.managerRole, testIds.viewerRole],
  };

  it("鉴权使用全部角色的权限并集，移除附加角色后旧会话失效并撤权", async () => {
    const headers = await setup();
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload: input,
    });
    expect(created.statusCode).toBe(200);
    const signIn = () =>
      harness.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { ...TEST_CAPTCHA, phone: input.phone, password: "888888", clientType: "web_pc" },
      });
    const signedIn = await signIn();
    const memberHeaders = { authorization: `Bearer ${signedIn.json().data.accessToken}` };
    const current = await harness.app.inject({
      method: "GET",
      url: "/api/user",
      headers: memberHeaders,
    });
    expect(current.json().data.permissions).toEqual(
      expect.arrayContaining(["members:create", "transactions:read"]),
    );
    const update = await harness.app.inject({
      method: "POST",
      url: "/api/members/update",
      headers,
      payload: { id: created.json().data.id, roleIds: [testIds.managerRole] },
    });
    expect(update.statusCode).toBe(200);
    expect(
      (await harness.app.inject({ method: "GET", url: "/api/user", headers: memberHeaders }))
        .statusCode,
    ).toBe(401);
    const fresh = await signIn();
    const changed = await harness.app.inject({
      method: "GET",
      url: "/api/user",
      headers: { authorization: `Bearer ${fresh.json().data.accessToken}` },
    });
    expect(changed.json().data.permissions).toContain("members:create");
    expect(changed.json().data.permissions).not.toContain("transactions:read");
  });

  it("角色只作为附加角色使用时仍禁止删除", async () => {
    const headers = await setup();
    const extraRoleId = "22222222-2222-4222-8222-222222222288";
    const viewer = harness.state.roles.get(testIds.viewerRole);
    if (!viewer) throw new Error("Missing viewer fixture");
    harness.state.roles.set(extraRoleId, { ...viewer, id: extraRoleId, key: "extra" });
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload: { ...input, roleIds: [testIds.managerRole, extraRoleId] },
    });
    expect(created.statusCode).toBe(200);
    const removed = await harness.app.inject({
      method: "POST",
      url: "/api/roles/delete",
      headers,
      payload: { id: extraRoleId },
    });
    expect(removed.statusCode).toBe(409);
    expect(harness.state.roles.has(extraRoleId)).toBe(true);
  });

  it("创建账号和多角色成员，允许另一个账号使用相同用户名", async () => {
    const headers = await setup();
    for (const phone of [input.phone, "13800000008"]) {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/members/create",
        headers,
        payload: { ...input, phone },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        username: "同名成员",
        phone,
        roles: [{ id: testIds.managerRole }, { id: testIds.viewerRole }],
      });
      const account = [...harness.state.users.values()].find((user) => user.phone === phone);
      expect(account).toMatchObject({ initialPasswordUnchanged: true });
      expect(account?.passwordHash).not.toBe("888888");
      const signedIn = await harness.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          ...TEST_CAPTCHA,
          phone,
          password: "888888",
          clientType: "web_pc",
        },
      });
      expect(signedIn.statusCode).toBe(200);
    }
  });
  it("候选查询只返回用户名和状态，关联时忽略新用户名并拒绝重复成员", async () => {
    const headers = await setup();
    const candidate = await harness.app.inject({
      method: "GET",
      url: `/api/members/accounts/list?phone=${TEST_PHONES.outsider}`,
      headers,
    });
    expect(candidate.statusCode).toBe(200);
    expect(candidate.json().data).toEqual({ username: "outsider", status: "active" });
    const payload = { ...input, phone: TEST_PHONES.outsider, username: "不应覆盖" };
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.username).toBe("outsider");
    expect(harness.state.users.get(testIds.outsiderUser)?.username).toBe("outsider");
    const duplicate = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload,
    });
    expect(duplicate.statusCode).toBe(409);
  });
  it("候选查询和新增成员均要求认证与对应权限", async () => {
    await setup();
    const viewer = await login(harness.app, TEST_PHONES.viewer);
    for (const authorization of [undefined, `Bearer ${viewer.accessToken}`]) {
      const headers = authorization ? { authorization } : {};
      const candidate = await harness.app.inject({
        method: "GET",
        url: `/api/members/accounts/list?phone=${input.phone}`,
        headers,
      });
      expect(candidate.statusCode).toBe(authorization ? 403 : 401);
      const create = await harness.app.inject({
        method: "POST",
        url: "/api/members/create",
        headers,
        payload: input,
      });
      expect(create.statusCode).toBe(authorization ? 403 : 401);
    }
  });
  it("拒绝无效输入和禁用账号，并在审计失败时回滚新账号与成员", async () => {
    const headers = await setup();
    for (const override of [
      { username: " " },
      { phone: "123" },
      { roleIds: [] },
      { roleIds: [testIds.managerRole, testIds.managerRole] },
    ]) {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/members/create",
        headers,
        payload: { ...input, ...override },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_FAILED");
    }
    const outsider = harness.state.users.get(testIds.outsiderUser);
    if (!outsider) throw new Error("Missing outsider fixture");
    harness.state.users.set(outsider.id, { ...outsider, status: "disabled" });
    const disabled = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload: { ...input, phone: TEST_PHONES.outsider },
    });
    expect(disabled.statusCode).toBe(403);
    const memberCount = harness.state.members.size;
    harness.state.failNextRequiredAuditAppend = true;
    const failed = await harness.app.inject({
      method: "POST",
      url: "/api/members/create",
      headers,
      payload: input,
    });
    expect(failed.statusCode).toBe(500);
    expect([...harness.state.users.values()].some((user) => user.phone === input.phone)).toBe(
      false,
    );
    expect(harness.state.members.size).toBe(memberCount);
  });
});

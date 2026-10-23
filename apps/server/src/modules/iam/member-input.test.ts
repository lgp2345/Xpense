import { describe, expect, it } from "vitest";
import { createMemberSchema } from "./dto/create-member.dto.js";
import { updateMemberSchema } from "./dto/update-member.dto.js";

const firstRole = "22222222-2222-4222-8222-222222222201";
const secondRole = "22222222-2222-4222-8222-222222222202";
const input = { phone: "13800000009", username: " 同名用户 ", roleIds: [firstRole, secondRole] };

describe("member input", () => {
  it("接受手机号、裁剪后的用户名和多个角色", () => {
    expect(createMemberSchema.parse(input)).toEqual({ ...input, username: "同名用户" });
  });
  it.each(["active", "disabled"])("接受成员状态 %s", (status) => {
    expect(createMemberSchema.parse({ ...input, status }).status).toBe(status);
  });
  it.each([
    { status: "unknown" },
    { username: " " },
    { phone: "123" },
    { roleIds: [] },
    { roleIds: [firstRole, firstRole] },
  ])("拒绝无效账号资料或角色集合 %j", (override) => {
    expect(createMemberSchema.safeParse({ ...input, ...override }).success).toBe(false);
  });
  it("更新支持完整角色集合，拒绝同时传入两种角色协议", () => {
    const id = "33333333-3333-4333-8333-333333333301";
    expect(updateMemberSchema.safeParse({ id, roleIds: [firstRole, secondRole] }).success).toBe(
      true,
    );
    expect(
      updateMemberSchema.safeParse({ id, roleId: firstRole, roleIds: [secondRole] }).success,
    ).toBe(false);
  });
});

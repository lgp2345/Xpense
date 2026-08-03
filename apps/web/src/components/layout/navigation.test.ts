import { describe, expect, it } from "vitest";

import { getNavigationGroups } from "./navigation";

describe("getNavigationGroups", () => {
  it("只公开当前用户拥有读取权限的管理入口", () => {
    expect(getNavigationGroups({ permissions: ["members.read"], isSuperAdmin: false })).toEqual([
      expect.objectContaining({ title: "概览" }),
      expect.objectContaining({
        title: "访问控制",
        items: [expect.objectContaining({ title: "成员", to: "/members" })],
      }),
    ]);
  });
});

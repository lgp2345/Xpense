import { describe, expect, it } from "vitest";
import { memberFormSchema } from "./member-form-schema";

describe("memberFormSchema", () => {
  it("rejects repeated role ids even when the selection is non-empty", () => {
    const input = {
      phone: "13800000001",
      username: "lin",
      status: "active",
      roleIds: ["role-member", "role-member"],
    };
    const result = memberFormSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain("角色不能重复选择");
    }
  });
});

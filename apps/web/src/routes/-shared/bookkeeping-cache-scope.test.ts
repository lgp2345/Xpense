import { describe, expect, it } from "vitest";

import { type AuthStatus, createAuthStore } from "../../stores/auth-store";
import { didBookkeepingScopeChange } from "./bookkeeping-cache-scope";

/** 构造只改变缓存隔离字段的真实认证 store 状态。 */
function authState(status: AuthStatus, organizationId: string | null) {
  return createAuthStore({
    currentOrganization: organizationId ? { id: organizationId, name: organizationId } : null,
    status,
  }).getState();
}

describe("didBookkeepingScopeChange", () => {
  it("仅在认证状态或当前组织变化时跨越财务缓存边界", () => {
    expect(
      didBookkeepingScopeChange(
        authState("authenticated", "org-a"),
        authState("authenticated", "org-a"),
      ),
    ).toBe(false);
    expect(
      didBookkeepingScopeChange(
        authState("authenticated", "org-b"),
        authState("authenticated", "org-a"),
      ),
    ).toBe(true);
    expect(
      didBookkeepingScopeChange(authState("anonymous", null), authState("authenticated", "org-a")),
    ).toBe(true);
  });
});

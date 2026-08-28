import { describe, expect, it } from "vitest";

import { type AuthStatus, createAuthStore } from "../stores/auth-store";
import { didRentalScopeChange } from "./rental-cache-scope";

function authState(status: AuthStatus, organizationId: string | null) {
  return createAuthStore({
    currentOrganization: organizationId ? { id: organizationId, name: organizationId } : null,
    status,
  }).getState();
}

describe("didRentalScopeChange", () => {
  it("crosses the rental cache boundary only on authentication or organization changes", () => {
    expect(
      didRentalScopeChange(
        authState("authenticated", "org-a"),
        authState("authenticated", "org-a"),
      ),
    ).toBe(false);
    expect(
      didRentalScopeChange(
        authState("authenticated", "org-b"),
        authState("authenticated", "org-a"),
      ),
    ).toBe(true);
    expect(
      didRentalScopeChange(authState("anonymous", null), authState("authenticated", "org-a")),
    ).toBe(true);
  });
});

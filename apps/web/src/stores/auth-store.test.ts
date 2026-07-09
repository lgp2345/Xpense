import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "./auth-store";

const currentUserContext: CurrentUserResponse = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: {
    id: "org-1",
    name: "Acme",
  },
  role: {
    id: "role-1",
    key: "owner",
    name: "Owner",
  },
  permissions: ["roles.read", "members.update"],
  session: {
    id: "session-1",
    clientType: "web_pc",
  },
};

describe("createAuthStore", () => {
  it("stores access token and current user context", () => {
    const store = createAuthStore();

    store.getState().setAccessToken("access-token");
    store.getState().setCurrentUserContext(currentUserContext);

    expect(store.getState()).toMatchObject({
      accessToken: "access-token",
      status: "authenticated",
      currentUser: currentUserContext.user,
      currentOrganization: currentUserContext.organization,
      role: currentUserContext.role,
      permissions: currentUserContext.permissions,
      session: currentUserContext.session,
    });
  });

  it("clears auth state", () => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: currentUserContext.user,
      currentOrganization: currentUserContext.organization,
      role: currentUserContext.role,
      permissions: currentUserContext.permissions,
      session: currentUserContext.session,
      status: "authenticated",
    });

    store.getState().clearAuth();

    expect(store.getState()).toMatchObject({
      accessToken: null,
      status: "anonymous",
      currentUser: null,
      currentOrganization: null,
      role: null,
      permissions: [],
      session: null,
    });
  });

  it("notifies subscribers when auth state changes", () => {
    const store = createAuthStore();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.getState().setAccessToken("access-token");
    unsubscribe();
    store.getState().setAccessToken("next-token");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token" }),
      expect.objectContaining({ accessToken: null }),
    );
  });
});

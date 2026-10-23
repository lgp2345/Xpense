import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import {
  changeOwnPassword,
  createWebSession,
  loginWebSession,
  logoutWebSession,
  restoreWebSession,
  switchWebOrganization,
} from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

const context = {
  accessScope: "platform" as const,
  user: {
    id: "u",
    phone: null,
    email: null,
    isSuperAdmin: true,
    status: "active" as const,
    initialPasswordUnchanged: true,
  },
  organization: null,
  role: null,
  permissions: [],
  session: { id: "credential-session", clientType: "web_pc" as const },
};
const input = {
  phone: "13800000001",
  password: "custom-initial",
  captchaId: "id",
  captchaText: "text",
};
function api() {
  return {
    login: vi.fn().mockResolvedValue({ accessToken: "new-token" }),
    getCurrentUser: vi.fn().mockImplementation(async () => ({
      ...context,
      session: { ...context.session, id: crypto.randomUUID() },
    })),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ accessToken: "refresh-token" }),
    switchOrganization: vi.fn().mockResolvedValue({ accessToken: "switch-token" }),
    listOrganizations: vi.fn().mockResolvedValue([]),
  };
}
function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => vi.restoreAllMocks());
describe("credential login notification boundary", () => {
  it("only notifies for successful credentials, including a custom initial password", async () => {
    const warning = vi.spyOn(toast, "warning");
    const store = createAuthStore();
    const auth = api();
    const navigate = vi.fn();
    await loginWebSession(auth, store, input, undefined, navigate);
    expect(warning).toHaveBeenCalledOnce();
    await restoreWebSession(auth, store);
    await switchWebOrganization(auth, store, "org");
    expect(warning).toHaveBeenCalledOnce();
    await logoutWebSession(auth, store);
    await loginWebSession(auth, store, input, undefined, navigate);
    expect(warning).toHaveBeenCalledTimes(2);
  });
  it("ignores delayed login after logout without reviving state or notifying", async () => {
    const warning = vi.spyOn(toast, "warning");
    const wait = deferred<{ accessToken: string }>();
    const auth = api();
    auth.login.mockReturnValue(wait.promise);
    const store = createAuthStore();
    const login = loginWebSession(auth, store, input, undefined, vi.fn());
    await logoutWebSession(auth, store);
    wait.resolve({ accessToken: "stale-token" });
    await login;
    expect(store.getState().status).toBe("anonymous");
    expect(store.getState().accessToken).toBeNull();
    expect(warning).not.toHaveBeenCalled();
  });
  it("does not notify failed identity initialization", async () => {
    const warning = vi.spyOn(toast, "warning");
    const auth = api();
    auth.getCurrentUser.mockRejectedValue(Error("offline"));
    await expect(
      loginWebSession(auth, createAuthStore(), input, undefined, vi.fn()),
    ).rejects.toThrow();
    expect(warning).not.toHaveBeenCalled();
  });
});

describe("password session coordination", () => {
  it("does not let a delayed password response revive a logged-out account", async () => {
    const store = createAuthStore({ status: "authenticated", accessToken: "old-token" });
    const session = createWebSession({ authStore: store });
    const pending = deferred<{ accessToken: string }>();
    Object.assign(session.authApi, {
      changePassword: vi.fn().mockReturnValue(pending.promise),
      logout: vi.fn().mockResolvedValue(undefined),
      getCurrentUser: vi.fn().mockResolvedValue(context),
    });
    const change = changeOwnPassword(session, {
      currentPassword: "old-password",
      newPassword: "new-password",
    });
    await logoutWebSession(session.authApi, store);
    pending.resolve({ accessToken: "delayed-token" });
    await change;
    expect(store.getState().status).toBe("anonymous");
    expect(session.authApi.getCurrentUser).not.toHaveBeenCalled();
  });
});

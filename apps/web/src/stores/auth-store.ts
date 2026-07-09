import type { CurrentUserResponse, PermissionKey } from "@xpense/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

export type AuthStatus = "anonymous" | "authenticated";

export type AuthStoreState = {
  accessToken: string | null;
  currentUser: CurrentUserResponse["user"] | null;
  currentOrganization: CurrentUserResponse["organization"] | null;
  role: CurrentUserResponse["role"] | null;
  permissions: PermissionKey[];
  session: CurrentUserResponse["session"] | null;
  status: AuthStatus;
};

export type AuthStoreActions = {
  setAccessToken: (accessToken: string | null) => void;
  setCurrentUserContext: (context: CurrentUserResponse) => void;
  clearAuth: () => void;
};

export type AuthStore = AuthStoreState & AuthStoreActions;
export type AuthStoreApi = StoreApi<AuthStore>;

const anonymousState: AuthStoreState = {
  accessToken: null,
  currentUser: null,
  currentOrganization: null,
  role: null,
  permissions: [],
  session: null,
  status: "anonymous",
};

export function createAuthStore(initialState: Partial<AuthStoreState> = {}): AuthStoreApi {
  const resolvedInitialState = {
    ...anonymousState,
    ...initialState,
  };

  return createStore<AuthStore>()((set) => ({
    ...resolvedInitialState,
    setAccessToken: (accessToken) => set({ accessToken }),
    setCurrentUserContext: (context) =>
      set({
        currentUser: context.user,
        currentOrganization: context.organization,
        role: context.role,
        permissions: context.permissions,
        session: context.session,
        status: "authenticated",
      }),
    clearAuth: () => set({ ...anonymousState }),
  }));
}

export const authStore = createAuthStore();

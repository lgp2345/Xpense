import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";

import { API_BASE_URL } from "../lib/env";
import { type AuthStoreApi, authStore } from "../stores/auth-store";
import { ApiError, createApiClient } from "./api-client";
import { createAuthApi, type LoginRequest } from "./auth-api";

export type SessionAuthApi = {
  getCurrentUser: () => Promise<CurrentUserResponse>;
  login: (input: LoginRequest) => Promise<AuthTokensResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthTokensResponse>;
};

export type WebLoginFailureKind = "invalid_credentials" | "service_unavailable";

export class WebLoginError extends Error {
  constructor(
    readonly kind: WebLoginFailureKind,
    cause: unknown,
  ) {
    super(kind, { cause });
    this.name = "WebLoginError";
  }
}

type WebLoginInput = Pick<LoginRequest, "email" | "password">;

export async function restoreWebSession(
  api: SessionAuthApi,
  store: AuthStoreApi,
): Promise<boolean> {
  try {
    const { accessToken } = await api.refresh();
    store.getState().setAccessToken(accessToken);
    const currentUser = await api.getCurrentUser();
    store.getState().setCurrentUserContext(currentUser);

    return true;
  } catch {
    store.getState().clearAuth();

    return false;
  }
}

export async function loginWebSession(
  api: SessionAuthApi,
  store: AuthStoreApi,
  input: WebLoginInput,
): Promise<void> {
  let didCreateSession = false;

  try {
    const { accessToken } = await api.login({ ...input, clientType: "web_pc" });
    didCreateSession = true;
    store.getState().setAccessToken(accessToken);
    const currentUser = await api.getCurrentUser();
    store.getState().setCurrentUserContext(currentUser);
  } catch (error) {
    if (didCreateSession) {
      await api.logout().catch(() => undefined);
    }

    store.getState().clearAuth();
    throw new WebLoginError(getLoginFailureKind(error, didCreateSession), error);
  }
}

function getLoginFailureKind(error: unknown, didCreateSession: boolean): WebLoginFailureKind {
  if (!didCreateSession && error instanceof ApiError && error.status === 401) {
    return "invalid_credentials";
  }

  return "service_unavailable";
}

const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => authStore.getState().accessToken,
  onAuthFailure: () => authStore.getState().clearAuth(),
});

export const webAuthApi = createAuthApi(apiClient);

export function restoreCurrentWebSession(): Promise<boolean> {
  return restoreWebSession(webAuthApi, authStore);
}

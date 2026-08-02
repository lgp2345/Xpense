import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";

import { API_BASE_URL } from "../lib/env";
import { type AuthStoreApi, authStore } from "../stores/auth-store";
import { ApiError, createApiClient } from "./api-client";
import { type AuthApi, createAuthApi, type LoginRequest, type UserOrganization } from "./auth-api";
import { createIamApi, type IamApi } from "./iam-api";

export type SessionAuthApi = {
  getCurrentUser: () => Promise<CurrentUserResponse>;
  login: (input: LoginRequest) => Promise<AuthTokensResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthTokensResponse>;
};

export type WebOrganizationAuthApi = {
  getCurrentUser: () => Promise<CurrentUserResponse>;
  listOrganizations: () => Promise<UserOrganization[]>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<AuthTokensResponse>;
};

export type WebSessionDependency = {
  authApi: AuthApi;
  authStore: AuthStoreApi;
  iamApi: IamApi;
  restoreSession: () => Promise<boolean>;
};

type CreateWebSessionOptions = {
  authStore: AuthStoreApi;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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

export class WebOrganizationSwitchError extends Error {
  constructor(cause: unknown) {
    super("Unable to switch organization", { cause });
    this.name = "WebOrganizationSwitchError";
  }
}

type WebLoginInput = Pick<LoginRequest, "email" | "password">;

type SwitchOperation = {
  id: symbol;
  promise: Promise<void>;
};

type SessionMutationCoordinator = {
  activeSwitch?: SwitchOperation;
};

const sessionMutationCoordinators = new WeakMap<AuthStoreApi, SessionMutationCoordinator>();

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

export function switchWebOrganization(
  api: WebOrganizationAuthApi,
  store: AuthStoreApi,
  organizationId: string,
): Promise<void> {
  const coordinator = getSessionMutationCoordinator(store);

  if (coordinator.activeSwitch) {
    return coordinator.activeSwitch.promise;
  }

  const operationId = Symbol("switch-organization");
  const startingAccessToken = store.getState().accessToken;
  const promise = performOrganizationSwitch(
    api,
    store,
    coordinator,
    operationId,
    startingAccessToken,
    organizationId,
  ).finally(() => {
    if (coordinator.activeSwitch?.id === operationId) {
      coordinator.activeSwitch = undefined;
    }
  });

  coordinator.activeSwitch = { id: operationId, promise };

  return promise;
}

async function performOrganizationSwitch(
  api: WebOrganizationAuthApi,
  store: AuthStoreApi,
  coordinator: SessionMutationCoordinator,
  operationId: symbol,
  startingAccessToken: string | null,
  organizationId: string,
): Promise<void> {
  let accessToken: string;

  try {
    ({ accessToken } = await api.switchOrganization(organizationId));
  } catch (error) {
    if (!isCurrentSwitch(coordinator, operationId)) {
      return;
    }

    throw new WebOrganizationSwitchError(error);
  }

  if (
    !isCurrentSwitch(coordinator, operationId) ||
    store.getState().accessToken !== startingAccessToken
  ) {
    return;
  }

  store.getState().setAccessToken(accessToken);

  try {
    const currentUser = await api.getCurrentUser();

    if (
      !isCurrentSwitch(coordinator, operationId) ||
      store.getState().accessToken !== accessToken
    ) {
      return;
    }

    store.getState().setCurrentUserContext(currentUser);
  } catch (error) {
    if (!isCurrentSwitch(coordinator, operationId)) {
      return;
    }

    if (store.getState().accessToken === accessToken) {
      store.getState().clearAuth();
    }

    throw new WebOrganizationSwitchError(error);
  }
}

export async function logoutWebSession(
  api: Pick<SessionAuthApi, "logout">,
  store: AuthStoreApi,
): Promise<void> {
  invalidateOrganizationSwitch(store);

  let logoutRequest: Promise<void>;

  try {
    logoutRequest = api.logout();
  } catch (error) {
    store.getState().clearAuth();
    throw error;
  }

  store.getState().clearAuth();
  await logoutRequest;
}

function getSessionMutationCoordinator(store: AuthStoreApi): SessionMutationCoordinator {
  let coordinator = sessionMutationCoordinators.get(store);

  if (!coordinator) {
    coordinator = {};
    sessionMutationCoordinators.set(store, coordinator);
  }

  return coordinator;
}

function isCurrentSwitch(coordinator: SessionMutationCoordinator, operationId: symbol): boolean {
  return coordinator.activeSwitch?.id === operationId;
}

function invalidateOrganizationSwitch(store: AuthStoreApi): void {
  getSessionMutationCoordinator(store).activeSwitch = undefined;
}

function getLoginFailureKind(error: unknown, didCreateSession: boolean): WebLoginFailureKind {
  if (!didCreateSession && error instanceof ApiError && error.status === 401) {
    return "invalid_credentials";
  }

  return "service_unavailable";
}

export function createWebSession(options: CreateWebSessionOptions): WebSessionDependency {
  const apiClient = createApiClient({
    baseUrl: options.baseUrl,
    getAccessToken: () => options.authStore.getState().accessToken,
    fetchImpl: options.fetchImpl,
    onAuthFailure: (_error, requestAccessToken) => {
      if (options.authStore.getState().accessToken === requestAccessToken) {
        options.authStore.getState().clearAuth();
      }
    },
    refreshAccessToken: async (requestAccessToken) => {
      const { accessToken } = await apiClient.post<AuthTokensResponse>("/auth/refresh", undefined, {
        authFailure: "ignore",
        authRefresh: "ignore",
      });

      if (options.authStore.getState().accessToken !== requestAccessToken) {
        return null;
      }

      options.authStore.getState().setAccessToken(accessToken);

      return accessToken;
    },
  });
  const authApi = createAuthApi(apiClient);
  const iamApi = createIamApi(apiClient);

  return {
    authApi,
    authStore: options.authStore,
    iamApi,
    restoreSession: () => restoreWebSession(authApi, options.authStore),
  };
}

export const webSession = createWebSession({ authStore, baseUrl: API_BASE_URL });
export const webAuthApi = webSession.authApi;
export const webIamApi = webSession.iamApi;

export function restoreCurrentWebSession(): Promise<boolean> {
  return webSession.restoreSession();
}

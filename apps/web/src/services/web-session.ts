import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";
import type { AxiosInstance } from "axios";

import { API_BASE_URL } from "../lib/env";
import { type AuthStoreApi, authStore } from "../stores/auth-store";
import {
  createMenuStore,
  menuStore as defaultMenuStore,
  type MenuStoreApi,
} from "../stores/menu-store";
import { ApiError, createApiClient } from "./api-client";
import { type AuthApi, createAuthApi, type LoginRequest, type UserOrganization } from "./auth-api";
import { type BookkeepingApi, createBookkeepingApi } from "./bookkeeping-api";
import { createIamApi, type IamApi } from "./iam-api";
import { createRentalApi, type RentalApi } from "./rental-api";

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
  bookkeepingApi: BookkeepingApi;
  iamApi: IamApi;
  menuStore: MenuStoreApi;
  rentalApi: RentalApi;
  restoreSession: () => Promise<boolean>;
};

type CreateWebSessionOptions = {
  authStore: AuthStoreApi;
  baseUrl?: string;
  instance?: AxiosInstance;
  menuStore?: MenuStoreApi;
};

export type MenuBootstrapDependency = {
  iamApi: Pick<IamApi, "getAuthorizedMenus">;
  menuStore: MenuStoreApi;
};

export type WebLoginFailureKind = "invalid_credentials" | "rate_limited" | "service_unavailable";

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

type WebLoginInput = Pick<LoginRequest, "phone" | "password" | "captchaId" | "captchaText">;

type SwitchOperation = {
  id: symbol;
  promise: Promise<void>;
};

type SessionMutationCoordinator = {
  activeSwitch?: SwitchOperation;
  observesAuthContext?: boolean;
  menuBootstrap?: MenuBootstrapDependency;
};

const sessionMutationCoordinators = new WeakMap<AuthStoreApi, SessionMutationCoordinator>();

export async function restoreWebSession(
  api: SessionAuthApi,
  store: AuthStoreApi,
  menuBootstrap?: MenuBootstrapDependency,
): Promise<boolean> {
  invalidateOrganizationSwitch(store);
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  try {
    const { accessToken } = await api.refresh();
    store.getState().setAccessToken(accessToken);
    const currentUser = await api.getCurrentUser();
    store.getState().setCurrentUserContext(currentUser);
    await loadOrganizationMenus(menus, currentUser.organization.id);

    return true;
  } catch {
    store.getState().clearAuth();
    menus?.menuStore.getState().clearMenus();

    return false;
  }
}

export async function loginWebSession(
  api: SessionAuthApi,
  store: AuthStoreApi,
  input: WebLoginInput,
  menuBootstrap?: MenuBootstrapDependency,
): Promise<void> {
  invalidateOrganizationSwitch(store);
  let didCreateSession = false;
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  try {
    const { accessToken } = await api.login({ ...input, clientType: "web_pc" });
    didCreateSession = true;
    store.getState().setAccessToken(accessToken);
    const currentUser = await api.getCurrentUser();
    store.getState().setCurrentUserContext(currentUser);
    await loadOrganizationMenus(menus, currentUser.organization.id);
  } catch (error) {
    if (didCreateSession) {
      await api.logout().catch(() => undefined);
    }

    store.getState().clearAuth();
    menus?.menuStore.getState().clearMenus();
    throw new WebLoginError(getLoginFailureKind(error, didCreateSession), error);
  }
}

export function switchWebOrganization(
  api: WebOrganizationAuthApi,
  store: AuthStoreApi,
  organizationId: string,
  menuBootstrap?: MenuBootstrapDependency,
): Promise<void> {
  const coordinator = getSessionMutationCoordinator(store);

  if (coordinator.activeSwitch) {
    return coordinator.activeSwitch.promise;
  }

  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  const operationId = Symbol("switch-organization");
  const startingAccessToken = store.getState().accessToken;
  const startingOrganizationId = store.getState().currentOrganization?.id ?? null;
  const promise = performOrganizationSwitch(
    api,
    store,
    coordinator,
    operationId,
    startingAccessToken,
    startingOrganizationId,
    organizationId,
    menus,
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
  startingOrganizationId: string | null,
  organizationId: string,
  menuBootstrap: MenuBootstrapDependency | undefined,
): Promise<void> {
  let accessToken: string;

  try {
    ({ accessToken } = await api.switchOrganization(organizationId));
  } catch (error) {
    if (
      !isCurrentSwitch(coordinator, operationId) ||
      store.getState().accessToken !== startingAccessToken
    ) {
      return;
    }

    await loadOrganizationMenus(menuBootstrap, startingOrganizationId);
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
    await loadOrganizationMenus(menuBootstrap, currentUser.organization.id);
  } catch (error) {
    if (!isCurrentSwitch(coordinator, operationId)) {
      return;
    }

    if (store.getState().accessToken === accessToken) {
      store.getState().clearAuth();
      menuBootstrap?.menuStore.getState().clearMenus();
    }

    throw new WebOrganizationSwitchError(error);
  }
}

export async function logoutWebSession(
  api: Pick<SessionAuthApi, "logout">,
  store: AuthStoreApi,
  menuBootstrap?: MenuBootstrapDependency,
): Promise<void> {
  invalidateOrganizationSwitch(store);
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

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

function resolveMenuBootstrap(
  store: AuthStoreApi,
  menuBootstrap?: MenuBootstrapDependency,
): MenuBootstrapDependency | undefined {
  return menuBootstrap ?? getSessionMutationCoordinator(store).menuBootstrap;
}

function loadOrganizationMenus(
  menuBootstrap: MenuBootstrapDependency | undefined,
  organizationId: string | null,
): Promise<void> {
  if (!menuBootstrap || !organizationId) {
    return Promise.resolve();
  }

  return menuBootstrap.menuStore
    .getState()
    .loadMenusForOrganization(organizationId, menuBootstrap.iamApi.getAuthorizedMenus);
}

function bindMenuBootstrap(store: AuthStoreApi, menuBootstrap: MenuBootstrapDependency): void {
  const coordinator = getSessionMutationCoordinator(store);
  coordinator.menuBootstrap = menuBootstrap;

  if (!coordinator.observesAuthContext) {
    coordinator.observesAuthContext = true;
    store.subscribe((state, previousState) => {
      const activeMenus = coordinator.menuBootstrap;

      if (!activeMenus) {
        return;
      }
      if (state.status !== "authenticated") {
        activeMenus.menuStore.getState().clearMenus();
        return;
      }

      const organizationId = state.currentOrganization?.id ?? null;
      const previousOrganizationId = previousState.currentOrganization?.id ?? null;

      if (
        organizationId &&
        (previousState.status !== "authenticated" || organizationId !== previousOrganizationId)
      ) {
        void loadOrganizationMenus(activeMenus, organizationId);
      }
    });
  }

  if (store.getState().status === "authenticated") {
    void loadOrganizationMenus(menuBootstrap, store.getState().currentOrganization?.id ?? null);
  }
}

function isCurrentSwitch(coordinator: SessionMutationCoordinator, operationId: symbol): boolean {
  return coordinator.activeSwitch?.id === operationId;
}

function invalidateOrganizationSwitch(store: AuthStoreApi): void {
  getSessionMutationCoordinator(store).activeSwitch = undefined;
}

function getLoginFailureKind(error: unknown, didCreateSession: boolean): WebLoginFailureKind {
  if (!didCreateSession && error instanceof ApiError) {
    if (error.status === 401) {
      return "invalid_credentials";
    }

    if (error.status === 429) {
      return "rate_limited";
    }
  }

  return "service_unavailable";
}

export function createWebSession(options: CreateWebSessionOptions): WebSessionDependency {
  const sessionMenuStore = options.menuStore ?? createMenuStore();
  const apiClient = createApiClient({
    baseUrl: options.baseUrl,
    getAccessToken: () => options.authStore.getState().accessToken,
    instance: options.instance,
    onAuthFailure: (_error, requestAccessToken) => {
      if (options.authStore.getState().accessToken === requestAccessToken) {
        options.authStore.getState().clearAuth();
        sessionMenuStore.getState().clearMenus();
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
  const bookkeepingApi = createBookkeepingApi(apiClient);
  const iamApi = createIamApi(apiClient);
  const rentalApi = createRentalApi(apiClient);
  const menuBootstrap = { iamApi, menuStore: sessionMenuStore };
  bindMenuBootstrap(options.authStore, menuBootstrap);

  return {
    authApi,
    authStore: options.authStore,
    bookkeepingApi,
    iamApi,
    menuStore: sessionMenuStore,
    rentalApi,
    restoreSession: () => restoreWebSession(authApi, options.authStore, menuBootstrap),
  };
}

export const webSession = createWebSession({
  authStore,
  baseUrl: API_BASE_URL,
  menuStore: defaultMenuStore,
});
export const webAuthApi = webSession.authApi;
export const webBookkeepingApi = webSession.bookkeepingApi;
export const webIamApi = webSession.iamApi;
export const webRentalApi = webSession.rentalApi;

export function restoreCurrentWebSession(): Promise<boolean> {
  return webSession.restoreSession();
}

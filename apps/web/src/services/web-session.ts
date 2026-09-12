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

/** 登录与恢复流程需要的接口边界，允许测试注入不依赖真实网络的实现。 */
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

/** 同一 WEB 会话的领域 API、认证状态和菜单状态，供页面与路由统一使用。 */
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

/** 将登录失败归类供界面选择文案，原始错误保存在 cause 中。 */
export class WebLoginError extends Error {
  constructor(
    readonly kind: WebLoginFailureKind,
    cause: unknown,
  ) {
    super(kind, { cause });
    this.name = "WebLoginError";
  }
}

/** 组织切换流程失败；具体状态清理由流程按失败阶段处理。 */
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

/** 按 store 隔离切换任务与菜单绑定；弱引用避免仅因协调记录阻止 store 回收。 */
const sessionMutationCoordinators = new WeakMap<AuthStoreApi, SessionMutationCoordinator>();

/**
 * 启动时通过刷新 Cookie 恢复内存中的访问令牌，再获取用户上下文与组织菜单。
 * 菜单请求失败由 menuStore 记录为 error，不单独使恢复的认证失效。
 *
 * @param api 绑定当前会话的认证接口，refresh 不传请求体以使用 WEB 刷新 Cookie。
 * @param store 接收令牌及用户、组织、角色、权限上下文的认证状态。
 * @param menuBootstrap 可显式注入菜单依赖，省略时使用当前 store 已绑定的依赖。
 * @returns 认证恢复成功返回 true；刷新或用户上下文获取失败时清理状态并返回 false。
 */
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

/**
 * 以 web_pc 登录，依次保存令牌、加载用户上下文并初始化组织菜单。
 * 若服务端已创建会话但后续认证初始化失败，则尝试远端退出并清理本地状态。
 * 菜单加载失败由 menuStore 独立记录，不回滚已建立的认证。
 *
 * @param api 认证接口，负责实际网络请求。
 * @param store 当前会话的认证状态。
 * @param input 手机号、密码及验证码；客户端类型由此流程固定。
 * @param menuBootstrap 菜单依赖，默认使用当前 store 的绑定。
 * @throws {WebLoginError} 登录或用户上下文获取失败，kind 供界面映射错误文案。
 */
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

/**
 * 协调组织切换，使新令牌、用户权限上下文与组织菜单按顺序更新。
 * 同一 store 有切换在途时直接复用其 Promise，即使新调用传入了不同目标组织。
 *
 * @param api 组织切换及当前用户接口。
 * @param store 需要切换组织的认证状态。
 * @param organizationId 本次目标组织；不会排队执行后续重叠调用的目标。
 * @param menuBootstrap 菜单依赖，默认使用当前 store 的绑定。
 * @returns 切换完成或任务失效后结束的 Promise；正常结束不保证失效任务已切换成功。
 * @throws {WebOrganizationSwitchError} 仍有效的切换流程失败。
 */
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

/**
 * 执行切换并在异步返回后核对操作标识与令牌，防止旧结果覆盖新会话。
 * 切换接口失败时保留原认证并重载旧菜单；新令牌已采用而用户加载失败时，
 * 仅在该令牌仍是当前令牌时清理本地认证，避免令牌与权限上下文不一致。
 */
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

/**
 * 先使在途组织切换失效并清理菜单，再用当前令牌发起远端退出。
 * 请求发起后立即清理本地认证，不等待网络响应；远端失败仍会向调用方抛出。
 *
 * @param api 提供远端退出能力的认证接口。
 * @param store 要退出的认证状态。
 * @param menuBootstrap 菜单依赖，默认使用当前 store 的绑定。
 */
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

/** 显式菜单依赖优先，否则复用 createWebSession 为此 store 注册的绑定。 */
function resolveMenuBootstrap(
  store: AuthStoreApi,
  menuBootstrap?: MenuBootstrapDependency,
): MenuBootstrapDependency | undefined {
  return menuBootstrap ?? getSessionMutationCoordinator(store).menuBootstrap;
}

/** 委托 menuStore 加载菜单，由其负责同组织在途请求去重、过期结果隔离与错误状态。 */
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

/**
 * 每个 store 只注册一次认证订阅，后续绑定更新订阅读取的菜单依赖。
 * 登录或组织变化时触发菜单加载，匿名时清空菜单；已有登录态也会补充初始化。
 */
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

/** 使旧切换结果失效；这里只撤销本地任务标识，不取消已发出的 HTTP 请求。 */
function invalidateOrganizationSwitch(store: AuthStoreApi): void {
  getSessionMutationCoordinator(store).activeSwitch = undefined;
}

/** 只有尚未创建会话的 401/429 归为凭据或限流错误，后续初始化失败归为服务不可用。 */
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

/**
 * 组装 WEB 会话：让各领域 API 共用请求客户端，并绑定认证状态与组织菜单。
 *
 * 请求层负责何时刷新与重放；此处注入如何使用 WEB Cookie 刷新、保存令牌和清理状态。
 * 清理或写入前核对请求令牌，避免延迟的旧 401 或刷新结果影响新的登录、组织上下文。
 * 创建时会绑定菜单订阅；如果传入的 store 已登录，还会触发菜单初始化。
 *
 * @param options 认证 store、基础地址及可选的请求实例和菜单 store。
 * @returns 共用当前认证来源的领域 API、状态容器和会话恢复入口。
 */
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

/** 应用默认会话；测试或独立上下文可通过 createWebSession 注入自己的依赖。 */
export const webSession = createWebSession({
  authStore,
  baseUrl: API_BASE_URL,
  menuStore: defaultMenuStore,
});
export const webAuthApi = webSession.authApi;
export const webBookkeepingApi = webSession.bookkeepingApi;
export const webIamApi = webSession.iamApi;
export const webRentalApi = webSession.rentalApi;

/** 恢复应用默认会话，返回值与 restoreWebSession 一致。 */
export function restoreCurrentWebSession(): Promise<boolean> {
  return webSession.restoreSession();
}

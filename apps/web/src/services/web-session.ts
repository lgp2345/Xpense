import type { AuthTokensResponse, ChangePasswordInput, CurrentUserResponse } from "@xpense/shared";
import type { AxiosInstance } from "axios";
import {
  clearInitialPasswordNotice,
  showInitialPasswordNotice,
} from "@/features/auth/initial-password-notice";
import { toast } from "@/lib/toast";
import { API_BASE_URL } from "../lib/env";
import { type AuthStoreApi, authStore } from "../stores/auth-store";
import {
  createMenuStore,
  menuStore as defaultMenuStore,
  type MenuStoreApi,
} from "../stores/menu-store";
import { ApiError, createApiClient } from "./api-client";
import { type AuthApi, createAuthApi, type LoginRequest, type UserOrganization } from "./auth-api";
import { createIamApi, type IamApi } from "./iam-api";
import { createOrganizationsApi, type OrganizationsApi } from "./organizations-api";
import { createRentalApi, type RentalApi } from "./rental-api";
import { createRentalBillsApi, type RentalBillsApi } from "./rental-bills-api";
import { createRentalFinanceApi, type RentalFinanceApi } from "./rental-finance-api";

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
  iamApi: IamApi;
  organizationsApi: OrganizationsApi;
  menuStore: MenuStoreApi;
  rentalApi: RentalApi;
  rentalBillsApi: RentalBillsApi;
  rentalFinanceApi: RentalFinanceApi;
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
  accessToken: string | null;
  passwordPending: boolean;
};

type SessionMutationCoordinator = {
  cookieRequests?: Set<Promise<unknown>>;
  logoutPromise?: Promise<void>;
  activeIdentity?: symbol;
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
  const coordinator = getSessionMutationCoordinator(store);
  const identity = Symbol("restore-session");
  coordinator.activeIdentity = identity;
  const current = () => coordinator.activeIdentity === identity;
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  try {
    const boundary = [...(coordinator.cookieRequests ?? [])];
    if (coordinator.logoutPromise) boundary.push(coordinator.logoutPromise);
    if (boundary.length) await Promise.allSettled(boundary);
    if (!current()) return false;
    const { accessToken } = await trackCookieRequest(store, () => api.refresh());
    if (!current()) return false;
    store.getState().setAccessToken(accessToken);
    const currentUser = await api.getCurrentUser();
    if (!current() || store.getState().accessToken !== accessToken) return false;
    store.getState().setCurrentUserContext(currentUser);
    await loadOrganizationMenus(menus, currentUser.organization?.id ?? null);

    return (
      current() &&
      store.getState().accessToken === accessToken &&
      store.getState().status === "authenticated"
    );
  } catch {
    if (!current()) return false;
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
  onChangePassword?: () => void,
): Promise<boolean> {
  invalidateOrganizationSwitch(store);
  const coordinator = getSessionMutationCoordinator(store);
  const identity = Symbol("credential-login");
  coordinator.activeIdentity = identity;
  const current = () => coordinator.activeIdentity === identity;
  let didCreateSession = false;
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();
  try {
    const boundary = [...(coordinator.cookieRequests ?? [])];
    if (coordinator.logoutPromise) boundary.push(coordinator.logoutPromise);
    if (boundary.length) await Promise.allSettled(boundary);
    if (!current()) return false;
    const { accessToken } = await trackCookieRequest(store, () =>
      api.login({ ...input, clientType: "web_pc" }),
    );
    if (!current()) return false;
    didCreateSession = true;
    store.getState().setAccessToken(accessToken);
    const user = await api.getCurrentUser();
    if (!current() || store.getState().accessToken !== accessToken) return false;
    store.getState().setCurrentUserContext(user);
    await loadOrganizationMenus(menus, user.organization?.id ?? null);
    if (
      !current() ||
      store.getState().accessToken !== accessToken ||
      store.getState().status !== "authenticated"
    )
      return false;
    if (onChangePassword)
      showInitialPasswordNotice({
        sessionId: user.session.id,
        initialPasswordUnchanged: user.user.initialPasswordUnchanged,
        onChangePassword,
      });
    return true;
  } catch (error) {
    if (!current()) return false;
    if (didCreateSession)
      await trackCookieRequest(store, () => api.logout()).catch(() => undefined);
    if (!current()) return false;
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
  return runWebContextSwitch(
    {
      getCurrentUser: api.getCurrentUser,
      switchContext: () => api.switchOrganization(organizationId),
    },
    store,
    menuBootstrap,
  );
}

type ContextSwitchApi = {
  getCurrentUser: () => Promise<CurrentUserResponse>;
  switchContext: () => Promise<AuthTokensResponse>;
};

/** 返回平台沿用组织切换的去重及失效校验，避免旧组织结果覆盖平台上下文。 */
export function returnWebSessionToPlatform(session: WebSessionDependency): Promise<void> {
  return runWebContextSwitch(
    {
      getCurrentUser: session.authApi.getCurrentUser,
      switchContext: () => session.authApi.returnToPlatform(),
    },
    session.authStore,
    session,
  );
}

/** 改密响应已写入刷新 Cookie，随后用同一协调器采用新令牌和上下文。 */
export async function changeOwnPassword(
  session: WebSessionDependency,
  input: ChangePasswordInput,
): Promise<void> {
  if (getSessionMutationCoordinator(session.authStore).activeSwitch)
    throw new Error("会话正在切换，请稍后重试");
  await runWebContextSwitch(
    {
      getCurrentUser: session.authApi.getCurrentUser,
      switchContext: () =>
        trackCookieRequest(session.authStore, () => session.authApi.changePassword(input)),
    },
    session.authStore,
    session,
    true,
  );
  if (session.authStore.getState().currentUser?.initialPasswordUnchanged === false)
    clearInitialPasswordNotice();
}

function runWebContextSwitch(
  api: ContextSwitchApi,
  store: AuthStoreApi,
  menuBootstrap?: MenuBootstrapDependency,
  passwordPending = false,
): Promise<void> {
  const coordinator = getSessionMutationCoordinator(store);

  if (coordinator.activeSwitch) {
    return coordinator.activeSwitch.promise;
  }

  coordinator.activeIdentity = undefined;
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  const operationId = Symbol("switch-organization");
  const startingAccessToken = store.getState().accessToken;
  const startingOrganizationId = store.getState().currentOrganization?.id ?? null;
  const operation: SwitchOperation = {
    id: operationId,
    promise: Promise.resolve(),
    accessToken: startingAccessToken,
    passwordPending,
  };
  coordinator.activeSwitch = operation;
  const promise = performOrganizationSwitch(
    api,
    store,
    coordinator,
    operationId,
    startingOrganizationId,
    menus,
    passwordPending,
  ).finally(() => {
    if (coordinator.activeSwitch?.id === operationId) {
      coordinator.activeSwitch = undefined;
    }
  });

  operation.promise = promise;

  return promise;
}

/**
 * 执行切换并在异步返回后核对操作标识与令牌，防止旧结果覆盖新会话。
 * 切换接口失败时保留原认证并重载旧菜单；新令牌已采用而用户加载失败时，
 * 仅在该令牌仍是当前令牌时清理本地认证，避免令牌与权限上下文不一致。
 */
async function performOrganizationSwitch(
  api: ContextSwitchApi,
  store: AuthStoreApi,
  coordinator: SessionMutationCoordinator,
  operationId: symbol,
  startingOrganizationId: string | null,
  menuBootstrap: MenuBootstrapDependency | undefined,
  passwordPending: boolean,
): Promise<void> {
  let accessToken: string;

  try {
    if (passwordPending) {
      // 先接收此前发出的刷新 Cookie，再允许改密响应写入替换 Cookie。
      const pending = [...(coordinator.cookieRequests ?? [])];
      if (pending.length) await Promise.allSettled(pending);
      if (!isCurrentSwitchContext(coordinator, operationId, store)) return;
    }
    ({ accessToken } = await api.switchContext());
  } catch (error) {
    if (!isCurrentSwitchContext(coordinator, operationId, store)) {
      return;
    }

    await loadOrganizationMenus(menuBootstrap, startingOrganizationId);
    throw new WebOrganizationSwitchError(error);
  }

  if (!isCurrentSwitchContext(coordinator, operationId, store)) {
    return;
  }

  const operation = coordinator.activeSwitch;
  operation.accessToken = accessToken;
  operation.passwordPending = false;
  store.getState().setAccessToken(accessToken);

  try {
    const currentUser = await api.getCurrentUser();

    if (!isCurrentSwitchContext(coordinator, operationId, store)) {
      return;
    }

    store.getState().setCurrentUserContext(currentUser);
    await loadOrganizationMenus(menuBootstrap, currentUser.organization?.id ?? null);
  } catch (error) {
    if (!isCurrentSwitch(coordinator, operationId)) {
      return;
    }

    if (isCurrentSwitchContext(coordinator, operationId, store)) {
      store.getState().clearAuth();
      menuBootstrap?.menuStore.getState().clearMenus();
    }

    throw new WebOrganizationSwitchError(error);
  }
}

/**
 * 先使在途组织切换失效并清理菜单，再用当前令牌发起远端退出。
 * 请求发起后立即清理本地认证；在途 Cookie 响应结束后补一次远端清理，之后才允许新登录。
 * 任一次远端退出失败仍向调用方抛出。
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
  const coordinator = getSessionMutationCoordinator(store);
  if (coordinator.logoutPromise) return coordinator.logoutPromise;
  invalidateOrganizationSwitch(store);
  coordinator.activeIdentity = undefined;
  const cookieRequests = [...(coordinator.cookieRequests ?? [])];
  clearInitialPasswordNotice();
  const menus = resolveMenuBootstrap(store, menuBootstrap);
  menus?.menuStore.getState().clearMenus();

  let logoutRequest: Promise<void>;

  try {
    logoutRequest = api.logout();
  } catch (error) {
    logoutRequest = Promise.reject(error);
  }
  const initial = Promise.allSettled([logoutRequest]);
  store.getState().clearAuth();
  const completion = (async () => {
    if (cookieRequests.length) {
      await Promise.allSettled(cookieRequests);
      // 迟到的登录、刷新或改密响应可能重写 HttpOnly Cookie；再次退出再允许新登录。
      await api.logout();
    }
    const [result] = await initial;
    if (result?.status === "rejected") throw result.reason;
  })().finally(() => {
    if (coordinator.logoutPromise === completion) coordinator.logoutPromise = undefined;
  });
  coordinator.logoutPromise = completion;
  await completion;
}

/** 只追踪会写入刷新 Cookie 的在途请求，不保存凭据或持久化登录状态。 */
function trackCookieRequest<T>(store: AuthStoreApi, operation: () => Promise<T>): Promise<T> {
  const coordinator = getSessionMutationCoordinator(store);
  const pending = coordinator.cookieRequests ?? new Set<Promise<unknown>>();
  coordinator.cookieRequests = pending;
  const request = operation().finally(() => pending.delete(request));
  pending.add(request);
  return request;
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

      if (state.accessScope === "platform") {
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

/** 同一会话的自动刷新可以推进令牌，其他身份写入仍会使该操作失效。 */
function isCurrentSwitchContext(
  coordinator: SessionMutationCoordinator,
  operationId: symbol,
  store: AuthStoreApi,
): coordinator is SessionMutationCoordinator & { activeSwitch: SwitchOperation } {
  return (
    isCurrentSwitch(coordinator, operationId) &&
    store.getState().accessToken === coordinator.activeSwitch?.accessToken
  );
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
    onError: toast.error,
    getAccessToken: () => options.authStore.getState().accessToken,
    instance: options.instance,
    onAuthFailure: (_error, requestAccessToken) => {
      if (getSessionMutationCoordinator(options.authStore).activeSwitch?.passwordPending) return;
      if (options.authStore.getState().accessToken === requestAccessToken) {
        options.authStore.getState().clearAuth();
        sessionMenuStore.getState().clearMenus();
      }
    },
    canRefreshAccessToken: (requestPath) =>
      !getSessionMutationCoordinator(options.authStore).activeSwitch?.passwordPending ||
      requestPath === "/auth/password/update",
    refreshAccessToken: async (requestAccessToken) => {
      const coordinator = getSessionMutationCoordinator(options.authStore);
      if (options.authStore.getState().accessToken !== requestAccessToken) return null;
      const { accessToken } = await trackCookieRequest(options.authStore, () =>
        apiClient.post<AuthTokensResponse>("/auth/refresh", undefined, {
          authFailure: "ignore",
          authRefresh: "ignore",
          errorFeedback: "ignore",
        }),
      );

      if (options.authStore.getState().accessToken !== requestAccessToken) {
        return null;
      }

      const active = coordinator.activeSwitch;
      if (active?.accessToken === requestAccessToken) active.accessToken = accessToken;
      options.authStore.getState().setAccessToken(accessToken);

      return accessToken;
    },
  });
  const authApi = createAuthApi(apiClient);
  const iamApi = createIamApi(apiClient);
  const rentalApi = createRentalApi(apiClient);
  const rentalBillsApi = createRentalBillsApi(apiClient);
  const rentalFinanceApi = createRentalFinanceApi(apiClient);
  const menuBootstrap = { iamApi, menuStore: sessionMenuStore };
  bindMenuBootstrap(options.authStore, menuBootstrap);

  return {
    authApi,
    authStore: options.authStore,
    iamApi,
    organizationsApi: createOrganizationsApi(apiClient),
    menuStore: sessionMenuStore,
    rentalApi,
    rentalBillsApi,
    rentalFinanceApi,
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
export const webIamApi = webSession.iamApi;
export const webRentalApi = webSession.rentalApi;
export const webRentalBillsApi = webSession.rentalBillsApi;
export const webRentalFinanceApi = webSession.rentalFinanceApi;

/** 恢复应用默认会话，返回值与 restoreWebSession 一致。 */
export function restoreCurrentWebSession(): Promise<boolean> {
  return webSession.restoreSession();
}

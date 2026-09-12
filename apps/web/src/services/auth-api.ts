import type {
  AuthTokensResponse,
  CaptchaChallengeResponse,
  ClientType,
  CurrentUserResponse,
} from "@xpense/shared";

import type { ApiClient } from "./api-client";

export type LoginRequest = {
  phone: string;
  password: string;
  captchaId: string;
  captchaText: string;
  clientType: ClientType;
  deviceId?: string;
  deviceName?: string;
};

/** 请求体传输的刷新参数；WEB Cookie 会话应省略此参数，由浏览器携带刷新 Cookie。 */
export type RefreshRequest = {
  refreshToken: string;
};

export type UserOrganization = {
  id: string;
  name: string;
  status: "active" | "disabled";
};

export type SessionResponse = {
  id: string;
  currentOrganizationId: string | null;
  clientType: ClientType;
  status: "active" | "revoked";
  expiresAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

/**
 * 将认证、组织和会话端点封装为业务方法，共用传入客户端的鉴权与错误处理。
 * 方法仅发起请求；登录后的状态写入、菜单加载和退出清理由 web-session 协调。
 *
 * @param client 已配置的请求客户端，测试时可注入替代实现。
 * @returns 返回解包数据的认证接口集合。
 */
export function createAuthApi(client: ApiClient) {
  return {
    login: (input: LoginRequest) => client.post<AuthTokensResponse>("/auth/login", input),
    getCaptcha: () => client.get<CaptchaChallengeResponse>("/auth/captcha"),
    /** 刷新接口自身不递归刷新或通知清理认证，错误交给调用它的会话流程处理。 */
    refresh: (input?: RefreshRequest) =>
      client.post<AuthTokensResponse>("/auth/refresh", input, {
        authFailure: "ignore",
        authRefresh: "ignore",
      }),
    logout: () => client.post<void>("/auth/logout"),
    getCurrentUser: () => client.get<CurrentUserResponse>("/user"),
    listOrganizations: () => client.get<UserOrganization[]>("/user/organizations"),
    /** 允许认证刷新，但最终 401 不直接清理状态，由组织切换流程决定如何收尾。 */
    switchOrganization: (organizationId: string) =>
      client.post<AuthTokensResponse>(
        "/user/current-organization",
        { organizationId },
        { authFailure: "ignore" },
      ),
    listSessions: () => client.get<SessionResponse[]>("/auth/sessions"),
    revokeSession: (sessionId: string) =>
      client.post<void>(`/auth/sessions/${encodeURIComponent(sessionId)}/revoke`),
    revokeAllSessions: () => client.post<void>("/auth/sessions/revoke-all"),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;

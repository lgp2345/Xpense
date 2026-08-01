import type { AuthTokensResponse, ClientType, CurrentUserResponse } from "@xpense/shared";

import type { ApiClient } from "./api-client";

export type LoginRequest = {
  email: string;
  password: string;
  clientType: ClientType;
  deviceId?: string;
  deviceName?: string;
};

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

export function createAuthApi(client: ApiClient) {
  return {
    login: (input: LoginRequest) => client.post<AuthTokensResponse>("/auth/login", input),
    refresh: (input?: RefreshRequest) => client.post<AuthTokensResponse>("/auth/refresh", input),
    logout: () => client.post<void>("/auth/logout"),
    getCurrentUser: () => client.get<CurrentUserResponse>("/user"),
    listOrganizations: () => client.get<UserOrganization[]>("/user/organizations"),
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

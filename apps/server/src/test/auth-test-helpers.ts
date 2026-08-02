import type { AccessTokenPayload } from "../modules/auth/token.service.js";

type InjectResponse = {
  payload: string;
  statusCode: number;
};

type InjectableApp = {
  inject(options: unknown): Promise<InjectResponse>;
};

export const testIds = {
  organization: "00000000-0000-4000-8000-000000000001",
  otherOrganization: "00000000-0000-4000-8000-000000000002",
  ownerUser: "11111111-1111-4111-8111-111111111111",
  managerUser: "11111111-1111-4111-8111-111111111112",
  viewerUser: "11111111-1111-4111-8111-111111111113",
  superUser: "11111111-1111-4111-8111-111111111114",
  superNonMemberUser: "11111111-1111-4111-8111-111111111115",
  ownerRole: "22222222-2222-4222-8222-222222222221",
  managerRole: "22222222-2222-4222-8222-222222222222",
  viewerRole: "22222222-2222-4222-8222-222222222223",
  ownerMember: "33333333-3333-4333-8333-333333333331",
  managerMember: "33333333-3333-4333-8333-333333333332",
  viewerMember: "33333333-3333-4333-8333-333333333333",
  superMember: "33333333-3333-4333-8333-333333333334",
} as const;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export function parseJson<T = Record<string, unknown>>(response: InjectResponse): T {
  return JSON.parse(response.payload) as T;
}

export async function login(app: InjectableApp, email: string): Promise<AuthTokens> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email,
      password: "password",
      clientType: "web_pc",
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Login failed: ${response.statusCode} ${response.payload}`);
  }

  return parseJson<AuthTokens>(response);
}

export type TestAuth = {
  signAccessToken(payload: AccessTokenPayload): Promise<string>;
};

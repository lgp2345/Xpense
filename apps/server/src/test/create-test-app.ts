import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { ClientType, PermissionKey } from "@xpense/shared";

import { AppModule } from "../app.module.js";
import { ServerConfigService } from "../config/config.service.js";
import { configureHttpApplication } from "../configure-http-application.js";
import { DB } from "../db/db.tokens.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import type { AppendAuditLogInput, AuditLogRecord } from "../modules/audit/audit.types.js";
import { type AuthRefreshSession, AuthRepository } from "../modules/auth/auth.repository.js";
import { PasswordService } from "../modules/auth/password.service.js";
import { type AccessTokenPayload, TokenService } from "../modules/auth/token.service.js";
import { AccessRepository } from "../modules/iam/access.repository.js";
import { IamRepository } from "../modules/iam/iam.repository.js";
import type {
  CreateMemberInput,
  CreateRoleInput,
  IamMember,
  IamPermission,
  IamRole,
  ReplaceRolePermissionsInput,
  UpdateMemberInput,
  UpdateRoleInput,
} from "../modules/iam/iam.types.js";
import { OrganizationsRepository } from "../modules/organizations/organizations.repository.js";
import { UserRepository } from "../modules/user/user.repository.js";
import { type TestAuth, testIds } from "./auth-test-helpers.js";

type TestUser = {
  id: string;
  email: string;
  passwordHash: string;
  status: "active" | "disabled";
  isSuperAdmin: boolean;
};

type TestOrganization = {
  id: string;
  name: string;
  status: "active" | "disabled";
};

type TestMember = {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string;
  status: "active" | "disabled";
  joinedAt: Date;
};

type TestRole = IamRole & {
  permissions: PermissionKey[];
};

export type TestState = {
  users: Map<string, TestUser>;
  organizations: Map<string, TestOrganization>;
  members: Map<string, TestMember>;
  roles: Map<string, TestRole>;
  sessions: Map<string, AuthRefreshSession>;
  auditLogs: AuditLogRecord[];
};

export type TestAppHarness = {
  app: NestFastifyApplication;
  auth: TestAuth;
  state: TestState;
};

export async function createTestApp(): Promise<TestAppHarness> {
  ensureTestEnv();

  const state = createTestState();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DB)
    .useValue({})
    .overrideProvider(PasswordService)
    .useValue(createPasswordService())
    .overrideProvider(AuthRepository)
    .useValue(createAuthRepository(state))
    .overrideProvider(AccessRepository)
    .useValue(createAccessRepository(state))
    .overrideProvider(OrganizationsRepository)
    .useValue(createOrganizationsRepository(state))
    .overrideProvider(UserRepository)
    .useValue(createUserRepository(state))
    .overrideProvider(IamRepository)
    .useValue(createIamRepository(state))
    .overrideProvider(AuditRepository)
    .useValue(createAuditRepository(state))
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const config = app.get(ServerConfigService);
  app.setGlobalPrefix(config.apiPrefix);
  await configureHttpApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const tokenService = app.get(TokenService);

  return {
    app,
    auth: {
      signAccessToken: (payload: AccessTokenPayload) => tokenService.signAccessToken(payload),
    },
    state,
  };
}

function ensureTestEnv(): void {
  process.env.DATABASE_URL ??= "postgres://xpense:xpense@localhost:5432/xpense_test";
  process.env.JWT_ACCESS_SECRET ??= "test-secret-with-at-least-thirty-two-characters";
  process.env.WEB_ORIGIN ??= "http://localhost:5173";
  process.env.VITE_API_PREFIX ??= "api";
}

function createTestState(): TestState {
  const users = new Map<string, TestUser>([
    [testIds.ownerUser, createUser(testIds.ownerUser, "owner@example.com", false)],
    [testIds.managerUser, createUser(testIds.managerUser, "manager@example.com", false)],
    [testIds.viewerUser, createUser(testIds.viewerUser, "viewer@example.com", false)],
    [testIds.superUser, createUser(testIds.superUser, "super@example.com", true)],
    [
      testIds.superNonMemberUser,
      createUser(testIds.superNonMemberUser, "super-non-member@example.com", true),
    ],
  ]);
  const organizations = new Map<string, TestOrganization>([
    [testIds.organization, { id: testIds.organization, name: "Acme", status: "active" }],
    [testIds.otherOrganization, { id: testIds.otherOrganization, name: "Other", status: "active" }],
  ]);
  const roles = new Map<string, TestRole>([
    [
      testIds.ownerRole,
      createRole(testIds.ownerRole, "owner", "Owner", [
        "roles.read",
        "members.update",
        "audit_logs.read",
      ]),
    ],
    [
      testIds.managerRole,
      createRole(testIds.managerRole, "manager", "Manager", ["roles.read", "members.update"]),
    ],
    [testIds.viewerRole, createRole(testIds.viewerRole, "viewer", "Viewer", ["transactions.read"])],
  ]);
  const members = new Map<string, TestMember>([
    [testIds.ownerMember, createMember(testIds.ownerMember, testIds.ownerUser, testIds.ownerRole)],
    [
      testIds.managerMember,
      createMember(testIds.managerMember, testIds.managerUser, testIds.managerRole),
    ],
    [
      testIds.viewerMember,
      createMember(testIds.viewerMember, testIds.viewerUser, testIds.viewerRole),
    ],
    [testIds.superMember, createMember(testIds.superMember, testIds.superUser, testIds.viewerRole)],
  ]);
  const sessions = new Map<string, AuthRefreshSession>([
    [
      "session-super-non-member",
      createSession({
        id: "session-super-non-member",
        userId: testIds.superNonMemberUser,
        currentOrganizationId: testIds.organization,
        refreshTokenHash: "manual",
      }),
    ],
  ]);

  return {
    users,
    organizations,
    members,
    roles,
    sessions,
    auditLogs: [],
  };
}

function createUser(id: string, email: string, isSuperAdmin: boolean): TestUser {
  return {
    id,
    email,
    passwordHash: "password:password",
    status: "active",
    isSuperAdmin,
  };
}

function createRole(id: string, key: string, name: string, permissions: PermissionKey[]): TestRole {
  return {
    id,
    organizationId: testIds.organization,
    key,
    name,
    description: name,
    isSystem: false,
    isEditable: true,
    permissions,
  };
}

function createMember(id: string, userId: string, roleId: string): TestMember {
  return {
    id,
    organizationId: testIds.organization,
    userId,
    roleId,
    status: "active",
    joinedAt: new Date("2026-07-09T00:00:00.000Z"),
  };
}

function createSession(input: {
  id: string;
  userId: string;
  currentOrganizationId: string;
  refreshTokenHash: string;
  clientType?: ClientType;
}): AuthRefreshSession {
  const now = new Date("2026-07-09T00:00:00.000Z");

  return {
    id: input.id,
    userId: input.userId,
    currentOrganizationId: input.currentOrganizationId,
    clientType: input.clientType ?? "web_pc",
    refreshTokenHash: input.refreshTokenHash,
    status: "active",
    expiresAt: new Date("2026-08-09T00:00:00.000Z"),
    rotatedAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createPasswordService(): Pick<PasswordService, "hash" | "verify"> {
  return {
    hash: async (password: string) => `password:${password}`,
    verify: async (hash: string, password: string) => hash === `password:${password}`,
  };
}

function createAuthRepository(state: TestState): Partial<AuthRepository> {
  let nextSessionId = 1;

  return {
    findActiveUserByEmail: async (email) => {
      const user = [...state.users.values()].find(
        (item) => item.email === email && item.status === "active",
      );

      if (!user) {
        return null;
      }

      return {
        ...user,
        defaultOrganizationId: findActiveMemberByUser(state, user.id)?.organizationId ?? null,
      };
    },
    createRefreshSession: async (input) => {
      const session = createSession({
        id: `session-${nextSessionId++}`,
        userId: input.userId,
        currentOrganizationId: input.currentOrganizationId,
        refreshTokenHash: input.refreshTokenHash,
        clientType: input.clientType,
      });
      state.sessions.set(session.id, session);
      return session;
    },
    findActiveSessionByRefreshTokenHash: async (hash) =>
      [...state.sessions.values()].find(
        (session) => session.refreshTokenHash === hash && session.status === "active",
      ) ?? null,
    findActiveSessionById: async (sessionId) => {
      const session = state.sessions.get(sessionId);
      return session?.status === "active" ? session : null;
    },
    updateRefreshSessionToken: async (input) => {
      const session = state.sessions.get(input.sessionId);

      if (
        session?.status !== "active" ||
        session.refreshTokenHash !== input.expectedRefreshTokenHash
      ) {
        return false;
      }

      state.sessions.set(input.sessionId, {
        ...session,
        refreshTokenHash: input.refreshTokenHash,
        rotatedAt: input.rotatedAt,
        lastUsedAt: input.lastUsedAt,
        updatedAt: input.lastUsedAt,
      });
      return true;
    },
    revokeSession: async (sessionId) => {
      const session = state.sessions.get(sessionId);

      if (session) {
        state.sessions.set(sessionId, {
          ...session,
          status: "revoked",
          revokedAt: new Date(),
        });
      }
    },
    revokeAllUserSessions: async (userId) => {
      for (const session of state.sessions.values()) {
        if (session.userId === userId) {
          state.sessions.set(session.id, {
            ...session,
            status: "revoked",
            revokedAt: new Date(),
          });
        }
      }
    },
    listUserSessions: async (userId) =>
      [...state.sessions.values()].filter((session) => session.userId === userId),
  };
}

function createAccessRepository(state: TestState): Partial<AccessRepository> {
  return {
    findActiveSession: async (payload) => {
      const session = state.sessions.get(payload.sessionId);

      if (
        !session ||
        session.userId !== payload.userId ||
        session.currentOrganizationId !== payload.organizationId ||
        session.status !== "active" ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        return null;
      }

      return session;
    },
    findActiveUser: async (userId) => {
      const user = state.users.get(userId);
      return user?.status === "active" ? { id: user.id, isSuperAdmin: user.isSuperAdmin } : null;
    },
    findActiveOrganization: async (organizationId) => {
      const organization = state.organizations.get(organizationId);
      return organization?.status === "active" ? { id: organization.id } : null;
    },
    findActiveMembership: async (userId, organizationId) => {
      const member = findActiveMemberByUser(state, userId, organizationId);
      return member
        ? { userId: member.userId, organizationId: member.organizationId, roleId: member.roleId }
        : null;
    },
    listPermissionKeysForRole: async (roleId) => state.roles.get(roleId)?.permissions ?? [],
  };
}

function createOrganizationsRepository(state: TestState): Partial<OrganizationsRepository> {
  return {
    listActiveOrganizationsForUser: async (userId) =>
      [...state.members.values()]
        .filter((member) => member.userId === userId && member.status === "active")
        .map((member) => state.organizations.get(member.organizationId))
        .filter(
          (organization): organization is TestOrganization => organization?.status === "active",
        ),
    findActiveMembership: async (userId, organizationId) => {
      const member = findActiveMemberByUser(state, userId, organizationId);
      const organization = member ? state.organizations.get(organizationId) : undefined;

      return member && organization?.status === "active"
        ? { userId, organizationId, organization }
        : null;
    },
    updateSessionOrganization: async (sessionId, organizationId) => {
      const session = state.sessions.get(sessionId);

      if (session) {
        state.sessions.set(sessionId, { ...session, currentOrganizationId: organizationId });
      }
    },
  };
}

function createUserRepository(state: TestState): Partial<UserRepository> {
  return {
    findCurrentUserContext: async (authContext) => {
      const session = state.sessions.get(authContext.sessionId);
      const user = state.users.get(authContext.userId);
      const organization = state.organizations.get(authContext.organizationId);
      const member = findActiveMemberByUser(state, authContext.userId, authContext.organizationId);
      const role = member ? state.roles.get(member.roleId) : undefined;

      if (
        session?.status !== "active" ||
        session.currentOrganizationId !== authContext.organizationId ||
        !user ||
        user.status !== "active" ||
        !organization ||
        organization.status !== "active" ||
        !member ||
        !role
      ) {
        return null;
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          status: user.status,
        },
        organization: {
          id: organization.id,
          name: organization.name,
        },
        role: {
          id: role.id,
          key: role.key,
          name: role.name,
        },
        session: {
          id: session.id,
          clientType: session.clientType,
        },
      };
    },
    listPermissionKeysForRole: async (roleId) => state.roles.get(roleId)?.permissions ?? [],
  };
}

function createIamRepository(state: TestState): Partial<IamRepository> {
  return {
    listMembers: async (organizationId) =>
      [...state.members.values()]
        .filter((member) => member.organizationId === organizationId)
        .map((member) => toIamMember(state, member))
        .filter((member): member is IamMember => member !== null),
    findMemberById: async (organizationId, memberId) => {
      const member = state.members.get(memberId);
      return member?.organizationId === organizationId ? toIamMember(state, member) : null;
    },
    findMemberByOrganizationAndUser: async (organizationId, userId) => {
      const member = [...state.members.values()].find(
        (item) => item.organizationId === organizationId && item.userId === userId,
      );
      return member ? toIamMember(state, member) : null;
    },
    createMember: async (input: CreateMemberInput) => {
      const id = `33333333-3333-4333-8333-${String(state.members.size + 1).padStart(12, "0")}`;
      const member = createMember(id, input.userId, input.roleId);
      state.members.set(id, member);
      const iamMember = toIamMember(state, member);

      if (!iamMember) {
        throw new Error("Created member is unavailable");
      }

      return iamMember;
    },
    updateMember: async (input: UpdateMemberInput) => {
      const member = state.members.get(input.memberId);

      if (!member || member.organizationId !== input.organizationId) {
        throw new Error("Member is unavailable");
      }

      const nextMember = {
        ...member,
        roleId: input.roleId ?? member.roleId,
        status: input.status ?? member.status,
      };
      state.members.set(input.memberId, nextMember);
      const iamMember = toIamMember(state, nextMember);

      if (!iamMember) {
        throw new Error("Updated member is unavailable");
      }

      return iamMember;
    },
    revokeActiveSessionsForUserInOrganization: async (userId, organizationId) => {
      for (const session of state.sessions.values()) {
        if (session.userId === userId && session.currentOrganizationId === organizationId) {
          state.sessions.set(session.id, { ...session, status: "revoked", revokedAt: new Date() });
        }
      }
    },
    listRoles: async (organizationId) =>
      [...state.roles.values()].filter(
        (role) => role.organizationId === organizationId || role.organizationId === null,
      ),
    findRoleById: async (organizationId, roleId) => {
      const role = state.roles.get(roleId);
      return role?.organizationId === organizationId || role?.organizationId === null ? role : null;
    },
    findRoleByKey: async (organizationId, key) =>
      [...state.roles.values()].find(
        (role) =>
          role.key === key &&
          (role.organizationId === organizationId || role.organizationId === null),
      ) ?? null,
    createRole: async (input: CreateRoleInput) => {
      const role = createRole(
        `22222222-2222-4222-8222-${String(state.roles.size + 1).padStart(12, "0")}`,
        input.key,
        input.name,
        [],
      );
      state.roles.set(role.id, role);
      return role;
    },
    updateRole: async (input: UpdateRoleInput) => {
      const role = state.roles.get(input.roleId);

      if (!role || role.organizationId !== input.organizationId) {
        throw new Error("Role is unavailable");
      }

      const nextRole = {
        ...role,
        name: input.name ?? role.name,
        description: input.description ?? role.description,
      };
      state.roles.set(input.roleId, nextRole);
      return nextRole;
    },
    deleteRole: async (_organizationId, roleId) => {
      state.roles.delete(roleId);
    },
    replaceRolePermissions: async (input: ReplaceRolePermissionsInput) => {
      const role = state.roles.get(input.roleId);

      if (role) {
        state.roles.set(input.roleId, { ...role, permissions: input.permissionKeys });
      }
    },
    countMembersUsingRole: async (organizationId, roleId) =>
      [...state.members.values()].filter(
        (member) => member.organizationId === organizationId && member.roleId === roleId,
      ).length,
    listPermissions: async () => [
      toPermission("roles.read"),
      toPermission("members.update"),
      toPermission("audit_logs.read"),
    ],
  };
}

function createAuditRepository(state: TestState): Partial<AuditRepository> {
  return {
    append: async (input: AppendAuditLogInput) => {
      state.auditLogs.push({
        id: `audit-${state.auditLogs.length + 1}`,
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        result: input.result,
        metadata: input.metadata ?? {},
        requestId: input.requestId ?? null,
        createdAt: new Date(),
      });
    },
    listCurrentOrganizationLogs: async (input) =>
      state.auditLogs.filter(
        (log) =>
          log.organizationId === input.organizationId &&
          (!input.action || log.action === input.action) &&
          (!input.actorUserId || log.actorUserId === input.actorUserId) &&
          (!input.targetType || log.targetType === input.targetType),
      ),
  };
}

function findActiveMemberByUser(
  state: TestState,
  userId: string,
  organizationId?: string,
): TestMember | undefined {
  return [...state.members.values()].find(
    (member) =>
      member.userId === userId &&
      member.status === "active" &&
      (organizationId === undefined || member.organizationId === organizationId),
  );
}

function toIamMember(state: TestState, member: TestMember): IamMember | null {
  const user = state.users.get(member.userId);
  const role = state.roles.get(member.roleId);

  if (!user || !role) {
    return null;
  }

  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    email: user.email,
    roleId: member.roleId,
    roleKey: role.key,
    roleName: role.name,
    status: member.status,
    joinedAt: member.joinedAt,
  };
}

function toPermission(key: PermissionKey): IamPermission {
  const [resource, ...actionParts] = key.split(".");

  return {
    id: `permission:${key}`,
    key,
    name: key,
    resource: resource ?? key,
    action: actionParts.join("."),
    description: key,
  };
}

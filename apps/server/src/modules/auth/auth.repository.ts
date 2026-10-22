import { Inject, Injectable } from "@nestjs/common";
import type { ClientType } from "@xpense/shared";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, refreshSessions, users } from "../../db/schema.js";
import { selectDefaultOrganization } from "./default-organization.rules.js";
import type { AccessTokenPayload } from "./token.service.js";

export type AuthUser = {
  id: string;
  phone: string | null;
  passwordHash: string;
  status: "active" | "disabled";
  isSuperAdmin: boolean;
  defaultOrganizationId: string | null;
};

export type AuthRefreshSession = {
  id: string;
  userId: string;
  currentOrganizationId: string | null;
  clientType: ClientType;
  refreshTokenHash: string;
  status: "active" | "revoked";
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateRefreshSessionInput = {
  userId: string;
  currentOrganizationId: string | null;
  clientType: ClientType;
  deviceIdHash?: string;
  deviceName?: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipHash?: string;
};

export type UpdateRefreshSessionTokenInput = {
  sessionId: string;
  expectedRefreshTokenHash: string;
  refreshTokenHash: string;
  rotatedAt: Date;
  lastUsedAt: Date;
};

@Injectable()
export class AuthRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findActiveUserByPhone(phone: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select(authUserFields)
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.status, "active")))
      .limit(1);
    return user ? this.withDefaultOrganization(user, this.db) : null;
  }

  async lockActiveUser(userId: string, executor: AppDbExecutor): Promise<AuthUser | null> {
    const [user] = await executor
      .select(authUserFields)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .for("update")
      .limit(1);
    return user ? this.withDefaultOrganization(user, executor) : null;
  }

  private async withDefaultOrganization(
    user: Omit<AuthUser, "defaultOrganizationId"> & { lastOrganizationId: string | null },
    executor: AppDbExecutor,
  ): Promise<AuthUser> {
    const memberships = await executor
      .select({
        organizationId: organizationMemberships.organizationId,
        joinedAt: organizationMemberships.joinedAt,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      );
    return {
      ...user,
      defaultOrganizationId: selectDefaultOrganization(user.lastOrganizationId, memberships),
    };
  }

  async lockActiveSession(
    payload: AccessTokenPayload,
    executor: AppDbExecutor,
  ): Promise<AuthRefreshSession | null> {
    const [session] = await executor
      .select()
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.id, payload.sessionId),
          eq(refreshSessions.userId, payload.userId),
          payload.organizationId === null
            ? isNull(refreshSessions.currentOrganizationId)
            : eq(refreshSessions.currentOrganizationId, payload.organizationId),
          eq(refreshSessions.status, "active"),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    return session ?? null;
  }

  async updateLastOrganization(
    userId: string,
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .update(users)
      .set({ lastOrganizationId: organizationId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateSessionOrganization(
    sessionId: string,
    organizationId: string | null,
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .update(refreshSessions)
      .set({ currentOrganizationId: organizationId, updatedAt: new Date() })
      .where(eq(refreshSessions.id, sessionId));
  }

  async createRefreshSession(
    input: CreateRefreshSessionInput,
    executor: AppDbExecutor = this.db,
  ): Promise<AuthRefreshSession> {
    const [session] = await executor
      .insert(refreshSessions)
      .values({
        userId: input.userId,
        currentOrganizationId: input.currentOrganizationId,
        clientType: input.clientType,
        deviceIdHash: input.deviceIdHash,
        deviceName: input.deviceName,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipHash: input.ipHash,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to create refresh session");
    }

    return session;
  }

  async findActiveSessionByRefreshTokenHash(hash: string): Promise<AuthRefreshSession | null> {
    const [session] = await this.db
      .select()
      .from(refreshSessions)
      .where(and(eq(refreshSessions.refreshTokenHash, hash), eq(refreshSessions.status, "active")))
      .limit(1);

    return session ?? null;
  }

  async findActiveSessionById(sessionId: string): Promise<AuthRefreshSession | null> {
    const [session] = await this.db
      .select()
      .from(refreshSessions)
      .where(and(eq(refreshSessions.id, sessionId), eq(refreshSessions.status, "active")))
      .limit(1);

    return session ?? null;
  }

  async updateRefreshSessionToken(
    input: UpdateRefreshSessionTokenInput,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const updatedSessions = await executor
      .update(refreshSessions)
      .set({
        refreshTokenHash: input.refreshTokenHash,
        rotatedAt: input.rotatedAt,
        lastUsedAt: input.lastUsedAt,
        updatedAt: input.lastUsedAt,
      })
      .where(
        and(
          eq(refreshSessions.id, input.sessionId),
          eq(refreshSessions.refreshTokenHash, input.expectedRefreshTokenHash),
          eq(refreshSessions.status, "active"),
        ),
      )
      .returning({ id: refreshSessions.id });

    return updatedSessions.length === 1;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const now = new Date();

    await this.db
      .update(refreshSessions)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      })
      .where(and(eq(refreshSessions.id, sessionId), eq(refreshSessions.status, "active")));
  }

  async revokeAllUserSessions(userId: string, executor: AppDbExecutor = this.db): Promise<void> {
    const now = new Date();

    await executor
      .update(refreshSessions)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      })
      .where(and(eq(refreshSessions.userId, userId), eq(refreshSessions.status, "active")));
  }

  async listUserSessions(userId: string): Promise<AuthRefreshSession[]> {
    return this.db
      .select()
      .from(refreshSessions)
      .where(eq(refreshSessions.userId, userId))
      .orderBy(desc(refreshSessions.createdAt));
  }
}

const authUserFields = {
  id: users.id,
  phone: users.phone,
  passwordHash: users.passwordHash,
  status: users.status,
  isSuperAdmin: users.isSuperAdmin,
  lastOrganizationId: users.lastOrganizationId,
};

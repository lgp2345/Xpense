import { Dependencies, Injectable } from "@nestjs/common";
import type { ClientType } from "@xpense/shared";
import { and, desc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, refreshSessions, users } from "../../db/schema.js";

export type AuthUser = {
  id: string;
  email: string;
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
  currentOrganizationId: string;
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
  refreshTokenHash: string;
  rotatedAt: Date;
  lastUsedAt: Date;
};

@Injectable()
@Dependencies(DB)
export class AuthRepository {
  constructor(private readonly db: AppDb) {}

  async findActiveUserByEmail(email: string): Promise<AuthUser | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, "active")))
      .limit(1);

    if (!user) {
      return null;
    }

    const [membership] = await this.db
      .select({
        organizationId: organizationMemberships.organizationId,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      )
      .orderBy(desc(organizationMemberships.joinedAt))
      .limit(1);

    return {
      ...user,
      defaultOrganizationId: membership?.organizationId ?? null,
    };
  }

  async createRefreshSession(input: CreateRefreshSessionInput): Promise<AuthRefreshSession> {
    const [session] = await this.db
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

  async updateRefreshSessionToken(input: UpdateRefreshSessionTokenInput): Promise<void> {
    await this.db
      .update(refreshSessions)
      .set({
        refreshTokenHash: input.refreshTokenHash,
        rotatedAt: input.rotatedAt,
        lastUsedAt: input.lastUsedAt,
        updatedAt: input.lastUsedAt,
      })
      .where(eq(refreshSessions.id, input.sessionId));
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

  async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date();

    await this.db
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

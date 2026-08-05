import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { requestContext } from "../../common/request-context/request-context.js";
import { AuditService } from "./audit.service.js";

const authContext: AuthContext = {
  userId: "actor-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["audit_logs.read"],
};

describe("AuditService", () => {
  function createHarness() {
    const repository = {
      append: vi.fn().mockResolvedValue(undefined),
      listCurrentOrganizationLogs: vi.fn().mockResolvedValue([
        {
          id: "audit-1",
          organizationId: "org-1",
          actorUserId: "actor-1",
          action: "member.created",
          targetType: "member",
          targetId: "member-1",
          result: "succeeded",
          metadata: { roleTo: "admin" },
          requestId: null,
          createdAt: new Date("2026-07-09T00:00:00.000Z"),
        },
      ]),
    };
    const logger = {
      error: vi.fn(),
    };
    const service = new AuditService(repository as never, logger as never);

    return { repository, logger, service };
  }

  it("removes sensitive metadata before writing audit log", async () => {
    const { repository, service } = createHarness();

    await service.appendRequired({
      organizationId: "org-1",
      actorUserId: "actor-1",
      action: "member.role.changed",
      targetType: "member",
      targetId: "member-1",
      result: "succeeded",
      metadata: {
        roleFrom: "viewer",
        roleTo: "admin",
        password: "secret",
        token: "token",
        refreshToken: "refresh-token",
        refreshTokenHash: "hash",
        ip: "127.0.0.1",
      },
    });

    expect(repository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { roleFrom: "viewer", roleTo: "admin" },
      }),
    );
  });

  it("fills requestId from the request context when not provided", async () => {
    const { repository, service } = createHarness();

    await requestContext.run("req-ctx-123", () =>
      service.appendRequired({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "member.role.changed",
        targetType: "member",
        targetId: "member-1",
        result: "succeeded",
      }),
    );

    expect(repository.append).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-ctx-123" }),
    );
  });

  it("logs and swallows append failures for best-effort audit writes", async () => {
    const { repository, logger, service } = createHarness();
    repository.append.mockRejectedValue(new Error("db down"));

    await expect(
      service.append({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "auth.login.succeeded",
        targetType: "session",
        result: "succeeded",
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.succeeded",
        targetType: "session",
      }),
    );
  });

  it("throws appendRequired failures", async () => {
    const { repository, service } = createHarness();
    repository.append.mockRejectedValue(new Error("db down"));

    await expect(
      service.appendRequired({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "member.created",
        targetType: "member",
        result: "succeeded",
      }),
    ).rejects.toThrow("db down");
  });

  it("uses authContext.organizationId for audit log queries", async () => {
    const { repository, service } = createHarness();

    await service.listCurrentOrganizationLogs(authContext, {
      action: "member.created",
      actorUserId: "actor-1",
      targetType: "member",
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-10T00:00:00.000Z"),
      page: 2,
      pageSize: 25,
    });

    expect(repository.listCurrentOrganizationLogs).toHaveBeenCalledWith({
      organizationId: "org-1",
      action: "member.created",
      actorUserId: "actor-1",
      targetType: "member",
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-10T00:00:00.000Z"),
      page: 2,
      pageSize: 25,
    });
  });
});

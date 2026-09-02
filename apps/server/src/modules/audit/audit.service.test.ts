import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { requestContext } from "../../common/request-context/request-context.js";
import { AuditService } from "./audit.service.js";

const authContext: AuthContext = {
  userId: "actor-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["audit_logs:read"],
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
        nested: {
          documentNumber: "110101199001011234",
          documentAddress: "北京市东城区",
          safe: "retained",
          contact: [{ phone: "13800000000", email: "secret@example.com", label: "primary" }],
        },
        birthDate: "1990-01-01",
        gender: "male",
        ethnicity: "汉",
        note: "包含隐私的备注",
        reason: "包含隐私的原因",
      },
    });

    expect(repository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          roleFrom: "viewer",
          roleTo: "admin",
          nested: { safe: "retained", contact: [{ label: "primary" }] },
        },
      }),
    );
    const metadata = repository.append.mock.calls[0]?.[0]?.metadata;
    for (const key of [
      "documentNumber",
      "documentAddress",
      "birthDate",
      "gender",
      "ethnicity",
      "phone",
      "email",
      "note",
      "reason",
    ]) {
      expect(JSON.stringify(metadata)).not.toContain(`"${key}"`);
    }
  });

  it("sanitizes case-insensitive keys in arrays and custom-prototype objects", async () => {
    const { repository, service } = createHarness();
    const custom = Object.assign(Object.create({ inherited: "ignored" }), {
      Phone: "139-SENTINEL-PHONE",
      safe: "retained",
      nested: [{ EMAIL: "private@example.test", DocumentNumber: "ID-SENTINEL", keep: 1 }],
    });

    await service.appendRequired({
      organizationId: "org-1",
      actorUserId: "actor-1",
      action: "rental_tenant.updated",
      targetType: "rental_tenant",
      targetId: "tenant-1",
      result: "succeeded",
      metadata: {
        custom,
        array: [{ NoTe: "SENTINEL-NOTE", safe: true }, { rEaSoN: "SENTINEL-REASON" }],
      },
    });

    const metadata = repository.append.mock.calls[0]?.[0]?.metadata;
    expect(metadata).toEqual({
      custom: { safe: "retained", nested: [{ keep: 1 }] },
      array: [{ safe: true }, {}],
    });
    const serialized = JSON.stringify(metadata);
    for (const sentinel of [
      "139-SENTINEL-PHONE",
      "private@example.test",
      "ID-SENTINEL",
      "SENTINEL-NOTE",
      "SENTINEL-REASON",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("does not retain executable own metadata properties that can recreate sensitive values", async () => {
    const { repository, service } = createHarness();
    const metadataWithToJson = {
      safe: "retained",
      toJSON: () => ({ phone: "139-SENTINEL-TO-JSON" }),
    };

    await service.appendRequired({
      organizationId: "org-1",
      actorUserId: "actor-1",
      action: "rental_tenant.updated",
      targetType: "rental_tenant",
      targetId: "tenant-1",
      result: "succeeded",
      metadata: { metadataWithToJson },
    });

    const metadata = repository.append.mock.calls[0]?.[0]?.metadata;
    expect(metadata).toEqual({ metadataWithToJson: { safe: "retained" } });
    expect(JSON.stringify(metadata)).not.toContain("139-SENTINEL-TO-JSON");
  });

  it("rejects circular object and array metadata before appending", async () => {
    const { repository, service } = createHarness();
    const circularObject: { phone: string; self?: unknown } = { phone: "139-SENTINEL-OBJECT" };
    circularObject.self = circularObject;
    const circularArray: unknown[] = ["139-SENTINEL-ARRAY"];
    circularArray.push(circularArray);

    for (const metadata of [{ circularObject }, { circularArray }]) {
      await expect(
        service.appendRequired({
          organizationId: "org-1",
          actorUserId: "actor-1",
          action: "rental_tenant.sensitive_revealed",
          targetType: "rental_tenant",
          targetId: "tenant-1",
          result: "succeeded",
          metadata,
        }),
      ).rejects.toThrow("Unsafe audit metadata");
    }

    expect(repository.append).not.toHaveBeenCalled();
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
    repository.append.mockRejectedValue(new Error("139-SENTINEL-LOGGER"));

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
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("139-SENTINEL-LOGGER");
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

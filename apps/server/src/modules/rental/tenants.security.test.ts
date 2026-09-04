import type { ArgumentsHost } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { AbstractHttpAdapter, HttpAdapterHost } from "@nestjs/core";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter.js";
import { TenantsService } from "./tenants.service.js";
import { TenantsPolicyService } from "./tenants-policy.service.js";

const sentinels = {
  phone: "139-SENTINEL-PHONE",
  email: "sentinel-private@example.test",
  note: "SENTINEL-PRIVATE-NOTE",
};

const authContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

function tenantRecord() {
  return {
    id: "tenant-1",
    organizationId: "organization-1",
    type: "individual" as const,
    name: "安全边界测试",
    phone: sentinels.phone,
    email: sentinels.email,
    primaryContactName: null,
    primaryContactPhone: null,
    documentCountryCode: null,
    documentType: null,
    documentTypeOtherName: null,
    documentNumberLookupHash: null,
    sensitiveIdentityCiphertext: null,
    sensitiveIdentityKeyVersion: null,
    isActive: true,
    note: sentinels.note,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    contractCount: 0,
  };
}

function createHarness() {
  const current = tenantRecord();
  const repository = {
    list: vi.fn(),
    findActiveOwned: vi.fn().mockResolvedValue(current),
    findActiveOwnedForUpdate: vi.fn().mockResolvedValue(current),
    findDocumentConflict: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    hasContractReference: vi.fn(),
    softDelete: vi.fn(),
  };
  const policy = new TenantsPolicyService(repository as never);
  const crypto = {
    lookupHash: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn().mockReturnValue({
      documentNumber: null,
      birthDate: null,
      gender: null,
      ethnicity: null,
      documentAddress: null,
    }),
  };
  const service = new TenantsService(
    repository as never,
    policy,
    crypto as never,
    { appendRequired: vi.fn() } as never,
    { run: vi.fn().mockImplementation(async (operation) => operation({ kind: "tx" })) } as never,
  );
  return { repository, service };
}

function exposeThroughGlobalFilter(exception: unknown) {
  const reply = vi.fn();
  const response = {};
  const logger = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  const filter = new AllExceptionsFilter({
    httpAdapter: { reply } as unknown as AbstractHttpAdapter,
  } as unknown as HttpAdapterHost);
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return { logger, reply };
}

describe("tenant persistence error security", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    "create",
    "update",
    "setStatus",
    "delete",
  ] as const)("keeps %s Drizzle query params out of the global logger and HTTP response", async (operation) => {
    const { repository, service } = createHarness();
    const databaseError = new DrizzleQueryError(
      `insert into rental_tenants (phone, email, note) values ($1, $2, $3)`,
      [sentinels.phone, sentinels.email, sentinels.note],
      new Error("database unavailable"),
    );
    if (operation === "delete") {
      repository.softDelete.mockRejectedValue(databaseError);
    } else {
      repository[operation].mockRejectedValue(databaseError);
    }

    let thrown: unknown;
    try {
      if (operation === "create") {
        await service.create(authContext as never, {
          type: "individual",
          name: "安全边界测试",
          phone: sentinels.phone,
          email: sentinels.email,
          note: sentinels.note,
        });
      } else if (operation === "update") {
        await service.update(authContext as never, {
          id: "tenant-1",
          phone: sentinels.phone,
          email: sentinels.email,
          note: sentinels.note,
        });
      } else if (operation === "setStatus") {
        await service.setStatus(authContext as never, { id: "tenant-1", isActive: false });
      } else {
        await service.delete(authContext as never, { id: "tenant-1" });
      }
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const { logger, reply } = exposeThroughGlobalFilter(thrown);
    const observableOutput = JSON.stringify({ logs: logger.mock.calls, reply: reply.mock.calls });
    for (const sentinel of Object.values(sentinels)) {
      expect(observableOutput).not.toContain(sentinel);
    }
    expect(reply.mock.calls[0]?.[1]).toEqual({
      code: "INTERNAL_ERROR",
      message: "服务器内部错误",
      data: null,
    });
    expect(logger).toHaveBeenCalledOnce();
  });
});

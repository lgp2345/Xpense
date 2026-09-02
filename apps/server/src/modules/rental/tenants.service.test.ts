import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { TenantsService } from "./tenants.service.js";
import { TenantsPolicyService } from "./tenants-policy.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

const sensitiveIdentity = {
  documentNumber: "110101199001011234",
  birthDate: "1990-01-01",
  gender: "male" as const,
  ethnicity: "汉",
  documentAddress: "北京市东城区",
};

function tenantRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    organizationId: "organization-1",
    type: "individual" as const,
    name: "张三",
    phone: "13800000000",
    email: "zhang@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    documentNumberLookupHash: "document-hash",
    maskedDocumentNumber: "**************1234",
    sensitiveIdentityCiphertext: Buffer.from("ciphertext"),
    sensitiveIdentityKeyVersion: 1,
    isActive: true,
    note: "按时付款",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    contractCount: 2,
    ...overrides,
  };
}

function createHarness() {
  const transaction = { kind: "transaction" };
  const current = tenantRecord();
  const repository = {
    list: vi.fn().mockResolvedValue({
      items: [{ ...current, contractCount: 2 }],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
    findActiveOwned: vi.fn().mockResolvedValue(current),
    findActiveOwnedForUpdate: vi.fn().mockResolvedValue(current),
    findDocumentConflict: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(current),
    update: vi.fn().mockResolvedValue(current),
    setStatus: vi.fn().mockImplementation(async (input) => tenantRecord(input)),
    hasContractReference: vi.fn().mockResolvedValue(false),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
  const policy = new TenantsPolicyService(repository as never);
  const crypto = {
    lookupHash: vi.fn().mockReturnValue("document-hash"),
    encrypt: vi.fn().mockReturnValue(Buffer.from("new-ciphertext")),
    decrypt: vi.fn().mockReturnValue(sensitiveIdentity),
  };
  const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  const transactions = {
    run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
  };
  const service = new TenantsService(
    repository as never,
    policy,
    crypto as never,
    auditService as never,
    transactions as never,
  );

  return { auditService, crypto, current, repository, service, transaction, transactions };
}
describe("TenantsService", () => {
  it("returns scoped ordinary responses with only a masked document number", async () => {
    const { repository, service } = createHarness();

    const page = await service.list(authContext, { page: 1, pageSize: 20 });
    const detail = await service.detail(authContext, { id: "tenant-1" });

    expect(page).toEqual({
      items: [
        expect.objectContaining({ id: "tenant-1", maskedDocumentNumber: "**************1234" }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(detail).toEqual(
      expect.objectContaining({
        id: "tenant-1",
        maskedDocumentNumber: "**************1234",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }),
    );
    expect(detail).not.toHaveProperty("documentNumber");
    expect(detail).not.toHaveProperty("birthDate");
    expect(detail).not.toHaveProperty("sensitiveIdentityCiphertext");
    expect(repository.findActiveOwned).toHaveBeenCalledWith("organization-1", "tenant-1");
  });

  it("persists the derived mask and maps it without decrypting ordinary reads", async () => {
    const { crypto, repository, service } = createHarness();
    crypto.decrypt.mockImplementation(() => {
      throw new Error("ordinary reads must not decrypt identity");
    });

    await service.create(authContext, {
      type: "individual",
      name: "张三",
      documentCountryCode: "CN",
      documentType: "national_id",
      documentNumber: "110101199001011234",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ maskedDocumentNumber: "**************1234" }),
      expect.anything(),
    );
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing, soft-deleted, or cross-organization tenant", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwned.mockResolvedValue(null);

    await expect(service.detail(authContext, { id: "foreign-tenant" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.revealSensitive(authContext, { id: "deleted-tenant" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("atomically normalizes, hashes, encrypts, creates, and audits without plaintext metadata", async () => {
    const { auditService, crypto, repository, service, transaction, transactions } =
      createHarness();

    await service.create(authContext, {
      type: "individual",
      name: "张三",
      documentCountryCode: "CN",
      documentType: "national_id",
      documentNumber: " 110101 19900101 1234 ",
      birthDate: "1990-01-01",
      gender: "male",
      ethnicity: "汉",
      documentAddress: "北京市东城区",
      note: "按时付款",
    });

    const normalized = { ...sensitiveIdentity, documentNumber: "110101199001011234" };
    expect(transactions.run).toHaveBeenCalledOnce();
    expect(crypto.lookupHash).toHaveBeenCalledWith("organization-1", {
      countryCode: "CN",
      type: "national_id",
      documentNumber: "110101199001011234",
    });
    expect(crypto.encrypt).toHaveBeenCalledWith(normalized);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        documentNumberLookupHash: "document-hash",
        sensitiveIdentityCiphertext: Buffer.from("new-ciphertext"),
        sensitiveIdentityKeyVersion: 1,
      }),
      transaction,
    );
    const persisted = repository.create.mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty("documentNumber");
    expect(persisted).not.toHaveProperty("birthDate");
    const auditInput = auditService.appendRequired.mock.calls[0]?.[0];
    expect(JSON.stringify(auditInput?.metadata)).not.toContain("110101");
    expect(JSON.stringify(auditInput?.metadata)).not.toContain("北京市东城区");
    expect(auditService.appendRequired).toHaveBeenCalledWith(expect.anything(), transaction);
  });

  it("atomically merges an update, re-encrypts identity, and rejects invalid merged fields", async () => {
    const valid = createHarness();
    await valid.service.update(authContext, {
      id: "tenant-1",
      documentNumber: " 110101 19900101 5678 ",
      phone: null,
    });
    expect(valid.repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tenant-1",
        phone: null,
        documentNumberLookupHash: "document-hash",
        sensitiveIdentityCiphertext: Buffer.from("new-ciphertext"),
      }),
      valid.transaction,
    );
    expect(valid.crypto.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: "110101199001015678" }),
    );

    const invalid = createHarness();
    await expect(
      invalid.service.update(authContext, { id: "tenant-1", type: "company" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(invalid.repository.update).not.toHaveBeenCalled();
  });

  it("maps preflight and concurrent duplicate document hashes to 409", async () => {
    const preflight = createHarness();
    preflight.repository.findDocumentConflict.mockResolvedValue({ id: "tenant-2" });
    await expect(
      preflight.service.create(authContext, {
        type: "individual",
        name: "李四",
        documentCountryCode: "CN",
        documentType: "national_id",
        documentNumber: "110101199001011234",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(preflight.repository.create).not.toHaveBeenCalled();

    const concurrent = createHarness();
    concurrent.repository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "rental_tenants_active_document_hash_unique",
      }),
    );
    await expect(
      concurrent.service.create(authContext, {
        type: "individual",
        name: "李四",
        documentCountryCode: "CN",
        documentType: "national_id",
        documentNumber: "110101199001011234",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("changes status in a transaction and returns the inactive ordinary detail", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    repository.findActiveOwned.mockResolvedValue(tenantRecord({ isActive: false }));

    await expect(
      service.setStatus(authContext, { id: "tenant-1", isActive: false }),
    ).resolves.toEqual(expect.objectContaining({ id: "tenant-1", isActive: false }));
    expect(repository.setStatus).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "tenant-1",
        isActive: false,
        updatedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { isActive: false } }),
      transaction,
    );
  });

  it("keeps repeated status requests free of writes, audit, and updatedAt changes", async () => {
    const { auditService, repository, service } = createHarness();
    const inactive = tenantRecord({ isActive: false });
    repository.findActiveOwnedForUpdate.mockResolvedValue(inactive);
    repository.findActiveOwned.mockResolvedValue(inactive);

    const first = await service.setStatus(authContext, { id: "tenant-1", isActive: false });
    const retry = await service.setStatus(authContext, { id: "tenant-1", isActive: false });

    expect(first.updatedAt).toBe("2026-08-21T00:00:00.000Z");
    expect(retry.updatedAt).toBe(first.updatedAt);
    expect(repository.setStatus).not.toHaveBeenCalled();
    expect(auditService.appendRequired).not.toHaveBeenCalled();
  });

  it("rejects referenced deletion with 409 and soft-deletes an unreferenced tenant", async () => {
    const referenced = createHarness();
    referenced.repository.hasContractReference.mockResolvedValue(true);
    await expect(referenced.service.delete(authContext, { id: "tenant-1" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(referenced.repository.softDelete).not.toHaveBeenCalled();

    const clear = createHarness();
    await clear.service.delete(authContext, { id: "tenant-1" });
    expect(clear.repository.softDelete).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "tenant-1",
        deletedByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      clear.transaction,
    );
  });

  it("audits before decrypting sensitive data even without a permission in the service context", async () => {
    const { auditService, crypto, service } = createHarness();

    await expect(service.revealSensitive(authContext, { id: "tenant-1" })).resolves.toEqual({
      tenantId: "tenant-1",
      ...sensitiveIdentity,
    });
    expect(auditService.appendRequired.mock.invocationCallOrder[0]).toBeLessThan(
      crypto.decrypt.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(JSON.stringify(auditService.appendRequired.mock.calls[0]?.[0]?.metadata)).not.toContain(
      "110101",
    );
  });

  it("blocks decryption and data return when required sensitive audit fails", async () => {
    const { auditService, crypto, service } = createHarness();
    auditService.appendRequired.mockRejectedValue(new Error("audit failed"));

    await expect(service.revealSensitive(authContext, { id: "tenant-1" })).rejects.toThrow(
      "audit failed",
    );
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });
});

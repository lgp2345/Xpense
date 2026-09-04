import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ContractPartiesService } from "./contract-parties.service.js";

const auth = {
  organizationId: "organization-1",
  userId: "user-1",
  sessionId: "session-1",
  isSuperAdmin: false,
  permissions: [],
};
const transaction = { kind: "transaction" };

describe("ContractPartiesService", () => {
  function changeHarness(auditFailure?: Error) {
    type PartyRef = { tenantId: string; isPrimaryPayer: boolean };
    const contract = {
      id: "contract-1",
      organizationId: auth.organizationId,
      propertyId: "property-1",
      contractNumber: "RC-2026-000001",
      status: "confirmed" as const,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      terminationDate: null,
      rentAmountMinor: 100,
      billingAnchor: "calendar_month" as const,
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
      externalContractNumber: null,
      renewedFromContractId: null,
      cancellationReason: null,
      terminationReason: null,
      note: null,
      updatedAt: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      lifecycleStatus: "confirmed" as const,
      displayStatus: "active" as const,
      actualEndDate: "2026-12-31",
      propertyName: "房产",
      tenantNames: ["租户"],
      spaceNames: ["空间"],
      spaces: [
        {
          spaceId: "space-1",
          spaceName: "空间",
          spaceCode: null,
          spacePath: [],
          rentAllocationMinor: null,
        },
      ],
      parties: [
        {
          tenantId: "tenant-1",
          tenantType: "individual" as const,
          tenantName: "租户",
          phone: null,
          email: null,
          primaryContactName: null,
          primaryContactPhone: null,
          documentCountryCode: null,
          documentType: null,
          documentTypeOtherName: null,
          validFrom: "2026-01-01",
          validTo: "2026-12-31",
          isPrimaryPayer: true,
        },
      ],
      depositTerms: [],
      hasScheduledTermination: false,
    };
    let committedPeriods: PartyRef[] = [{ tenantId: "tenant-1", isPrimaryPayer: true }];
    let pendingPeriods = committedPeriods;
    let committedChanges = 0;
    let pendingChanges = 0;
    const relations = {
      replacePartyPeriods: vi.fn(async (input: { parties: PartyRef[] }) => {
        pendingPeriods = input.parties;
      }),
      appendChange: vi.fn(async () => {
        pendingChanges += 1;
      }),
    };
    const audit = {
      appendRequired: auditFailure
        ? vi.fn().mockRejectedValue(auditFailure)
        : vi.fn().mockResolvedValue(undefined),
    };
    const repository = {
      find: vi.fn().mockResolvedValue(contract),
      findForUpdate: vi.fn().mockResolvedValue(contract),
      detail: vi.fn().mockResolvedValue(contract),
    };
    const policy = {
      lockOrganizationContext: vi
        .fn()
        .mockResolvedValue({ today: "2026-08-31", timezone: "Asia/Shanghai" }),
      requireContract: vi.fn((value: unknown) => value),
      requireOwnedPropertyForUpdate: vi
        .fn()
        .mockResolvedValue({ id: "property-1", isActive: true }),
      validateDraftRelations: vi.fn().mockResolvedValue(undefined),
      conflict: vi.fn((message: string) => new Error(message)),
    };
    const transactions = {
      run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) => {
        pendingPeriods = committedPeriods.map((party) => ({ ...party }));
        pendingChanges = committedChanges;
        try {
          const result = await operation(transaction);
          committedPeriods = pendingPeriods.map((party) => ({ ...party }));
          committedChanges = pendingChanges;
          return result;
        } catch (error) {
          pendingPeriods = committedPeriods;
          pendingChanges = committedChanges;
          throw error;
        }
      }),
    };
    return {
      audit,
      policy,
      relations,
      repository,
      committed: () => ({ periods: committedPeriods, changes: committedChanges }),
      service: new ContractPartiesService(
        repository as never,
        relations as never,
        policy as never,
        {} as never,
        audit as never,
        transactions as never,
      ),
    };
  }

  it("replaces effective party periods and writes audit metadata without reason", async () => {
    const setup = changeHarness();
    await setup.service.changeParties(auth, {
      id: "contract-1",
      effectiveDate: "2026-06-01",
      reason: "业务变更",
      parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
    } as never);
    expect(setup.relations.replacePartyPeriods).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveDate: "2026-06-01",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      }),
      transaction,
    );
    expect(setup.audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }] },
      }),
      transaction,
    );
    expect(JSON.stringify(setup.audit.appendRequired.mock.calls[0]?.[0]?.metadata)).not.toContain(
      "业务变更",
    );
    expect(setup.committed()).toEqual({
      periods: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      changes: 1,
    });
  });

  it("rolls back party replacement when required audit fails", async () => {
    const auditFailure = new Error("audit unavailable");
    const setup = changeHarness(auditFailure);
    await expect(
      setup.service.changeParties(auth, {
        id: "contract-1",
        effectiveDate: "2026-06-01",
        reason: "不会提交",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      } as never),
    ).rejects.toBe(auditFailure);
    expect(setup.relations.replacePartyPeriods).toHaveBeenCalled();
    expect(setup.committed()).toEqual({
      periods: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
      changes: 0,
    });
  });

  it("does not commit party periods when the typed change write fails", async () => {
    const setup = changeHarness();
    const failure = new Error("change record unavailable");
    setup.relations.appendChange.mockRejectedValue(failure);

    await expect(
      setup.service.changeParties(auth, {
        id: "contract-1",
        effectiveDate: "2026-06-01",
        reason: "不会提交",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      } as never),
    ).rejects.toBe(failure);
    expect(setup.committed()).toEqual({
      periods: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
      changes: 0,
    });
    expect(setup.audit.appendRequired).not.toHaveBeenCalled();
  });

  it("audits an exact historical snapshot before decrypting it", async () => {
    const audit = { appendRequired: vi.fn().mockResolvedValue(undefined) };
    const crypto = {
      decrypt: vi.fn().mockReturnValue({
        documentNumber: "A-1",
        birthDate: null,
        gender: null,
        ethnicity: null,
        documentAddress: null,
      }),
    };
    const relations = {
      findPartySensitiveSnapshot: vi.fn().mockResolvedValue({
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        identitySnapshotCiphertext: Buffer.from("ciphertext"),
        identitySnapshotKeyVersion: 1,
      }),
    };
    const transactions = {
      run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new ContractPartiesService(
      {} as never,
      relations as never,
      {} as never,
      crypto as never,
      audit as never,
      transactions as never,
    );

    await expect(
      service.revealSensitive(auth, {
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
      } as never),
    ).resolves.toMatchObject({ documentNumber: "A-1" });
    expect(relations.findPartySensitiveSnapshot).toHaveBeenCalledWith(
      {
        organizationId: auth.organizationId,
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
      },
      transaction,
    );
    expect(audit.appendRequired.mock.invocationCallOrder[0]).toBeLessThan(
      crypto.decrypt.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not decrypt when the exact historical snapshot is absent", async () => {
    const audit = { appendRequired: vi.fn() };
    const crypto = { decrypt: vi.fn() };
    const relations = { findPartySensitiveSnapshot: vi.fn().mockResolvedValue(null) };
    const transactions = {
      run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new ContractPartiesService(
      {} as never,
      relations as never,
      {} as never,
      crypto as never,
      audit as never,
      transactions as never,
    );

    await expect(
      service.revealSensitive(auth, {
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.appendRequired).not.toHaveBeenCalled();
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });

  it("does not decrypt when the required reveal audit fails", async () => {
    const auditFailure = new Error("audit unavailable");
    const audit = { appendRequired: vi.fn().mockRejectedValue(auditFailure) };
    const crypto = { decrypt: vi.fn() };
    const relations = {
      findPartySensitiveSnapshot: vi.fn().mockResolvedValue({
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        identitySnapshotCiphertext: Buffer.from("ciphertext"),
        identitySnapshotKeyVersion: 1,
      }),
    };
    const transactions = {
      run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new ContractPartiesService(
      {} as never,
      relations as never,
      {} as never,
      crypto as never,
      audit as never,
      transactions as never,
    );

    await expect(
      service.revealSensitive(auth, {
        contractId: "contract-1",
        tenantId: "tenant-1",
        validFrom: "2026-01-01",
      } as never),
    ).rejects.toBe(auditFailure);
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });
});

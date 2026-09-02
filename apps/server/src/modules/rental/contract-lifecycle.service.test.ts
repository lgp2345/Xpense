import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ContractLifecycleService } from "./contract-lifecycle.service.js";

const auth = {
  organizationId: "organization-1",
  userId: "user-1",
  sessionId: "session-1",
  isSuperAdmin: false,
  permissions: [],
};
const transaction = {};
const timestamp = new Date("2026-08-30T00:00:00.000Z");

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    organizationId: auth.organizationId,
    propertyId: "property-1",
    contractNumber: "RC-2026-000001",
    status: "draft",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    rentAmountMinor: 800_000,
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 1,
    dueDaysBefore: 5,
    terminationDate: null,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...contract(overrides),
    lifecycleStatus: overrides.status ?? "draft",
    spaces: [{ spaceId: "space-1", rentAllocationMinor: null }],
    parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
    depositTerms: [],
    updatedAt: timestamp,
    createdAt: timestamp,
  };
}

function harness(record = contract()) {
  type PersistedState = { lifecycleWrites: number; snapshotWrites: number; audits: number };
  let committed: PersistedState = { lifecycleWrites: 0, snapshotWrites: 0, audits: 0 };
  let pending: PersistedState | null = null;
  let committedDrafts = 0;
  let pendingDrafts = 0;
  let committedActions: Array<Record<string, unknown>> = [];
  let pendingActions: Array<Record<string, unknown>> = [];
  let committedStatus = record.status;
  let pendingStatus: typeof committedStatus | null = null;
  const recordWrite = (field: keyof PersistedState) => {
    if (!pending) throw new Error("write outside transaction");
    pending[field] += 1;
  };
  const repository = {
    find: vi.fn().mockResolvedValue(record),
    findForUpdate: vi.fn().mockResolvedValue(record),
    detail: vi.fn().mockResolvedValue(detail({ status: record.status })),
    nextContractNumber: vi.fn().mockResolvedValue("RC-2026-000002"),
    createDraft: vi.fn(async (input: Record<string, unknown>) => {
      if (!pending) throw new Error("write outside transaction");
      pendingDrafts += 1;
      return {
        ...record,
        id: "draft-1",
        status: "draft",
        startDate: input.startDate,
        endDate: input.endDate,
      };
    }),
    setLifecycle: vi.fn(async (input: { status: string }) => {
      recordWrite("lifecycleWrites");
      pendingStatus = input.status as typeof committedStatus;
      return { ...record, status: input.status };
    }),
  };
  const relations = {
    confirmSnapshots: vi.fn(async () => recordWrite("snapshotWrites")),
    clipPartyPeriodsToActualEnd: vi.fn(),
    restoreTerminalPartyPeriods: vi.fn(),
    copyTerminalPartySetToDraft: vi.fn(),
    appendTerminationRevocation: vi.fn(async (input: Record<string, unknown>) => {
      if (!pending) throw new Error("write outside transaction");
      pendingActions.push({ ...input });
    }),
    replaceDraftSpaces: vi.fn(),
    replaceDraftDeposits: vi.fn(),
  };
  const policy = {
    lockOrganizationContext: vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Shanghai", today: "2026-08-30" }),
    requireContract: vi.fn((value: unknown) => {
      if (!value) throw new NotFoundException();
      return value;
    }),
    requireOwnedPropertyForUpdate: vi.fn().mockResolvedValue({ id: "property-1", isActive: true }),
    requireActivePropertyForUpdate: vi.fn().mockResolvedValue({ id: "property-1", isActive: true }),
    validateConfirmationScope: vi.fn().mockResolvedValue({}),
    validateDraftRelations: vi.fn().mockResolvedValue({}),
    validateRenewalRelations: vi.fn().mockResolvedValue({}),
    checkSpaceAvailability: vi.fn().mockResolvedValue([]),
    assertLifecycle: vi.fn((value: { status: string }, expected: string) => {
      if (value.status !== expected) throw new ConflictException();
    }),
    assertCancellationAllowed: vi.fn(),
    conflict: vi.fn((message: string) => new ConflictException(message)),
  };
  const audit = { appendRequired: vi.fn(async () => recordWrite("audits")) };
  const transactions = {
    run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) => {
      pending = { ...committed };
      pendingDrafts = committedDrafts;
      pendingActions = committedActions.map((action) => ({ ...action }));
      pendingStatus = committedStatus;
      try {
        const result = await operation(transaction);
        committed = { ...(pending as PersistedState) };
        committedDrafts = pendingDrafts;
        committedActions = pendingActions.map((action) => ({ ...action }));
        committedStatus = pendingStatus;
        return result;
      } finally {
        pending = null;
      }
    }),
  };
  const service = new ContractLifecycleService(
    repository as never,
    relations as never,
    policy as never,
    audit as never,
    transactions as never,
  );
  return {
    service,
    repository,
    relations,
    policy,
    audit,
    persisted: () => ({ ...committed }),
    status: () => committedStatus,
    drafts: () => committedDrafts,
    actions: () => committedActions.map((action) => ({ ...action })),
  };
}

describe("ContractLifecycleService", () => {
  it("confirms atomically in organization, property, contract, relations lock order and snapshots parties", async () => {
    const { service, repository, relations, policy, audit, persisted } = harness();

    await service.confirm(auth, { id: "contract-1" } as never);

    expect(policy.lockOrganizationContext).toHaveBeenCalledWith(auth.organizationId, transaction);
    expect(policy.requireActivePropertyForUpdate).toHaveBeenCalledWith(
      auth.organizationId,
      "property-1",
      transaction,
    );
    expect(repository.findForUpdate).toHaveBeenCalledWith(
      auth.organizationId,
      "contract-1",
      transaction,
    );
    expect(policy.lockOrganizationContext.mock.invocationCallOrder[0]).toBeLessThan(
      policy.requireActivePropertyForUpdate.mock.invocationCallOrder[0] ?? 0,
    );
    expect(policy.requireActivePropertyForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findForUpdate.mock.invocationCallOrder[0] ?? 0,
    );
    expect(repository.findForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      policy.validateConfirmationScope.mock.invocationCallOrder[0] ?? 0,
    );
    expect(relations.confirmSnapshots).toHaveBeenCalledWith(
      { organizationId: auth.organizationId, contractId: "contract-1" },
      transaction,
    );
    expect(repository.setLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "contract-1", status: "confirmed" }),
      transaction,
    );
    expect(audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rental_contract.confirmed" }),
      transaction,
    );
    expect(persisted()).toEqual({ lifecycleWrites: 1, snapshotWrites: 1, audits: 1 });
  });

  it("rejects confirming an invalid lifecycle status with 409", async () => {
    const { service, repository, relations } = harness(contract({ status: "confirmed" }));
    await expect(service.confirm(auth, { id: "contract-1" } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(relations.confirmSnapshots).not.toHaveBeenCalled();
    expect(repository.setLifecycle).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-organization or soft-deleted contract", async () => {
    const { service, repository, policy } = harness();
    repository.find.mockResolvedValue(null);
    policy.requireContract.mockImplementation(() => {
      throw new NotFoundException();
    });
    await expect(service.confirm(auth, { id: "contract-1" } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("cancels only a confirmed contract before organization-local start", async () => {
    const confirmed = contract({ status: "confirmed" });
    const { service, repository, policy, audit, persisted } = harness(confirmed);

    await service.cancel(auth, { id: "contract-1", reason: "计划有变" } as never);

    expect(policy.requireOwnedPropertyForUpdate).toHaveBeenCalledWith(
      auth.organizationId,
      "property-1",
      transaction,
    );
    expect(policy.requireActivePropertyForUpdate).not.toHaveBeenCalled();
    expect(policy.assertCancellationAllowed).toHaveBeenCalledWith(confirmed, "2026-08-30");
    expect(repository.setLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelledByUserId: auth.userId,
        cancellationReason: "计划有变",
      }),
      transaction,
    );
    expect(audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rental_contract.cancelled", metadata: {} }),
      transaction,
    );
    expect(persisted()).toEqual({ lifecycleWrites: 1, snapshotWrites: 0, audits: 1 });
  });

  it("cancels a pre-start confirmed contract even when its owned property is inactive", async () => {
    const confirmed = contract({ status: "confirmed" });
    const setup = harness(confirmed);
    setup.policy.requireOwnedPropertyForUpdate.mockResolvedValue({
      id: "property-1",
      isActive: false,
    });

    await expect(
      setup.service.cancel(auth, { id: "contract-1", reason: "房产停用后归档" } as never),
    ).resolves.toMatchObject({ id: "contract-1" });
    expect(setup.policy.assertCancellationAllowed).toHaveBeenCalledWith(confirmed, "2026-08-30");
    expect(setup.repository.setLifecycle).toHaveBeenCalled();
  });

  it("returns 404 for a cross-organization property before locking a cancellation target", async () => {
    const setup = harness(contract({ status: "confirmed" }));
    setup.policy.requireOwnedPropertyForUpdate.mockRejectedValue(new NotFoundException());

    await expect(
      setup.service.cancel(auth, { id: "contract-1", reason: "不会写入" } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(setup.repository.findForUpdate).not.toHaveBeenCalled();
    expect(setup.repository.setLifecycle).not.toHaveBeenCalled();
  });

  it("propagates confirmation audit failure before the transaction can commit", async () => {
    const failure = new Error("audit failed");
    const setup = harness();
    setup.audit.appendRequired.mockRejectedValue(failure);
    await expect(setup.service.confirm(auth, { id: "contract-1" } as never)).rejects.toBe(failure);
    expect(setup.persisted()).toEqual({ lifecycleWrites: 0, snapshotWrites: 0, audits: 0 });
  });

  it("rolls back lifecycle status when cancellation audit fails", async () => {
    const confirmed = contract({ status: "confirmed" });
    const setup = harness(confirmed);
    const auditFailure = new Error("audit failed");
    setup.audit.appendRequired.mockRejectedValue(auditFailure);

    await expect(
      setup.service.cancel(auth, { id: "contract-1", reason: "不会提交" } as never),
    ).rejects.toBe(auditFailure);
    expect(setup.status()).toBe("confirmed");
    expect(setup.persisted()).toEqual({ lifecycleWrites: 0, snapshotWrites: 0, audits: 0 });
  });

  it("terminates a confirmed contract on its requested last occupied day", async () => {
    const confirmed = contract({ status: "confirmed", startDate: "2026-01-01" });
    const setup = harness(confirmed);

    await setup.service.terminate(auth, {
      id: "contract-1",
      terminationDate: "2027-01-01",
      reason: "提前退租",
    } as never);

    expect(setup.repository.setLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "terminated",
        terminationDate: "2027-01-01",
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
      transaction,
    );
  });

  it("rejects terminating a contract before its organization-local start date", async () => {
    const setup = harness(contract({ status: "confirmed", startDate: "2026-09-01" }));

    await expect(
      setup.service.terminate(auth, {
        id: "contract-1",
        terminationDate: "2026-09-02",
        reason: "尚未开始",
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(setup.repository.setLifecycle).not.toHaveBeenCalled();
    expect(setup.relations.clipPartyPeriodsToActualEnd).not.toHaveBeenCalled();
  });

  it.each([
    "2026-01-15",
    "2026-08-30",
    "2027-01-01",
  ])("accepts termination date %s when the contract has already started", async (terminationDate) => {
    const setup = harness(contract({ status: "confirmed", startDate: "2026-01-01" }));

    await expect(
      setup.service.terminate(auth, {
        id: "contract-1",
        terminationDate,
        reason: "提前退租",
      } as never),
    ).resolves.toBeDefined();
    expect(setup.repository.setLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ terminationDate }),
      transaction,
    );
  });

  it("rejects termination on the nominal end date", async () => {
    const setup = harness(contract({ status: "confirmed", startDate: "2026-01-01" }));

    await expect(
      setup.service.terminate(auth, {
        id: "contract-1",
        terminationDate: "2027-08-31",
        reason: "不可用",
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("bases a default renewal end date on the source actual end after early termination", async () => {
    const terminated = contract({
      status: "terminated",
      startDate: "2026-01-01",
      terminationDate: "2027-01-01",
      terminationRecordedAt: timestamp,
      terminatedByUserId: auth.userId,
      terminationReason: "提前退租",
    });
    const setup = harness(terminated);

    await setup.service.renew(auth, { id: "contract-1" } as never);

    expect(setup.repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2027-01-02",
        endDate: "2028-01-01",
      }),
      transaction,
    );
    expect(setup.drafts()).toBe(1);
    expect(setup.relations.copyTerminalPartySetToDraft).toHaveBeenCalledWith(
      expect.objectContaining({ validFrom: "2027-01-02", validTo: "2028-01-01" }),
      transaction,
    );
  });

  it.each([
    "2026-08-30",
    "2026-08-29",
  ])("rejects revocation when termination date is %s and commits no writes", async (terminationDate) => {
    const setup = harness(
      contract({
        status: "terminated",
        startDate: "2026-01-01",
        terminationDate,
        terminationRecordedAt: timestamp,
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
    );

    await expect(
      setup.service.revokeTermination(auth, { id: "contract-1", reason: "恢复" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(setup.status()).toBe("terminated");
    expect(setup.persisted()).toEqual({ lifecycleWrites: 0, snapshotWrites: 0, audits: 0 });
    expect(setup.relations.restoreTerminalPartyPeriods).not.toHaveBeenCalled();
  });

  it("rejects revocation when a successor occupies the restored tail", async () => {
    const setup = harness(
      contract({
        status: "terminated",
        startDate: "2026-01-01",
        terminationDate: "2026-08-31",
        terminationRecordedAt: timestamp,
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
    );
    setup.policy.checkSpaceAvailability.mockResolvedValue([{ contractId: "successor-1" }]);

    await expect(
      setup.service.revokeTermination(auth, { id: "contract-1", reason: "恢复" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(setup.relations.restoreTerminalPartyPeriods).not.toHaveBeenCalled();
    expect(setup.repository.setLifecycle).not.toHaveBeenCalled();
    expect(setup.audit.appendRequired).not.toHaveBeenCalled();
    expect(setup.status()).toBe("terminated");
  });

  it("restores a future termination atomically and clears lifecycle fields", async () => {
    const setup = harness(
      contract({
        status: "terminated",
        startDate: "2026-01-01",
        terminationDate: "2026-09-15",
        terminationRecordedAt: timestamp,
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
    );

    await setup.service.revokeTermination(auth, { id: "contract-1", reason: "  恢复  " } as never);

    expect(setup.relations.restoreTerminalPartyPeriods).toHaveBeenCalledWith(
      {
        organizationId: auth.organizationId,
        contractId: "contract-1",
        terminatedAt: "2026-09-15",
        originalEnd: "2027-08-31",
      },
      transaction,
    );
    expect(setup.repository.setLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "confirmed",
        terminationDate: null,
        terminationReason: null,
      }),
      transaction,
    );
    expect(setup.actions()).toEqual([
      {
        organizationId: auth.organizationId,
        contractId: "contract-1",
        reason: "恢复",
        terminationDateBeforeRevoke: "2026-09-15",
        createdByUserId: auth.userId,
      },
    ]);
    const auditCalls = setup.audit.appendRequired.mock.calls as unknown as Array<
      [{ metadata?: Record<string, unknown> }]
    >;
    const auditMetadata = auditCalls.at(-1)?.[0]?.metadata;
    expect(auditMetadata).not.toHaveProperty("reason");
    expect(JSON.stringify(auditMetadata)).not.toContain("恢复");
    expect(setup.status()).toBe("confirmed");
    expect(setup.persisted()).toEqual({ lifecycleWrites: 1, snapshotWrites: 0, audits: 1 });
  });

  it("rolls back revocation lifecycle when the required audit fails", async () => {
    const setup = harness(
      contract({
        status: "terminated",
        startDate: "2026-01-01",
        terminationDate: "2026-09-15",
        terminationRecordedAt: timestamp,
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
    );
    const failure = new Error("revoke audit failed");
    setup.audit.appendRequired.mockRejectedValue(failure);

    await expect(
      setup.service.revokeTermination(auth, { id: "contract-1", reason: "恢复" } as never),
    ).rejects.toBe(failure);
    expect(setup.status()).toBe("terminated");
    expect(setup.actions()).toEqual([]);
    expect(setup.persisted()).toEqual({ lifecycleWrites: 0, snapshotWrites: 0, audits: 0 });
  });

  it("rolls back contract and party restoration when the typed action write fails", async () => {
    const setup = harness(
      contract({
        status: "terminated",
        startDate: "2026-01-01",
        terminationDate: "2026-09-15",
        terminationRecordedAt: timestamp,
        terminatedByUserId: auth.userId,
        terminationReason: "提前退租",
      }),
    );
    const failure = new Error("action write failed");
    setup.relations.appendTerminationRevocation.mockRejectedValue(failure);

    await expect(
      setup.service.revokeTermination(auth, {
        id: "contract-1",
        reason: "  恢复原因  ",
      } as never),
    ).rejects.toBe(failure);
    expect(setup.status()).toBe("terminated");
    expect(setup.actions()).toEqual([]);
    expect(setup.audit.appendRequired).not.toHaveBeenCalled();
  });

  it("rolls back a renewed draft when terminal snapshot copying fails", async () => {
    const setup = harness(
      contract({
        status: "confirmed",
        startDate: "2026-01-01",
        endDate: "2026-08-31",
      }),
    );
    const failure = new Error("snapshot copy failed");
    setup.relations.copyTerminalPartySetToDraft.mockRejectedValue(failure);

    await expect(setup.service.renew(auth, { id: "contract-1" } as never)).rejects.toBe(failure);
    expect(setup.drafts()).toBe(0);
    expect(setup.audit.appendRequired).not.toHaveBeenCalled();
  });

  it("rejects renewal conflicts before creating a draft", async () => {
    const setup = harness(contract({ status: "confirmed", startDate: "2026-01-01" }));
    setup.policy.checkSpaceAvailability.mockResolvedValue([{ contractId: "successor-1" }]);

    await expect(setup.service.renew(auth, { id: "contract-1" } as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(setup.repository.createDraft).not.toHaveBeenCalled();
    expect(setup.drafts()).toBe(0);
  });
});

import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ContractsService } from "./contracts.service.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";

const auth = {
  organizationId: "organization-1",
  userId: "user-1",
  sessionId: "session-1",
  isSuperAdmin: false,
  permissions: [],
};
const transaction = { execute: vi.fn().mockResolvedValue([]) };
const now = new Date("2026-08-30T00:00:00.000Z");

function contractRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    organizationId: auth.organizationId,
    propertyId: "property-1",
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    status: "draft",
    startDate: null,
    endDate: null,
    rentAmountMinor: null,
    billingAnchor: null,
    paymentIntervalMonths: null,
    dueDaysBefore: null,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: null,
    createdByUserId: auth.userId,
    updatedByUserId: auth.userId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function contractDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    propertyId: "property-1",
    propertyName: "阳光公寓",
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    lifecycleStatus: "draft",
    displayStatus: "draft",
    startDate: null,
    endDate: null,
    actualEndDate: null,
    rentAmountMinor: null,
    tenantNames: [],
    spaceNames: [],
    updatedAt: now,
    billingAnchor: null,
    paymentIntervalMonths: null,
    dueDaysBefore: null,
    hasScheduledTermination: false,
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: null,
    spaces: [],
    parties: [],
    depositTerms: [],
    createdAt: now,
    ...overrides,
  };
}

function serviceHarness(overrides: Record<string, unknown> = {}) {
  type PersistedState = {
    headers: number;
    relations: number;
    softDeletes: number;
    audits: number;
    headerRentAmountMinor: number | null;
    partyTenantIds: string[];
    spaceIds: string[];
  };
  let committed: PersistedState = {
    headers: 0,
    relations: 0,
    softDeletes: 0,
    audits: 0,
    headerRentAmountMinor: null,
    partyTenantIds: [],
    spaceIds: [],
  };
  let pending: PersistedState | null = null;
  const getPending = () => {
    if (!pending) throw new Error("write outside transaction");
    return pending;
  };
  const recordWrite = (field: keyof PersistedState) => {
    if (!pending) throw new Error("write outside transaction");
    pending[field] = ((pending[field] as number) + 1) as never;
  };
  const current = contractRecord();
  const detail = contractDetail();
  const repository = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    detail: vi.fn().mockResolvedValue(detail),
    find: vi.fn().mockResolvedValue(current),
    findForUpdate: vi.fn().mockResolvedValue(current),
    nextContractNumber: vi.fn().mockResolvedValue("RC-2026-000001"),
    createDraft: vi.fn(async () => {
      recordWrite("headers");
      return current;
    }),
    updateHeader: vi.fn(async (input: { rentAmountMinor: number | null }) => {
      recordWrite("headers");
      getPending().headerRentAmountMinor = input.rentAmountMinor;
      return current;
    }),
    softDelete: vi.fn(async () => recordWrite("softDeletes")),
  };
  const relations = {
    replaceDraftSpaces: vi.fn(async (input: { spaces: Array<{ spaceId: string }> }) => {
      recordWrite("relations");
      getPending().spaceIds = input.spaces.map(({ spaceId }) => spaceId);
    }),
    replaceDraftParties: vi.fn(async (input: { parties: Array<{ tenantId: string }> }) => {
      recordWrite("relations");
      getPending().partyTenantIds = input.parties.map(({ tenantId }) => tenantId);
    }),
    replaceDraftDeposits: vi.fn(async () => recordWrite("relations")),
    confirmSnapshots: vi.fn(async () => recordWrite("relations")),
  };
  const policy = {
    organizationToday: vi.fn().mockResolvedValue("2026-08-30"),
    lockOrganizationContext: vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Shanghai", today: "2026-08-30" }),
    requireOwnedPropertyForUpdate: vi.fn().mockResolvedValue({ id: "property-1", isActive: true }),
    requireActivePropertyForUpdate: vi.fn().mockResolvedValue({ id: "property-1", isActive: true }),
    assertPropertyActive: vi.fn((property: { isActive: boolean }) => {
      if (!property.isActive) throw new ConflictException();
    }),
    requireContract: vi.fn().mockImplementation((value) => {
      if (!value) throw new NotFoundException();
      return value;
    }),
    assertLifecycle: vi.fn().mockImplementation((value: { status: string }, expected: string) => {
      if (value.status !== expected) throw new ConflictException();
    }),
    validateDraftRelations: vi.fn().mockResolvedValue(undefined),
    validateConfirmationScope: vi.fn().mockResolvedValue({}),
    checkSpaceAvailability: vi.fn().mockResolvedValue([]),
    assertPreStartCorrection: vi.fn(
      (value: { status: string; startDate: string | null }, today: string, changes: object) => {
        if (value.status !== "confirmed" || !value.startDate) throw new ConflictException();
        if (today < value.startDate) return "pre_start";
        const metadataFields = new Set(["id", "externalContractNumber", "note"]);
        if (Object.keys(changes).some((field) => !metadataFields.has(field))) {
          throw new ConflictException();
        }
        return "metadata_only";
      },
    ),
    conflict: vi.fn((message: string) => new ConflictException(message)),
  };
  const audit = { appendRequired: vi.fn(async () => recordWrite("audits")) };
  const transactions = {
    run: vi.fn(async (operation: (executor: unknown) => Promise<unknown>) => {
      pending = { ...committed };
      try {
        const result = await operation(transaction);
        committed = { ...(pending as PersistedState) };
        return result;
      } finally {
        pending = null;
      }
    }),
  };
  Object.assign(repository, overrides.repository);
  Object.assign(relations, overrides.relations);
  Object.assign(policy, overrides.policy);
  Object.assign(audit, overrides.audit);
  const service = new ContractsService(
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
    transactions,
    detail,
    current,
    persisted: () => ({
      headers: committed.headers,
      relations: committed.relations,
      softDeletes: committed.softDeletes,
      audits: committed.audits,
    }),
    state: () => ({
      headerRentAmountMinor: committed.headerRentAmountMinor,
      partyTenantIds: committed.partyTenantIds,
      spaceIds: committed.spaceIds,
    }),
    auth,
  };
}

describe("ContractsService", () => {
  it("maps list/detail timestamps and hides cross-organization or deleted details as 404", async () => {
    const summary = contractDetail();
    const { service, repository } = serviceHarness({
      repository: {
        list: vi.fn().mockResolvedValue({ items: [summary], total: 1, page: 1, pageSize: 20 }),
      },
    });
    await expect(service.list(auth, { page: 1, pageSize: 20 } as never)).resolves.toMatchObject({
      items: [{ updatedAt: now.toISOString() }],
    });
    await expect(service.detail(auth, { id: "contract-1" } as never)).resolves.toMatchObject({
      id: "contract-1",
      createdAt: now.toISOString(),
    });
    repository.detail.mockResolvedValue(null);
    await expect(service.detail(auth, { id: "foreign-contract" } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates a minimal property-only draft with an organization-year number and required audit", async () => {
    const { service, repository, relations, policy, audit, persisted } = serviceHarness();

    await service.create(auth, { propertyId: "property-1" } as never);

    expect(policy.lockOrganizationContext).toHaveBeenCalledWith(auth.organizationId, transaction);
    expect(policy.requireActivePropertyForUpdate).toHaveBeenCalledWith(
      auth.organizationId,
      "property-1",
      transaction,
    );
    expect(repository.nextContractNumber).toHaveBeenCalledWith(
      auth.organizationId,
      2026,
      transaction,
    );
    expect(repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "property-1",
        contractNumber: "RC-2026-000001",
        startDate: null,
        rentAmountMinor: null,
        createdByUserId: auth.userId,
      }),
      transaction,
    );
    expect(relations.replaceDraftSpaces).not.toHaveBeenCalled();
    expect(relations.replaceDraftParties).not.toHaveBeenCalled();
    expect(audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rental_contract.draft_created", targetId: "contract-1" }),
      transaction,
    );
    expect(persisted()).toEqual({ headers: 1, relations: 0, softDeletes: 0, audits: 1 });
  });

  it("replaces every supplied draft relation collection in the same transaction", async () => {
    const { service, relations, repository, persisted } = serviceHarness();
    const dto = {
      id: "contract-1",
      parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      spaces: [{ spaceId: "space-2", rentAllocationMinor: 800_000 }],
      depositTerms: [
        { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 800_000 },
      ],
      rentAmountMinor: 800_000,
    };

    await service.update(auth, dto as never);

    expect(repository.updateHeader).toHaveBeenCalledWith(
      expect.objectContaining({ id: "contract-1", rentAmountMinor: 800_000 }),
      transaction,
    );
    expect(relations.replaceDraftParties).toHaveBeenCalledWith(
      expect.objectContaining({ parties: dto.parties }),
      transaction,
    );
    expect(relations.replaceDraftSpaces).toHaveBeenCalledWith(
      expect.objectContaining({ spaces: dto.spaces }),
      transaction,
    );
    expect(relations.replaceDraftDeposits).toHaveBeenCalledWith(
      expect.objectContaining({ deposits: [expect.objectContaining({ sortOrder: 0 })] }),
      transaction,
    );
    expect(persisted()).toEqual({ headers: 1, relations: 3, softDeletes: 0, audits: 1 });
  });

  it("revalidates and refreshes the full aggregate for a confirmed pre-start correction", async () => {
    const confirmed = contractRecord({
      status: "confirmed",
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      rentAmountMinor: 800_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
    });
    const fullDetail = contractDetail({
      lifecycleStatus: "confirmed",
      displayStatus: "upcoming",
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      actualEndDate: "2027-08-31",
      rentAmountMinor: 800_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
      spaces: [{ spaceId: "space-1", rentAllocationMinor: null }],
      parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
    });
    const { service, repository, relations, policy, audit } = serviceHarness({
      repository: {
        find: vi.fn().mockResolvedValue(confirmed),
        findForUpdate: vi.fn().mockResolvedValue(confirmed),
        detail: vi.fn().mockResolvedValue(fullDetail),
      },
    });

    await service.update(auth, { id: "contract-1", rentAmountMinor: 900_000 } as never);

    expect(policy.requireOwnedPropertyForUpdate).toHaveBeenCalledWith(
      auth.organizationId,
      "property-1",
      transaction,
    );
    expect(policy.requireOwnedPropertyForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findForUpdate.mock.invocationCallOrder[0] ?? 0,
    );
    expect(policy.assertPropertyActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "property-1" }),
    );
    expect(policy.validateConfirmationScope).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "contract-1", rentAmountMinor: 900_000 }),
      transaction,
    );
    expect(relations.replaceDraftSpaces).toHaveBeenCalled();
    expect(relations.replaceDraftParties).toHaveBeenCalled();
    expect(relations.replaceDraftDeposits).toHaveBeenCalled();
    expect(relations.confirmSnapshots).toHaveBeenCalledWith(
      { organizationId: auth.organizationId, contractId: "contract-1" },
      transaction,
    );
    expect(audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rental_contract.corrected" }),
      transaction,
    );
  });

  it("allows started metadata-only correction while the owned property is inactive", async () => {
    const started = contractRecord({ status: "confirmed", startDate: "2026-08-01" });
    const startedDetail = contractDetail({
      lifecycleStatus: "confirmed",
      displayStatus: "active",
      startDate: "2026-08-01",
    });
    const { service, repository, relations, policy } = serviceHarness({
      repository: {
        find: vi.fn().mockResolvedValue(started),
        findForUpdate: vi.fn().mockResolvedValue(started),
        detail: vi.fn().mockResolvedValue(startedDetail),
      },
      policy: {
        requireOwnedPropertyForUpdate: vi
          .fn()
          .mockResolvedValue({ id: "property-1", isActive: false }),
      },
    });

    await expect(
      service.update(auth, { id: "contract-1", note: "补充归档说明" } as never),
    ).resolves.toMatchObject({ id: "contract-1" });

    expect(policy.requireOwnedPropertyForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findForUpdate.mock.invocationCallOrder[0] ?? 0,
    );
    expect(policy.assertPropertyActive).not.toHaveBeenCalled();
    expect(policy.validateConfirmationScope).not.toHaveBeenCalled();
    expect(relations.confirmSnapshots).not.toHaveBeenCalled();
    expect(repository.updateHeader).toHaveBeenCalled();
  });

  it("rejects a started core correction after taking owned property and contract locks", async () => {
    const started = contractRecord({ status: "confirmed", startDate: "2026-08-01" });
    const { service, repository, policy } = serviceHarness({
      repository: {
        find: vi.fn().mockResolvedValue(started),
        findForUpdate: vi.fn().mockResolvedValue(started),
      },
    });

    await expect(
      service.update(auth, { id: "contract-1", rentAmountMinor: 900_000 } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(policy.requireOwnedPropertyForUpdate).toHaveBeenCalled();
    expect(repository.findForUpdate).toHaveBeenCalled();
    expect(policy.assertPropertyActive).not.toHaveBeenCalled();
    expect(policy.validateConfirmationScope).not.toHaveBeenCalled();
    expect(repository.updateHeader).not.toHaveBeenCalled();
  });

  it("rejects a pre-start core correction when the owned property is inactive", async () => {
    const upcoming = contractRecord({ status: "confirmed", startDate: "2026-09-01" });
    const { service, repository, policy } = serviceHarness({
      repository: {
        find: vi.fn().mockResolvedValue(upcoming),
        findForUpdate: vi.fn().mockResolvedValue(upcoming),
      },
      policy: {
        requireOwnedPropertyForUpdate: vi
          .fn()
          .mockResolvedValue({ id: "property-1", isActive: false }),
      },
    });

    await expect(
      service.update(auth, { id: "contract-1", rentAmountMinor: 900_000 } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(policy.assertPropertyActive).toHaveBeenCalled();
    expect(policy.validateConfirmationScope).not.toHaveBeenCalled();
    expect(repository.updateHeader).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-organization property before locking the contract", async () => {
    const { service, repository, policy } = serviceHarness({
      policy: {
        requireOwnedPropertyForUpdate: vi.fn().mockRejectedValue(new NotFoundException()),
      },
    });

    await expect(
      service.update(auth, { id: "contract-1", note: "不会写入" } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(policy.requireOwnedPropertyForUpdate).toHaveBeenCalled();
    expect(repository.findForUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes only a draft and rejects a confirmed contract", async () => {
    const { service, repository, audit } = serviceHarness();
    await service.delete(auth, { id: "contract-1" } as never);
    expect(repository.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "contract-1", deletedByUserId: auth.userId }),
      transaction,
    );
    expect(audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rental_contract.draft_deleted" }),
      transaction,
    );

    const confirmed = contractRecord({ status: "confirmed" });
    const rejected = serviceHarness({
      repository: {
        find: vi.fn().mockResolvedValue(confirmed),
        findForUpdate: vi.fn().mockResolvedValue(confirmed),
      },
    });
    await expect(
      rejected.service.delete(auth, { id: "contract-1" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rejected.repository.softDelete).not.toHaveBeenCalled();
  });

  it("returns safe availability conflicts after locking the organization and property", async () => {
    const conflicts = [
      {
        contractId: "contract-2",
        contractNumber: "RC-2026-000002",
        spaceId: "space-1",
        spaceName: "101",
      },
    ];
    const { service, policy } = serviceHarness({
      policy: { checkSpaceAvailability: vi.fn().mockResolvedValue(conflicts) },
    });
    await expect(
      service.checkAvailability(auth, {
        propertyId: "property-1",
        spaceIds: ["space-1"],
        startDate: "2026-09-01",
        endDate: "2027-08-31",
      } as never),
    ).resolves.toEqual({ available: false, conflicts });
    expect(policy.checkSpaceAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: auth.organizationId,
        property: { id: "property-1", isActive: true },
      }),
      transaction,
    );
  });

  it("propagates required audit failure so the transaction cannot commit", async () => {
    const auditFailure = new Error("audit failed");
    const { service, audit, persisted } = serviceHarness({
      audit: { appendRequired: vi.fn().mockRejectedValue(auditFailure) },
    });

    await expect(
      service.create(auth, {
        propertyId: "property-1",
        spaces: [{ spaceId: "space-1" }],
        parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
        depositTerms: [{ type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 1 }],
      } as never),
    ).rejects.toBe(auditFailure);
    expect(audit.appendRequired).toHaveBeenCalledWith(expect.any(Object), transaction);
    expect(persisted()).toEqual({ headers: 0, relations: 0, softDeletes: 0, audits: 0 });
  });

  it("rolls back header and relation values when update audit fails", async () => {
    const auditFailure = new Error("audit failed");
    const setup = serviceHarness({
      audit: { appendRequired: vi.fn().mockRejectedValue(auditFailure) },
    });

    await expect(
      setup.service.update(setup.auth, {
        id: "contract-1",
        rentAmountMinor: 900_000,
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
        spaces: [{ spaceId: "space-2", rentAllocationMinor: 900_000 }],
      } as never),
    ).rejects.toBe(auditFailure);
    expect(setup.state()).toEqual({
      headerRentAmountMinor: null,
      partyTenantIds: [],
      spaceIds: [],
    });
  });
});

describe("ContractsPolicyService confirmation scope", () => {
  function policyHarness(
    options: {
      propertyActive?: boolean;
      tenantActive?: boolean;
      spaceActive?: boolean;
      rentable?: boolean;
      paths?: Record<string, Array<{ id: string; name: string }>>;
      conflicts?: unknown[];
    } = {},
  ) {
    const property = {
      id: "property-1",
      organizationId: auth.organizationId,
      isActive: options.propertyActive ?? true,
    };
    const spaces = {
      findActiveOwnedForUpdate: vi.fn((_: string, __: string, id: string) =>
        Promise.resolve({
          id,
          propertyId: "property-1",
          isActive: options.spaceActive ?? true,
          isRentable: options.rentable ?? true,
          name: id,
          code: null,
        }),
      ),
      listAncestors: vi.fn((_: string, __: string, id: string) =>
        Promise.resolve(options.paths?.[id] ?? [{ id, name: id }]),
      ),
      findActiveOwned: vi.fn((_: string, __: string, id: string) =>
        Promise.resolve({ id, isActive: true }),
      ),
    };
    const tenants = {
      findActiveOwnedForUpdate: vi.fn().mockResolvedValue({
        id: "tenant-1",
        isActive: options.tenantActive ?? true,
        sensitiveIdentityCiphertext: Buffer.from("ciphertext"),
        sensitiveIdentityKeyVersion: 1,
      }),
    };
    const executor = { execute: vi.fn().mockResolvedValue(options.conflicts ?? []) };
    const properties = { findActiveOwnedForUpdate: vi.fn().mockResolvedValue(property) };
    const policy = new ContractsPolicyService(
      {} as never,
      { lockOrganization: vi.fn().mockResolvedValue(true) } as never,
      properties as never,
      spaces as never,
      tenants as never,
    );
    return { policy, property, properties, spaces, tenants, executor };
  }

  const aggregate = {
    organizationId: auth.organizationId,
    contractId: "contract-1",
    property: { id: "property-1", organizationId: auth.organizationId, isActive: true },
    status: "confirmed" as const,
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    rentAmountMinor: 800_000,
    billingAnchor: "calendar_month" as const,
    paymentIntervalMonths: 1,
    dueDaysBefore: 5,
    terminationDate: null,
    parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
    spaces: [{ spaceId: "space-1" }],
    depositTerms: [],
  };

  it("classifies confirmed corrections before start as pre-start", () => {
    const { policy } = policyHarness();
    expect(
      policy.assertPreStartCorrection(
        contractRecord({ status: "confirmed", startDate: "2026-09-01" }) as never,
        "2026-08-31",
        { rentAmountMinor: 900_000 },
      ),
    ).toBe("pre_start");
  });

  it("classifies start-day and post-start metadata changes as metadata-only", () => {
    const { policy } = policyHarness();
    const confirmed = contractRecord({ status: "confirmed", startDate: "2026-09-01" }) as never;
    expect(policy.assertPreStartCorrection(confirmed, "2026-09-01", { note: "已更新" })).toBe(
      "metadata_only",
    );
    expect(
      policy.assertPreStartCorrection(confirmed, "2026-09-02", {
        externalContractNumber: "EXT-2",
      }),
    ).toBe("metadata_only");
  });

  it("rejects core-field corrections on or after the confirmed start date", () => {
    const { policy } = policyHarness();
    const confirmed = contractRecord({ status: "confirmed", startDate: "2026-09-01" }) as never;
    expect(() =>
      policy.assertPreStartCorrection(confirmed, "2026-09-01", { rentAmountMinor: 900_000 }),
    ).toThrow(ConflictException);
    expect(() =>
      policy.assertPreStartCorrection(confirmed, "2026-09-02", { startDate: "2026-09-03" }),
    ).toThrow(ConflictException);
  });

  it("locks an owned inactive property for historical lifecycle operations", async () => {
    const { policy, executor } = policyHarness({ propertyActive: false });
    await expect(
      policy.requireOwnedPropertyForUpdate(auth.organizationId, "property-1", executor as never),
    ).resolves.toMatchObject({ id: "property-1", isActive: false });
  });

  it("requires an active owned property for confirmation-level operations", async () => {
    const { policy, executor } = policyHarness({ propertyActive: false });
    await expect(
      policy.requireActivePropertyForUpdate(auth.organizationId, "property-1", executor as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("hides a cross-organization property behind 404 for either lock policy", async () => {
    const { policy, properties, executor } = policyHarness();
    properties.findActiveOwnedForUpdate.mockResolvedValue(null);
    await expect(
      policy.requireOwnedPropertyForUpdate(
        auth.organizationId,
        "foreign-property",
        executor as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      policy.requireActivePropertyForUpdate(
        auth.organizationId,
        "foreign-property",
        executor as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ["inactive tenant", { tenantActive: false }],
    ["inactive space", { spaceActive: false }],
    ["non-rentable space", { rentable: false }],
  ])("rejects an %s", async (_name, options) => {
    const { policy, executor } = policyHarness(options);
    await expect(
      policy.validateConfirmationScope(aggregate as never, executor as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects selecting an ancestor and its descendant in the same contract", async () => {
    const { policy, executor } = policyHarness({
      paths: {
        "space-1": [{ id: "space-1", name: "1 号楼" }],
        "space-2": [
          { id: "space-1", name: "1 号楼" },
          { id: "space-2", name: "101" },
        ],
      },
    });
    await expect(
      policy.validateConfirmationScope(
        { ...aggregate, spaces: [{ spaceId: "space-1" }, { spaceId: "space-2" }] } as never,
        executor as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns 409 when any same, ancestor, or descendant space date conflicts", async () => {
    const { policy, executor } = policyHarness({
      conflicts: [{ contractId: "other", contractNumber: "RC-2026-000002", spaceId: "space-1" }],
    });
    await expect(
      policy.validateConfirmationScope(aggregate as never, executor as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns locked active tenants and validated space snapshots", async () => {
    const { policy, executor } = policyHarness();
    await expect(
      policy.validateConfirmationScope(aggregate as never, executor as never),
    ).resolves.toMatchObject({
      property: aggregate.property,
      tenants: [{ id: "tenant-1" }],
      spaces: [{ id: "space-1", path: [{ id: "space-1", name: "space-1" }] }],
    });
  });

  it("allows cancellation only before the confirmed contract's organization-local start date", () => {
    const { policy } = policyHarness();
    const confirmed = contractRecord({ status: "confirmed", startDate: "2026-09-01" });
    expect(() => policy.assertCancellationAllowed(confirmed as never, "2026-08-31")).not.toThrow();
    expect(() => policy.assertCancellationAllowed(confirmed as never, "2026-09-01")).toThrow(
      ConflictException,
    );
    expect(() =>
      policy.assertCancellationAllowed(contractRecord({ status: "draft" }) as never, "2026-08-31"),
    ).toThrow(ConflictException);
  });
});

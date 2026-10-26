import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

function propertyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "property-1",
    organizationId: "organization-1",
    name: "阳光公寓",
    type: "apartment_building" as const,
    customTypeName: null,
    countryCode: "CN",
    province: "广东",
    city: "深圳",
    district: "南山",
    addressLine: "科技园 1 号",
    note: "朝南",
    isActive: true,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    ...overrides,
  };
}

function propertyDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...propertyRecord(),
    spaceCount: 3,
    rentableSpaceCount: 2,
    ...overrides,
  };
}

function createHarness() {
  const transaction = { kind: "transaction" };
  const current = propertyRecord();
  const detail = propertyDetail();
  const repository = {
    list: vi.fn().mockResolvedValue({
      items: [detail],
      total: 1,
      page: 1,
      pageSize: 20,
      internalPaginationState: "opaque-cursor",
    }),
    findActiveOwned: vi.fn().mockResolvedValue(detail),
    findActiveOwnedForUpdate: vi.fn().mockResolvedValue(current),
    findActiveNameConflict: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(current),
    update: vi.fn().mockResolvedValue(current),
    setStatus: vi.fn().mockResolvedValue(current),
    hasActiveSpace: vi.fn().mockResolvedValue(false),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
  const writeLockRepository = { lockOrganization: vi.fn().mockResolvedValue(true) };
  const policy = new PropertiesPolicyService(repository as never, writeLockRepository as never);
  const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  const contractReference = {
    organizationToday: vi.fn().mockResolvedValue("2026-08-31"),
    organizationNow: vi.fn().mockResolvedValue("2026-08-31T14:05:06"),
    countPropertyContracts: vi.fn().mockResolvedValue({
      activeContractCount: 0,
      upcomingContractCount: 0,
      expiringSoonContractCount: 0,
    }),
    assertPropertyCanDeactivate: vi.fn().mockResolvedValue(undefined),
  };
  const transactions = {
    run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
  };
  const service = new PropertiesService(
    repository as never,
    policy,
    auditService as never,
    transactions as never,
    contractReference as never,
  );

  return {
    auditService,
    current,
    contractReference,
    detail,
    repository,
    service,
    transaction,
    transactions,
    writeLockRepository,
  };
}

describe("PropertiesService", () => {
  it("maps organization-scoped list and detail dates to the shared response contract", async () => {
    const { repository, service } = createHarness();

    await expect(service.list(authContext, { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "property-1",
          updatedAt: "2026-08-21T00:00:00.000Z",
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const detail = await service.detail(authContext, { id: "property-1" });
    expect(detail).toEqual(
      expect.objectContaining({
        id: "property-1",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }),
    );
    expect(detail).not.toHaveProperty("organizationId");
    expect(detail).not.toHaveProperty("createdByUserId");
    expect(detail).not.toHaveProperty("deletedAt");
    expect(repository.list).toHaveBeenCalledWith("organization-1", { page: 1, pageSize: 20 });
    expect(repository.findActiveOwned).toHaveBeenCalledWith(
      "organization-1",
      "property-1",
      "2026-08-31T14:05:06",
    );
  });

  it("returns not found for a deleted, missing, or cross-organization property detail", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwned.mockResolvedValue(null);

    await expect(service.detail(authContext, { id: "foreign-property" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    {
      title: "create",
      invoke: (service: PropertiesService) =>
        service.create(authContext, {
          name: "阳光公寓",
          type: "apartment_building",
          countryCode: "CN",
          addressLine: "科技园 1 号",
        }),
      firstRuleRead: "findActiveNameConflict" as const,
    },
    {
      title: "update",
      invoke: (service: PropertiesService) =>
        service.update(authContext, { id: "property-1", name: "阳光公寓二期" }),
      firstRuleRead: "findActiveOwnedForUpdate" as const,
    },
    {
      title: "set status",
      invoke: (service: PropertiesService) =>
        service.setStatus(authContext, { id: "property-1", isActive: false }),
      firstRuleRead: "findActiveOwnedForUpdate" as const,
    },
    {
      title: "delete",
      invoke: (service: PropertiesService) => service.delete(authContext, { id: "property-1" }),
      firstRuleRead: "findActiveOwnedForUpdate" as const,
    },
  ])("locks the organization before every $title write rule read", async ({
    invoke,
    firstRuleRead,
  }) => {
    const { repository, service, transaction, writeLockRepository } = createHarness();

    await invoke(service);

    expect(writeLockRepository.lockOrganization).toHaveBeenCalledWith(
      "organization-1",
      transaction,
    );
    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      repository[firstRuleRead].mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("stops all rule reads when the organization write scope cannot be locked", async () => {
    const { repository, service, writeLockRepository } = createHarness();
    writeLockRepository.lockOrganization.mockResolvedValue(false);

    await expect(
      service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        addressLine: "科技园 1 号",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findActiveNameConflict).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates an organization-owned property and audits only non-sensitive metadata", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await expect(
      service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        province: "广东",
        city: "深圳",
        district: "南山",
        addressLine: "科技园 1 号",
        note: "朝南",
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "property-1" }));

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        name: "阳光公寓",
        type: "apartment_building",
        customTypeName: null,
        countryCode: "CN",
        province: "广东",
        city: "深圳",
        district: "南山",
        addressLine: "科技园 1 号",
        note: "朝南",
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        actorUserId: "user-1",
        action: "rental_property.created",
        targetType: "rental_property",
        targetId: "property-1",
        result: "succeeded",
        metadata: { type: "apartment_building" },
      },
      transaction,
    );
  });

  it("rejects a duplicate active property name before creating the property", async () => {
    const { repository, service } = createHarness();
    repository.findActiveNameConflict.mockResolvedValue({ id: "property-2" });

    await expect(
      service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        addressLine: "科技园 1 号",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rolls back the property when required auditing fails", async () => {
    const { auditService, current, repository, service, transaction, transactions } =
      createHarness();
    const state = { properties: [] as string[] };
    transactions.run.mockImplementation(async (operation) => {
      const snapshot = structuredClone(state);
      try {
        return await operation(transaction);
      } catch (error) {
        state.properties = snapshot.properties;
        throw error;
      }
    });
    repository.create.mockImplementation(async () => {
      state.properties.push("property-1");
      return current;
    });
    auditService.appendRequired.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        addressLine: "科技园 1 号",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(state).toEqual({ properties: [] });
  });

  it("updates property details and audits the changed field names", async () => {
    const { auditService, repository, service, transaction } = createHarness();

    await service.update(authContext, {
      id: "property-1",
      name: "阳光公寓二期",
      addressLine: "科技园 2 号",
      note: null,
    });
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "property-1",
        organizationId: "organization-1",
        name: "阳光公寓二期",
        addressLine: "科技园 2 号",
        note: null,
      }),
      transaction,
    );
    const auditInput = auditService.appendRequired.mock.calls[0]?.[0];
    expect(auditInput).toEqual(
      expect.objectContaining({
        action: "rental_property.updated",
        targetId: "property-1",
        metadata: { changedFields: ["name", "addressLine", "note"] },
      }),
    );
    expect(auditInput?.metadata).not.toHaveProperty("addressLine");
    expect(auditInput?.metadata).not.toHaveProperty("note");
    await service.update(authContext, { id: "property-1", city: "广州" });
  });

  it("maps an invalid merged custom type state to a validation error", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedForUpdate.mockResolvedValue(
      propertyRecord({ type: "warehouse", customTypeName: null }),
    );

    await expect(
      service.update(authContext, { id: "property-1", customTypeName: "自定义仓" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("checks an inactive property's new name against every undeleted property", async () => {
    const { repository, service, transaction } = createHarness();
    repository.findActiveOwnedForUpdate.mockResolvedValue(propertyRecord({ isActive: false }));

    await service.update(authContext, { id: "property-1", name: "停用房产新名称" });

    expect(repository.findActiveNameConflict).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        name: "停用房产新名称",
        excludeId: "property-1",
      },
      transaction,
    );
  });

  it("changes only property status, checks active-name conflicts, and audits the status action", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    repository.findActiveOwnedForUpdate.mockResolvedValue(propertyRecord({ isActive: false }));

    await service.setStatus(authContext, { id: "property-1", isActive: true });

    expect(repository.findActiveNameConflict).toHaveBeenCalledWith(
      { organizationId: "organization-1", name: "阳光公寓", excludeId: "property-1" },
      transaction,
    );
    expect(repository.setStatus).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "property-1",
        isActive: true,
        updatedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_property.status_changed",
        targetType: "rental_property",
        targetId: "property-1",
        metadata: { isActive: true },
      }),
      transaction,
    );
  });

  it("uses one transaction executor for contract protection, mutation, and audit", async () => {
    const { auditService, contractReference, repository, service, transaction } = createHarness();
    repository.findActiveOwnedForUpdate.mockResolvedValue(propertyRecord({ isActive: true }));

    await service.setStatus(authContext, { id: "property-1", isActive: false });

    expect(contractReference.assertPropertyCanDeactivate).toHaveBeenCalledWith(
      "organization-1",
      "property-1",
      transaction,
    );
    expect(repository.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "property-1", isActive: false }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(expect.anything(), transaction);
    expect(contractReference.assertPropertyCanDeactivate.mock.invocationCallOrder[0]).toBeLessThan(
      repository.setStatus.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(repository.setStatus.mock.invocationCallOrder[0]).toBeLessThan(
      auditService.appendRequired.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("does not mutate or audit when contract protection rejects deactivation", async () => {
    const { auditService, contractReference, repository, service } = createHarness();
    contractReference.assertPropertyCanDeactivate.mockRejectedValueOnce(
      new ConflictException({ code: "CONTRACT_REFERENCE" }),
    );

    await expect(
      service.setStatus(authContext, { id: "property-1", isActive: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.setStatus).not.toHaveBeenCalled();
    expect(auditService.appendRequired).not.toHaveBeenCalled();
  });

  it("maps mutually exclusive property contract buckets into the detail response", async () => {
    const { detail, repository, service } = createHarness();
    repository.findActiveOwned.mockResolvedValueOnce({
      ...detail,
      activeContractCount: 2,
      upcomingContractCount: 3,
      expiringSoonContractCount: 1,
    });

    await expect(service.detail(authContext, { id: "property-1" })).resolves.toEqual(
      expect.objectContaining({
        activeContractCount: 2,
        upcomingContractCount: 3,
        expiringSoonContractCount: 1,
      }),
    );
  });

  it("rolls back a property rename when required auditing fails", async () => {
    const { auditService, current, repository, service, transaction, transactions } =
      createHarness();
    const state = { propertyName: current.name };
    transactions.run.mockImplementation(async (operation) => {
      const snapshot = { ...state };
      try {
        return await operation(transaction);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    });
    repository.update.mockImplementation(async (input) => {
      state.propertyName = input.name;
      return propertyRecord({ name: input.name });
    });
    auditService.appendRequired.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      service.update(authContext, { id: "property-1", name: "阳光公寓二期" }),
    ).rejects.toThrow("audit unavailable");
    expect(state).toEqual({ propertyName: "阳光公寓" });
  });

  it("maps direct and wrapped property-name constraint violations to stable conflicts", async () => {
    const direct = createHarness();
    direct.repository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "rental_properties_active_name_unique",
      }),
    );
    await expect(
      direct.service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        addressLine: "科技园 1 号",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const wrapped = createHarness();
    wrapped.repository.update.mockRejectedValue(
      Object.assign(new Error("query failed"), {
        cause: Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint_name: "rental_properties_active_name_unique",
        }),
      }),
    );
    await expect(
      wrapped.service.update(authContext, { id: "property-1", name: "阳光公寓二期" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not hide unrelated database failures behind a name conflict", async () => {
    const { repository, service } = createHarness();
    const databaseError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "audit_logs_id_unique",
    });
    repository.create.mockRejectedValue(databaseError);

    await expect(
      service.create(authContext, {
        name: "阳光公寓",
        type: "apartment_building",
        countryCode: "CN",
        addressLine: "科技园 1 号",
      }),
    ).rejects.toBe(databaseError);
  });

  it("rejects deleting a property with an active space", async () => {
    const { repository, service, transaction } = createHarness();
    repository.hasActiveSpace.mockResolvedValue(true);

    await expect(service.delete(authContext, { id: "property-1" })).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(repository.hasActiveSpace).toHaveBeenCalledWith(
      "organization-1",
      "property-1",
      transaction,
    );
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it("soft deletes the property and audits in the same transaction", async () => {
    const { auditService, repository, service, transaction } = createHarness();

    await service.delete(authContext, { id: "property-1" });
    expect(repository.softDelete).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "property-1",
        deletedByUserId: "user-1",
        updatedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_property.deleted",
        targetType: "rental_property",
        targetId: "property-1",
        metadata: {},
      }),
      transaction,
    );
  });
});

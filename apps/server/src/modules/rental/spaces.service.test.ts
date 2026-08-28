import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { SpacesService } from "./spaces.service.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";

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
    ledgerId: "ledger-1",
    name: "阳光公寓",
    type: "apartment_building" as const,
    customTypeName: null,
    countryCode: "CN",
    province: null,
    city: null,
    district: null,
    addressLine: "科技园 1 号",
    note: null,
    isActive: true,
    createdByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    ...overrides,
  };
}

function spaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "space-1",
    organizationId: "organization-1",
    propertyId: "property-1",
    parentId: null,
    name: "1 号楼",
    code: "B1",
    type: "building" as const,
    customTypeName: null,
    isRentable: false,
    isActive: true,
    sortOrder: 0,
    createdByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    ...overrides,
  };
}

function nodeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "space-1",
    propertyId: "property-1",
    parentId: null,
    name: "1 号楼",
    code: "B1",
    type: "building" as const,
    customTypeName: null,
    isRentable: false,
    isActive: true,
    isEffectivelyActive: true,
    sortOrder: 0,
    hasChildren: false,
    ...overrides,
  };
}

function createHarness() {
  const transaction = { kind: "transaction" };
  const property = propertyRecord();
  const root = spaceRecord();
  const repository = {
    listChildren: vi.fn().mockResolvedValue({
      items: [nodeRecord({ internalState: "private" })],
      total: 1,
      page: 1,
      pageSize: 20,
      internalPaginationState: "private",
    }),
    search: vi.fn().mockResolvedValue({
      items: [
        {
          ...nodeRecord({ isEffectivelyActive: false }),
          path: [{ id: "space-1", name: "1 号楼" }],
          internalState: "private",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      internalPaginationState: "private",
    }),
    findActiveOwnedById: vi.fn().mockResolvedValue(root),
    findActiveOwned: vi.fn().mockResolvedValue(root),
    findActiveOwnedForUpdate: vi.fn().mockResolvedValue(root),
    listAncestors: vi.fn().mockResolvedValue([{ id: "space-1", name: "1 号楼" }]),
    getSubtreeRelativeDepth: vi.fn().mockResolvedValue(0),
    hasActiveChildren: vi.fn().mockResolvedValue(false),
    hasAnyChildren: vi.fn().mockResolvedValue(false),
    findSiblingConflicts: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(root),
    createMany: vi.fn().mockResolvedValue([root]),
    update: vi.fn().mockResolvedValue(root),
    move: vi.fn().mockResolvedValue(root),
    setStatus: vi.fn().mockResolvedValue(root),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
  const propertiesRepository = {
    findActiveOwned: vi.fn().mockResolvedValue(property),
    findActiveOwnedForUpdate: vi.fn().mockResolvedValue(property),
  };
  const writeLockRepository = { lockOrganization: vi.fn().mockResolvedValue(true) };
  const policy = new SpacesPolicyService(
    repository as never,
    propertiesRepository as never,
    writeLockRepository as never,
  );
  const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  const transactions = {
    run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
  };
  const service = new SpacesService(
    repository as never,
    policy,
    auditService as never,
    transactions as never,
  );

  return {
    auditService,
    propertiesRepository,
    property,
    repository,
    root,
    service,
    transaction,
    transactions,
    writeLockRepository,
  };
}

describe("SpacesService", () => {
  it("returns scoped child and search pages without leaking persistence fields", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.listChildren(authContext, {
        propertyId: "property-1",
        parentId: null,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [nodeRecord()],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    await expect(
      service.search(authContext, {
        propertyId: "property-1",
        keyword: "1 号楼",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          ...nodeRecord({ isEffectivelyActive: false }),
          path: [{ id: "space-1", name: "1 号楼" }],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(repository.listChildren).toHaveBeenCalledWith("organization-1", "property-1", {
      parentId: null,
      page: 1,
      pageSize: 20,
    });
  });

  it("returns not found for a missing property or a parent outside that property", async () => {
    const missingProperty = createHarness();
    missingProperty.propertiesRepository.findActiveOwned.mockResolvedValue(null);
    await expect(
      missingProperty.service.search(authContext, {
        propertyId: "foreign-property",
        keyword: "101",
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missingProperty.repository.search).not.toHaveBeenCalled();

    const missingParent = createHarness();
    missingParent.repository.findActiveOwned.mockResolvedValue(null);
    await expect(
      missingParent.service.listChildren(authContext, {
        propertyId: "property-1",
        parentId: "foreign-space",
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missingParent.repository.listChildren).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: "create",
      invoke: (service: SpacesService) =>
        service.create(authContext, {
          propertyId: "property-1",
          name: "1 号楼",
          type: "building",
          isRentable: false,
        }),
    },
    {
      title: "batch create",
      invoke: (service: SpacesService) =>
        service.batchCreate(authContext, {
          propertyId: "property-1",
          type: "room",
          isRentable: true,
          items: [{ name: "101" }],
        }),
    },
    {
      title: "update",
      invoke: (service: SpacesService) => service.update(authContext, { id: "space-1", name: "A" }),
    },
    {
      title: "move",
      invoke: (service: SpacesService) =>
        service.move(authContext, { id: "space-1", parentId: null, sortOrder: 1 }),
    },
    {
      title: "set status",
      invoke: (service: SpacesService) =>
        service.setStatus(authContext, { id: "space-1", isActive: false }),
    },
    {
      title: "delete",
      invoke: (service: SpacesService) => service.delete(authContext, { id: "space-1" }),
    },
  ])("locks organization before resolving and locking the property for $title", async ({
    invoke,
  }) => {
    const { propertiesRepository, repository, service, writeLockRepository } = createHarness();

    await invoke(service);

    const firstScopedRead = Math.min(
      propertiesRepository.findActiveOwnedForUpdate.mock.invocationCallOrder[0] ?? Infinity,
      repository.findActiveOwnedById.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      firstScopedRead,
    );
    expect(writeLockRepository.lockOrganization).toHaveBeenCalledWith(
      "organization-1",
      expect.anything(),
    );
  });

  it("creates root and child spaces after locking an active property and audits safe metadata", async () => {
    const rootHarness = createHarness();
    await expect(
      rootHarness.service.create(authContext, {
        propertyId: "property-1",
        name: " 1 号楼 ",
        code: " B1 ",
        type: "building",
        isRentable: false,
      }),
    ).resolves.toEqual({ id: "space-1" });
    expect(rootHarness.repository.create).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: null,
        name: "1 号楼",
        code: "B1",
        type: "building",
        customTypeName: null,
        isRentable: false,
        sortOrder: 0,
        createdByUserId: "user-1",
      },
      rootHarness.transaction,
    );
    expect(rootHarness.auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_space.created",
        targetType: "rental_space",
        targetId: "space-1",
        metadata: { propertyId: "property-1", parentId: null, type: "building" },
      }),
      rootHarness.transaction,
    );

    const childHarness = createHarness();
    childHarness.repository.findActiveOwnedById.mockResolvedValue(
      spaceRecord({ id: "parent-1", propertyId: "property-1" }),
    );
    childHarness.repository.findActiveOwnedForUpdate.mockResolvedValue(
      spaceRecord({ id: "parent-1", propertyId: "property-1" }),
    );
    childHarness.repository.listAncestors.mockResolvedValue([
      { id: "root-1", name: "1 号楼" },
      { id: "parent-1", name: "1 层" },
    ]);
    await childHarness.service.create(authContext, {
      propertyId: "property-1",
      parentId: "parent-1",
      name: "101",
      type: "room",
      isRentable: true,
    });
    expect(childHarness.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-1", name: "101" }),
      childHarness.transaction,
    );
  });

  it("rejects creation when the property is inactive", async () => {
    const { propertiesRepository, repository, service } = createHarness();
    propertiesRepository.findActiveOwnedForUpdate.mockResolvedValue(
      propertyRecord({ isActive: false }),
    );

    await expect(
      service.create(authContext, {
        propertyId: "property-1",
        name: "1 号楼",
        type: "building",
        isRentable: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects a parent from another property with a validation error", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedById.mockResolvedValue(
      spaceRecord({ id: "foreign-parent", propertyId: "property-2" }),
    );

    await expect(
      service.create(authContext, {
        propertyId: "property-1",
        parentId: "foreign-parent",
        name: "101",
        type: "room",
        isRentable: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects creation below the maximum four levels", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedById.mockResolvedValue(spaceRecord({ id: "level-4" }));
    repository.findActiveOwnedForUpdate.mockResolvedValue(spaceRecord({ id: "level-4" }));
    repository.listAncestors.mockResolvedValue([
      { id: "level-1", name: "L1" },
      { id: "level-2", name: "L2" },
      { id: "level-3", name: "L3" },
      { id: "level-4", name: "L4" },
    ]);

    await expect(
      service.create(authContext, {
        propertyId: "property-1",
        parentId: "level-4",
        name: "L5",
        type: "room",
        isRentable: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("batch-normalizes before locking, rejects duplicate or oversized input with zero writes", async () => {
    const duplicate = createHarness();
    await expect(
      duplicate.service.batchCreate(authContext, {
        propertyId: "property-1",
        type: "room",
        isRentable: true,
        items: [
          { name: " 101 ", code: " A " },
          { name: "101", code: "B" },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(duplicate.transactions.run).not.toHaveBeenCalled();
    expect(duplicate.repository.createMany).not.toHaveBeenCalled();

    const oversized = createHarness();
    await expect(
      oversized.service.batchCreate(authContext, {
        propertyId: "property-1",
        type: "room",
        isRentable: true,
        items: Array.from({ length: 501 }, (_, index) => ({ name: String(index) })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(oversized.transactions.run).not.toHaveBeenCalled();
    expect(oversized.repository.createMany).not.toHaveBeenCalled();

    const blankName = createHarness();
    await expect(
      blankName.service.batchCreate(authContext, {
        propertyId: "property-1",
        type: "room",
        isRentable: true,
        items: [{ name: "   " }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(blankName.transactions.run).not.toHaveBeenCalled();
    expect(blankName.repository.createMany).not.toHaveBeenCalled();
  });

  it("batch-checks database conflicts once, creates once, and emits one count-only audit", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    repository.createMany.mockResolvedValue([
      spaceRecord({ id: "space-101", name: "101", code: "A" }),
      spaceRecord({ id: "space-102", name: "102", code: null }),
    ]);

    await expect(
      service.batchCreate(authContext, {
        propertyId: "property-1",
        parentId: undefined,
        type: "room",
        isRentable: true,
        items: [
          { name: " 101 ", code: " A ", sortOrder: 1 },
          { name: "102", sortOrder: 2 },
        ],
      }),
    ).resolves.toEqual({ ids: ["space-101", "space-102"] });
    expect(repository.findSiblingConflicts).toHaveBeenCalledTimes(1);
    expect(repository.findSiblingConflicts).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: null,
        names: ["101", "102"],
        codes: ["A"],
      },
      transaction,
    );
    expect(repository.createMany).toHaveBeenCalledTimes(1);
    expect(repository.createMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: "101", code: "A", sortOrder: 1 }),
        expect.objectContaining({ name: "102", code: null, sortOrder: 2 }),
      ],
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledTimes(1);
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_space.batch_created",
        targetType: "rental_property",
        targetId: "property-1",
        metadata: { propertyId: "property-1", parentId: null, count: 2 },
      }),
      transaction,
    );
  });

  it("returns zero writes when any database sibling conflict exists", async () => {
    const { repository, service } = createHarness();
    repository.findSiblingConflicts.mockResolvedValue([
      { id: "existing", name: "101", code: null },
    ]);

    await expect(
      service.batchCreate(authContext, {
        propertyId: "property-1",
        type: "room",
        isRentable: true,
        items: [{ name: "101" }, { name: "102" }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createMany).not.toHaveBeenCalled();
  });

  it("rejects moving under self or a descendant", async () => {
    const self = createHarness();
    await expect(
      self.service.move(authContext, { id: "space-1", parentId: "space-1", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(self.repository.move).not.toHaveBeenCalled();

    const descendant = createHarness();
    descendant.repository.findActiveOwnedById
      .mockResolvedValueOnce(spaceRecord({ id: "space-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "room-1", parentId: "space-1" }));
    descendant.repository.findActiveOwnedForUpdate
      .mockResolvedValueOnce(spaceRecord({ id: "space-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "room-1", parentId: "space-1" }));
    descendant.repository.listAncestors.mockResolvedValue([
      { id: "space-1", name: "1 号楼" },
      { id: "room-1", name: "101" },
    ]);

    await expect(
      descendant.service.move(authContext, {
        id: "space-1",
        parentId: "room-1",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(descendant.repository.move).not.toHaveBeenCalled();
  });

  it("rejects a move whose resulting subtree would exceed four levels", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedById
      .mockResolvedValueOnce(spaceRecord({ id: "unit-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "target-floor" }));
    repository.findActiveOwnedForUpdate
      .mockResolvedValueOnce(spaceRecord({ id: "unit-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "target-floor" }));
    repository.listAncestors.mockResolvedValue([
      { id: "root-1", name: "1 号楼" },
      { id: "target-floor", name: "2 层" },
    ]);
    repository.getSubtreeRelativeDepth.mockResolvedValue(2);

    await expect(
      service.move(authContext, { id: "unit-1", parentId: "target-floor", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.move).not.toHaveBeenCalled();
  });

  it("rejects cross-property moves with 400 and missing foreign-organization targets with 404", async () => {
    const crossProperty = createHarness();
    crossProperty.repository.findActiveOwnedById
      .mockResolvedValueOnce(spaceRecord({ id: "space-1", propertyId: "property-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "target", propertyId: "property-2" }));
    await expect(
      crossProperty.service.move(authContext, { id: "space-1", parentId: "target", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const foreignOrganization = createHarness();
    foreignOrganization.repository.findActiveOwnedById
      .mockResolvedValueOnce(spaceRecord({ id: "space-1" }))
      .mockResolvedValueOnce(null);
    await expect(
      foreignOrganization.service.move(authContext, {
        id: "space-1",
        parentId: "foreign-target",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("checks target siblings and moves in the same transaction", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    repository.findActiveOwnedById
      .mockResolvedValueOnce(spaceRecord({ id: "space-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "target", parentId: null }));
    repository.findActiveOwnedForUpdate
      .mockResolvedValueOnce(spaceRecord({ id: "space-1" }))
      .mockResolvedValueOnce(spaceRecord({ id: "target", parentId: null }));
    repository.listAncestors.mockResolvedValue([{ id: "target", name: "2 号楼" }]);

    await expect(
      service.move(authContext, { id: "space-1", parentId: "target", sortOrder: 9 }),
    ).resolves.toEqual({ id: "space-1" });
    expect(repository.findSiblingConflicts).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: "target",
        names: ["1 号楼"],
        codes: ["B1"],
        excludeId: "space-1",
      },
      transaction,
    );
    expect(repository.move).toHaveBeenCalledWith(
      {
        id: "space-1",
        organizationId: "organization-1",
        propertyId: "property-1",
        parentId: "target",
        sortOrder: 9,
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_space.moved",
        targetId: "space-1",
        metadata: { propertyId: "property-1", fromParentId: null, toParentId: "target" },
      }),
      transaction,
    );
  });

  it("updates merged profile fields and checks conflicts only for active spaces", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    await service.update(authContext, {
      id: "space-1",
      name: " 主楼 ",
      code: null,
      isRentable: true,
    });

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "space-1",
        name: "主楼",
        code: null,
        isRentable: true,
        isActive: true,
      }),
      transaction,
    );
    expect(repository.findSiblingConflicts).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        names: ["主楼"],
        codes: [],
        excludeId: "space-1",
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_space.updated",
        metadata: { changedFields: ["name", "code", "isRentable"] },
      }),
      transaction,
    );

    const inactive = createHarness();
    inactive.repository.findActiveOwnedById.mockResolvedValue(spaceRecord({ isActive: false }));
    inactive.repository.findActiveOwnedForUpdate.mockResolvedValue(
      spaceRecord({ isActive: false }),
    );
    await inactive.service.update(authContext, { id: "space-1", name: "停用节点" });
    expect(inactive.repository.findSiblingConflicts).not.toHaveBeenCalled();
  });

  it("sets only the selected node status and checks conflicts when reactivating", async () => {
    const { auditService, repository, service, transaction } = createHarness();
    repository.findActiveOwnedById.mockResolvedValue(spaceRecord({ isActive: false }));
    repository.findActiveOwnedForUpdate.mockResolvedValue(spaceRecord({ isActive: false }));

    await service.setStatus(authContext, { id: "space-1", isActive: true });

    expect(repository.findSiblingConflicts).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        names: ["1 号楼"],
        codes: ["B1"],
        excludeId: "space-1",
      }),
      transaction,
    );
    expect(repository.setStatus).toHaveBeenCalledOnce();
    expect(repository.setStatus).toHaveBeenCalledWith(
      {
        id: "space-1",
        organizationId: "organization-1",
        propertyId: "property-1",
        isActive: true,
      },
      transaction,
    );
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.move).not.toHaveBeenCalled();
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rental_space.status_changed",
        metadata: { isActive: true },
      }),
      transaction,
    );
  });

  it("preserves parent-derived effective status returned by read queries", async () => {
    const { service } = createHarness();

    const page = await service.listChildren(authContext, {
      propertyId: "property-1",
      parentId: null,
      page: 1,
      pageSize: 20,
    });

    expect(page.items[0]?.isEffectivelyActive).toBe(true);
    const inherited = createHarness();
    inherited.repository.listChildren.mockResolvedValue({
      items: [nodeRecord({ isActive: true, isEffectivelyActive: false })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    await expect(
      inherited.service.listChildren(authContext, {
        propertyId: "property-1",
        parentId: null,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ isActive: true, isEffectivelyActive: false })],
      }),
    );
  });

  it("rejects active children but allows historical deleted children when deleting", async () => {
    const active = createHarness();
    active.repository.hasActiveChildren.mockResolvedValue(true);
    await expect(active.service.delete(authContext, { id: "space-1" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(active.repository.softDelete).not.toHaveBeenCalled();

    const historical = createHarness();
    historical.repository.hasActiveChildren.mockResolvedValue(false);
    historical.repository.hasAnyChildren.mockResolvedValue(true);
    await expect(
      historical.service.delete(authContext, { id: "space-1" }),
    ).resolves.toBeUndefined();
    expect(historical.repository.softDelete).toHaveBeenCalledOnce();
  });

  it("rolls back a space create when required auditing fails", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();
    const state = { spaces: [] as string[] };
    transactions.run.mockImplementation(async (operation) => {
      const snapshot = structuredClone(state);
      try {
        return await operation(transaction);
      } catch (error) {
        state.spaces = snapshot.spaces;
        throw error;
      }
    });
    repository.create.mockImplementation(async () => {
      state.spaces.push("space-1");
      return spaceRecord();
    });
    auditService.appendRequired.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      service.create(authContext, {
        propertyId: "property-1",
        name: "1 号楼",
        type: "building",
        isRentable: false,
      }),
    ).rejects.toThrow("audit unavailable");
    expect(state.spaces).toEqual([]);
  });

  it("maps space uniqueness constraints to 409 and leaves unrelated database errors unchanged", async () => {
    const conflict = createHarness();
    conflict.repository.create.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "rental_spaces_active_root_name_unique",
      }),
    );
    await expect(
      conflict.service.create(authContext, {
        propertyId: "property-1",
        name: "1 号楼",
        type: "building",
        isRentable: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const unrelated = createHarness();
    const databaseError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "audit_logs_id_unique",
    });
    unrelated.repository.create.mockRejectedValue(databaseError);
    await expect(
      unrelated.service.create(authContext, {
        propertyId: "property-1",
        name: "1 号楼",
        type: "building",
        isRentable: false,
      }),
    ).rejects.toBe(databaseError);
  });
});

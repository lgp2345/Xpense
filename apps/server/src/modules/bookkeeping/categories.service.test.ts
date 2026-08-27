import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { CategoryType } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CategoriesService } from "./categories.service.js";
import { CategoriesPolicyService } from "./categories-policy.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

type CategoryFixtureOptions = {
  id?: string;
  ledgerId?: string;
  type?: CategoryType;
  parentId?: string | null;
  name?: string;
  sortOrder?: number;
};

function categoryFixture(options: CategoryFixtureOptions = {}) {
  return {
    id: options.id ?? "category-root",
    organizationId: "organization-1",
    ledgerId: options.ledgerId ?? "ledger-1",
    type: options.type ?? ("expense" as const),
    parentId: options.parentId ?? null,
    name: options.name ?? "餐饮",
    icon: null,
    color: null,
    sortOrder: options.sortOrder ?? 0,
    createdByUserId: "user-1",
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    updatedAt: new Date("2026-08-23T00:00:00.000Z"),
  };
}

describe("CategoriesService", () => {
  function createHarness() {
    const root = categoryFixture();
    const transaction = { kind: "transaction" };
    const repository = {
      listActive: vi.fn().mockResolvedValue([root]),
      findActiveOwnedLedger: vi.fn().mockResolvedValue({ id: "ledger-1", type: "personal" }),
      findActiveOwnedCategory: vi.fn().mockResolvedValue(root),
      findActiveSiblingByName: vi.fn().mockResolvedValue(null),
      hasActiveChildren: vi.fn().mockResolvedValue(false),
      hasAnyChildren: vi.fn().mockResolvedValue(false),
      hasAnyTransactionReference: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(root),
      update: vi.fn().mockResolvedValue(root),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };
    const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
    const transactions = {
      run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
    };
    const writeLockRepository = { lockOrganization: vi.fn().mockResolvedValue(true) };
    const policy = new CategoriesPolicyService(repository as never, writeLockRepository as never);
    const service = new CategoriesService(
      repository as never,
      policy,
      auditService as never,
      transactions as never,
    );

    return {
      auditService,
      repository,
      root,
      service,
      transaction,
      transactions,
      writeLockRepository,
    };
  }

  it("lists a two-level tree ordered by sortOrder and name after validating the owned ledger", async () => {
    const { repository, service } = createHarness();
    repository.listActive.mockResolvedValue([
      categoryFixture({ id: "root-b", name: "交通", sortOrder: 10 }),
      categoryFixture({
        id: "child-b",
        parentId: "root-a",
        name: "晚餐",
        sortOrder: 5,
      }),
      categoryFixture({ id: "root-a", name: "餐饮", sortOrder: 0 }),
      categoryFixture({
        id: "child-a",
        parentId: "root-a",
        name: "早餐",
        sortOrder: 5,
      }),
    ]);

    await expect(
      service.list(authContext, { ledgerId: "ledger-1", type: "expense" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "root-a",
        children: [
          expect.objectContaining({ id: "child-a", children: [] }),
          expect.objectContaining({ id: "child-b", children: [] }),
        ],
      }),
      expect.objectContaining({ id: "root-b", children: [] }),
    ]);
    expect(repository.findActiveOwnedLedger).toHaveBeenCalledWith("organization-1", "ledger-1");
    expect(repository.listActive).toHaveBeenCalledWith("organization-1", "ledger-1", "expense");
  });

  it("returns not found for a missing, deleted, or cross-organization ledger", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedLedger.mockResolvedValue(null);

    await expect(service.list(authContext, { ledgerId: "foreign-ledger" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.listActive).not.toHaveBeenCalled();
  });

  it.each([
    ["list", (service: CategoriesService) => service.list(authContext, { ledgerId: "ledger-1" })],
    [
      "create",
      (service: CategoriesService) =>
        service.create(authContext, { ledgerId: "ledger-1", type: "expense", name: "租赁分类" }),
    ],
    [
      "update",
      (service: CategoriesService) =>
        service.update(authContext, { id: "category-root", name: "租赁分类" }),
    ],
    [
      "delete",
      (service: CategoriesService) => service.delete(authContext, { id: "category-root" }),
    ],
  ])("rejects rental ledgers for category %s without changing ordinary bookkeeping", async (_title, invoke) => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedLedger.mockResolvedValue({ id: "ledger-1", type: "rental" });

    await expect(invoke(service)).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: "create",
      invoke: (service: CategoriesService) =>
        service.create(authContext, { ledgerId: "ledger-1", type: "expense", name: "餐饮" }),
      firstRuleRead: "findActiveOwnedLedger" as const,
    },
    {
      title: "update",
      invoke: (service: CategoriesService) =>
        service.update(authContext, { id: "category-root", name: "日常餐饮" }),
      firstRuleRead: "findActiveOwnedCategory" as const,
    },
    {
      title: "delete",
      invoke: (service: CategoriesService) => service.delete(authContext, { id: "category-root" }),
      firstRuleRead: "findActiveOwnedCategory" as const,
    },
  ])("locks the organization through the transaction before every $title rule read", async ({
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

  it("returns not found and performs no rule reads when the category write scope cannot be locked", async () => {
    const { repository, service, writeLockRepository } = createHarness();
    writeLockRepository.lockOrganization.mockResolvedValue(false);

    await expect(
      service.create(authContext, { ledgerId: "ledger-1", type: "expense", name: "餐饮" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findActiveOwnedLedger).not.toHaveBeenCalled();
    expect(repository.findActiveOwnedCategory).not.toHaveBeenCalled();
    expect(repository.findActiveSiblingByName).not.toHaveBeenCalled();
  });

  it("creates a child only when its parent is an active root in the same ledger and type", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await service.create(authContext, {
      ledgerId: "ledger-1",
      type: "expense",
      parentId: "category-root",
      name: "早餐",
    });

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.findActiveOwnedLedger).toHaveBeenCalledWith(
      "organization-1",
      "ledger-1",
      transaction,
    );
    expect(repository.findActiveOwnedCategory).toHaveBeenCalledWith(
      "organization-1",
      "category-root",
      transaction,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        ledgerId: "ledger-1",
        parentId: "category-root",
        createdByUserId: "user-1",
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "category.created",
        targetType: "category",
        targetId: "category-root",
      }),
      transaction,
    );
  });

  it.each([
    ["another ledger", categoryFixture({ ledgerId: "ledger-2" })],
    ["another type", categoryFixture({ type: "income" })],
    ["a child category", categoryFixture({ parentId: "another-root" })],
  ])("rejects %s as a parent", async (_title, parent) => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedCategory.mockResolvedValue(parent);

    await expect(
      service.create(authContext, {
        ledgerId: "ledger-1",
        type: "expense",
        parentId: parent.id,
        name: "早餐",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("does not reveal a cross-organization or deleted parent", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedCategory.mockResolvedValue(null);

    await expect(
      service.create(authContext, {
        ledgerId: "ledger-1",
        type: "expense",
        parentId: "foreign-category",
        name: "早餐",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a duplicate active sibling name", async () => {
    const { repository, service } = createHarness();
    repository.findActiveSiblingByName.mockResolvedValue(categoryFixture());

    await expect(
      service.create(authContext, {
        ledgerId: "ledger-1",
        type: "expense",
        name: "餐饮",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns not found when updating a category outside the active organization scope", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedCategory.mockResolvedValue(null);

    await expect(
      service.update(authContext, { id: "foreign-category", name: "不可见" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ["itself", "category-root", categoryFixture()],
    [
      "one of its children",
      "category-child",
      categoryFixture({ id: "category-child", parentId: "category-root" }),
    ],
    [
      "any existing child category",
      "other-child",
      categoryFixture({ id: "other-child", parentId: "other-root" }),
    ],
  ])("rejects moving a category under %s", async (_title, parentId, parent) => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedCategory.mockImplementation(
      async (_organizationId: string, id: string) =>
        id === "category-root" ? categoryFixture() : parent,
    );

    await expect(
      service.update(authContext, { id: "category-root", parentId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ["type", { type: "income" as const }],
    ["ledger", { ledgerId: "ledger-2" }],
    ["parent", { parentId: "another-root" }],
  ])("rejects changing a parent category's %s while active children exist", async (_title, change) => {
    const { repository, service } = createHarness();
    repository.hasActiveChildren.mockResolvedValue(true);
    repository.findActiveOwnedLedger.mockResolvedValue({ id: "ledger-2" });
    repository.findActiveOwnedCategory.mockImplementation(
      async (_organizationId: string, id: string) =>
        id === "category-root" ? categoryFixture() : categoryFixture({ id: "another-root" }),
    );

    await expect(
      service.update(authContext, { id: "category-root", ...change }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("validates the effective ledger and type when moving a leaf", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedCategory.mockImplementation(
      async (_organizationId: string, id: string) =>
        id === "category-root"
          ? categoryFixture()
          : categoryFixture({ id: "new-parent", ledgerId: "ledger-2" }),
    );
    repository.findActiveOwnedLedger.mockResolvedValue({ id: "ledger-2" });

    await expect(
      service.update(authContext, {
        id: "category-root",
        ledgerId: "ledger-2",
        parentId: "new-parent",
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "category-root" }));
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ ledgerId: "ledger-2", parentId: "new-parent" }),
      expect.anything(),
    );
  });

  it.each([
    ["ledger", { ledgerId: "ledger-2" }],
    ["type", { type: "income" as const }],
  ])("rejects changing a category's %s when any historical transaction references it", async (_title, change) => {
    const { repository, service, transaction } = createHarness();
    repository.findActiveOwnedLedger.mockResolvedValue({ id: "ledger-2" });
    repository.hasAnyTransactionReference.mockResolvedValue(true);

    await expect(
      service.update(authContext, { id: "category-root", ...change }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.hasAnyTransactionReference).toHaveBeenCalledWith(
      "organization-1",
      "category-root",
      transaction,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ["ledger", { ledgerId: "ledger-2" }],
    ["type", { type: "income" as const }],
  ])("rejects changing a category's %s when only soft-deleted children remain", async (_title, change) => {
    const { repository, service, transaction } = createHarness();
    repository.findActiveOwnedLedger.mockResolvedValue({ id: "ledger-2" });
    repository.hasActiveChildren.mockResolvedValue(false);
    repository.hasAnyChildren.mockResolvedValue(true);

    await expect(
      service.update(authContext, { id: "category-root", ...change }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.hasAnyChildren).toHaveBeenCalledWith(
      "organization-1",
      "category-root",
      transaction,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("updates a category and audits only changed fields through the same transaction", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await service.update(authContext, { id: "category-root", name: "日常餐饮", color: null });

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "category-root",
        organizationId: "organization-1",
        name: "日常餐饮",
        color: null,
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "category.updated",
        targetId: "category-root",
        metadata: { changedFields: ["name", "color"] },
      }),
      transaction,
    );
  });

  it("rejects deleting a parent category that still has active children", async () => {
    const { repository, service } = createHarness();
    repository.hasActiveChildren.mockResolvedValue(true);

    await expect(service.delete(authContext, { id: "category-root" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it("soft deletes only the selected category and writes required audit in the same transaction", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await service.delete(authContext, { id: "category-root" });

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.softDelete).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "category-root",
        deletedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "category.deleted",
        actorUserId: "user-1",
        organizationId: "organization-1",
        targetId: "category-root",
        targetType: "category",
      }),
      transaction,
    );
  });
});

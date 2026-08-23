import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { AccountsService } from "./accounts.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

describe("AccountsService", () => {
  function createHarness() {
    const account = {
      id: "account-1",
      organizationId: "organization-1",
      name: "现金",
      type: "cash" as const,
      icon: null,
      color: null,
      sortOrder: 0,
      createdByUserId: "user-1",
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
      updatedAt: new Date("2026-08-23T00:00:00.000Z"),
    };
    const transaction = { kind: "transaction" };
    const repository = {
      listActive: vi.fn().mockResolvedValue([{ ...account, balanceMinor: 100 }]),
      create: vi.fn().mockResolvedValue(account),
      findActiveOwnedAccount: vi.fn().mockResolvedValue(account),
      findActiveSummary: vi.fn().mockResolvedValue({ ...account, balanceMinor: 100 }),
      update: vi.fn().mockResolvedValue(account),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };
    const openingBalanceService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const auditService = {
      appendRequired: vi.fn().mockResolvedValue(undefined),
    };
    const transactions = {
      run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
    };
    const writeLockRepository = {
      lockOrganization: vi.fn().mockResolvedValue(true),
    };
    const service = new AccountsService(
      repository as never,
      writeLockRepository as never,
      openingBalanceService as never,
      auditService as never,
      transactions as never,
    );

    return {
      account,
      auditService,
      openingBalanceService,
      repository,
      service,
      transaction,
      transactions,
      writeLockRepository,
    };
  }

  it("lists only active accounts in the current organization", async () => {
    const { repository, service, writeLockRepository } = createHarness();

    await service.list(authContext);

    expect(repository.listActive).toHaveBeenCalledWith("organization-1");
    expect(writeLockRepository.lockOrganization).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: "create",
      invoke: (service: AccountsService) =>
        service.create(authContext, { name: "现金", type: "cash" }),
      firstOperation: "create" as const,
    },
    {
      title: "update",
      invoke: (service: AccountsService) =>
        service.update(authContext, { id: "account-1", name: "钱包" }),
      firstOperation: "findActiveOwnedAccount" as const,
    },
    {
      title: "delete",
      invoke: (service: AccountsService) => service.delete(authContext, { id: "account-1" }),
      firstOperation: "findActiveOwnedAccount" as const,
    },
  ])("locks the organization through the same transaction before $title account work", async ({
    invoke,
    firstOperation,
  }) => {
    const { repository, service, transaction, writeLockRepository } = createHarness();

    await invoke(service);

    expect(writeLockRepository.lockOrganization).toHaveBeenCalledWith(
      "organization-1",
      transaction,
    );
    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      repository[firstOperation].mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it.each([
    [
      "create",
      (service: AccountsService) => service.create(authContext, { name: "现金", type: "cash" }),
    ],
    [
      "update",
      (service: AccountsService) => service.update(authContext, { id: "account-1", name: "钱包" }),
    ],
    ["delete", (service: AccountsService) => service.delete(authContext, { id: "account-1" })],
  ] as const)("returns not found and performs no %s work when the organization lock fails", async (_title, invoke) => {
    const { auditService, openingBalanceService, repository, service, writeLockRepository } =
      createHarness();
    writeLockRepository.lockOrganization.mockResolvedValue(false);

    await expect(invoke(service)).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.findActiveOwnedAccount).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.softDelete).not.toHaveBeenCalled();
    expect(repository.findActiveSummary).not.toHaveBeenCalled();
    expect(openingBalanceService.create).not.toHaveBeenCalled();
    expect(auditService.appendRequired).not.toHaveBeenCalled();
  });

  it("creates an excluded opening-balance transaction when initialBalanceMinor is non-zero", async () => {
    const { auditService, openingBalanceService, repository, service, transaction } =
      createHarness();

    await service.create(authContext, {
      name: "银行卡",
      type: "bank",
      initialBalanceMinor: -500,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        createdByUserId: "user-1",
        name: "银行卡",
      }),
      transaction,
    );
    expect(openingBalanceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account-1",
        actorUserId: "user-1",
        amountMinor: -500,
        organizationId: "organization-1",
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.created", targetId: "account-1" }),
      transaction,
    );
  });

  it("does not create an opening transaction when initialBalanceMinor is zero", async () => {
    const { auditService, openingBalanceService, repository, service, transaction } =
      createHarness();

    await service.create(authContext, {
      name: "现金",
      type: "cash",
      initialBalanceMinor: 0,
    });

    expect(openingBalanceService.create).not.toHaveBeenCalled();
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.created", targetId: "account-1" }),
      transaction,
    );
    expect(repository.findActiveSummary).toHaveBeenCalledWith(
      "organization-1",
      "account-1",
      transaction,
    );
  });

  it("updates an account and writes required audit in one transaction", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await service.update(authContext, { id: "account-1", color: "#123456" });

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "account-1",
        organizationId: "organization-1",
        color: "#123456",
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.updated",
        targetId: "account-1",
        metadata: { changedFields: ["color"] },
      }),
      transaction,
    );
    expect(repository.findActiveSummary).toHaveBeenCalledWith(
      "organization-1",
      "account-1",
      transaction,
    );
  });

  it("returns not found for an account from another organization", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOwnedAccount.mockResolvedValue(null);

    await expect(
      service.update(authContext, {
        id: "foreign-account",
        name: "不可见账户",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findActiveOwnedAccount).toHaveBeenCalledWith(
      "organization-1",
      "foreign-account",
      expect.anything(),
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("soft deletes an account and writes required audit in one transaction", async () => {
    const { auditService, repository, service, transaction, transactions } = createHarness();

    await service.delete(authContext, { id: "account-1" });

    expect(transactions.run).toHaveBeenCalledOnce();
    expect(repository.findActiveOwnedAccount).toHaveBeenCalledWith(
      "organization-1",
      "account-1",
      transaction,
    );
    expect(repository.softDelete).toHaveBeenCalledWith(
      {
        id: "account-1",
        organizationId: "organization-1",
        deletedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.deleted",
        actorUserId: "user-1",
        organizationId: "organization-1",
        targetId: "account-1",
        targetType: "account",
      }),
      transaction,
    );
  });
});

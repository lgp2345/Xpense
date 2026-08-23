import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { TransactionType } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { TransactionsService } from "./transactions.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

const validInput = {
  ledgerId: "123e4567-e89b-12d3-a456-426614174000",
  type: "expense" as const,
  accountId: "223e4567-e89b-12d3-a456-426614174000",
  categoryId: "323e4567-e89b-12d3-a456-426614174000",
  amountMinor: 1_200,
  occurredAt: "2026-08-23T16:30:00.000Z",
  payee: "商户",
  note: "晚餐",
};

function transactionRecord(type: TransactionType = "expense") {
  return {
    id: "transaction-1",
    ledgerId: validInput.ledgerId,
    ledgerName: "个人账本",
    type,
    accountId: validInput.accountId,
    accountName: "现金",
    destinationAccountId: null,
    destinationAccountName: null,
    categoryId: type === "transfer" ? null : validInput.categoryId,
    categoryName: type === "transfer" ? null : "餐饮",
    amountMinor: validInput.amountMinor,
    occurredAt: validInput.occurredAt,
    payee: validInput.payee,
    note: validInput.note,
    createdAt: "2026-08-23T16:31:00.000Z",
    updatedAt: "2026-08-23T16:31:00.000Z",
  };
}

describe("TransactionsService", () => {
  function createHarness() {
    const transaction = { kind: "transaction" };
    const repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      findDetail: vi.fn().mockResolvedValue(transactionRecord()),
      findLockedOrganizationContext: vi.fn().mockResolvedValue({
        baseCurrency: "CNY",
        timezone: "Asia/Shanghai",
      }),
      findActiveOwnedForUpdate: vi.fn().mockResolvedValue({
        id: "transaction-1",
        type: "expense",
      }),
      create: vi.fn().mockResolvedValue("transaction-1"),
      update: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };
    const accountsRepository = {
      findActiveOwnedAccount: vi.fn(),
      findActiveOwnedAccountsForUpdate: vi
        .fn()
        .mockImplementation(async (_org: string, ids: string[]) =>
          ids.map((id) => ({
            id,
            organizationId: "organization-1",
            name: id === validInput.accountId ? "现金" : "银行卡",
          })),
        ),
    };
    const categoriesRepository = {
      findActiveOwnedLedger: vi.fn().mockResolvedValue({ id: validInput.ledgerId }),
      findActiveOwnedCategory: vi.fn().mockResolvedValue({
        id: validInput.categoryId,
        organizationId: "organization-1",
        ledgerId: validInput.ledgerId,
        type: "expense",
      }),
    };
    const writeLockRepository = { lockOrganization: vi.fn().mockResolvedValue(true) };
    const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
    const transactions = {
      run: vi.fn().mockImplementation(async (operation) => operation(transaction)),
    };
    const service = new TransactionsService(
      repository as never,
      accountsRepository as never,
      categoriesRepository as never,
      writeLockRepository as never,
      auditService as never,
      transactions as never,
    );

    return {
      accountsRepository,
      auditService,
      categoriesRepository,
      repository,
      service,
      transaction,
      transactions,
      writeLockRepository,
    };
  }

  it("lists and resolves detail only within the trusted organization", async () => {
    const { repository, service } = createHarness();
    const filters = { type: "expense" as const, page: 1, pageSize: 20 };

    await service.list(authContext, filters);
    await service.detail(authContext, { id: "transaction-1" });

    expect(repository.list).toHaveBeenCalledWith("organization-1", filters);
    expect(repository.findDetail).toHaveBeenCalledWith("organization-1", "transaction-1");
  });

  it("returns not found for a missing, deleted, internal, or cross-organization detail", async () => {
    const { repository, service } = createHarness();
    repository.findDetail.mockResolvedValue(null);

    await expect(service.detail(authContext, { id: "foreign-transaction" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("locks the organization before every create rule read and uses one executor throughout", async () => {
    const {
      accountsRepository,
      auditService,
      categoriesRepository,
      repository,
      service,
      transaction,
      writeLockRepository,
    } = createHarness();

    await expect(service.create(authContext, validInput)).resolves.toEqual(transactionRecord());

    expect(writeLockRepository.lockOrganization).toHaveBeenCalledWith(
      "organization-1",
      transaction,
    );
    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findLockedOrganizationContext.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(repository.findLockedOrganizationContext).toHaveBeenCalledWith(
      "organization-1",
      transaction,
    );
    expect(categoriesRepository.findActiveOwnedLedger).toHaveBeenCalledWith(
      "organization-1",
      validInput.ledgerId,
      transaction,
    );
    expect(accountsRepository.findActiveOwnedAccountsForUpdate).toHaveBeenCalledWith(
      "organization-1",
      [validInput.accountId],
      transaction,
    );
    expect(accountsRepository.findActiveOwnedAccount).not.toHaveBeenCalled();
    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      accountsRepository.findActiveOwnedAccountsForUpdate.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(
      accountsRepository.findActiveOwnedAccountsForUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      categoriesRepository.findActiveOwnedLedger.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        actorUserId: "user-1",
        occurredAt: new Date(validInput.occurredAt),
        occurredOn: "2026-08-24",
        payee: "商户",
        note: "晚餐",
      }),
      [{ accountId: validInput.accountId, amountMinor: -1_200 }],
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        actorUserId: "user-1",
        action: "transaction.created",
        targetType: "transaction",
        targetId: "transaction-1",
        result: "succeeded",
        metadata: { ledgerId: validInput.ledgerId, type: "expense" },
      },
      transaction,
    );
    expect(repository.findDetail).toHaveBeenCalledWith(
      "organization-1",
      "transaction-1",
      transaction,
    );
  });

  it("performs no organization, ledger, account or category reads when the organization lock fails", async () => {
    const { accountsRepository, categoriesRepository, repository, service, writeLockRepository } =
      createHarness();
    writeLockRepository.lockOrganization.mockResolvedValue(false);

    await expect(service.create(authContext, validInput)).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findLockedOrganizationContext).not.toHaveBeenCalled();
    expect(categoriesRepository.findActiveOwnedLedger).not.toHaveBeenCalled();
    expect(accountsRepository.findActiveOwnedAccountsForUpdate).not.toHaveBeenCalled();
    expect(categoriesRepository.findActiveOwnedCategory).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["ledger", "findActiveOwnedLedger" as const],
    ["source account", "findActiveOwnedAccountsForUpdate" as const],
    ["category", "findActiveOwnedCategory" as const],
  ])("hides a missing, deleted, or cross-organization %s", async (_title, method) => {
    const { accountsRepository, categoriesRepository, repository, service } = createHarness();
    if (method === "findActiveOwnedAccountsForUpdate") {
      accountsRepository.findActiveOwnedAccountsForUpdate.mockResolvedValue([]);
    } else if (method === "findActiveOwnedLedger") {
      categoriesRepository.findActiveOwnedLedger.mockResolvedValue(null);
    } else {
      categoriesRepository.findActiveOwnedCategory.mockResolvedValue(null);
    }

    await expect(service.create(authContext, validInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["income", undefined, undefined],
    ["expense", undefined, undefined],
    ["transfer", validInput.categoryId, "323e4567-e89b-12d3-a456-426614174999"],
  ] as const)("rejects invalid category/account shape for %s", async (type, categoryId, destinationAccountId) => {
    const { repository, service } = createHarness();

    await expect(
      service.create(authContext, { ...validInput, type, categoryId, destinationAccountId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects a category whose ledger or type does not match the effective transaction", async () => {
    const { categoriesRepository, repository, service } = createHarness();
    categoriesRepository.findActiveOwnedCategory
      .mockResolvedValueOnce({ ledgerId: "another-ledger", type: "expense" })
      .mockResolvedValueOnce({ ledgerId: validInput.ledgerId, type: "income" });

    await expect(service.create(authContext, validInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(authContext, validInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects same-account transfer and a deleted or cross-organization destination", async () => {
    const { accountsRepository, repository, service } = createHarness();
    const transfer = {
      ...validInput,
      type: "transfer" as const,
      categoryId: undefined,
      destinationAccountId: "423e4567-e89b-12d3-a456-426614174000",
    };

    await expect(
      service.create(authContext, { ...transfer, destinationAccountId: transfer.accountId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    accountsRepository.findActiveOwnedAccountsForUpdate.mockResolvedValue([
      { id: transfer.accountId },
    ]);
    await expect(service.create(authContext, transfer)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates a transfer with two balanced movements after validating both active accounts", async () => {
    const { accountsRepository, repository, service, transaction } = createHarness();
    const destinationAccountId = "123e4567-e89b-12d3-a456-426614174999";
    const transfer = {
      ...validInput,
      type: "transfer" as const,
      categoryId: undefined,
      destinationAccountId,
    };
    repository.findDetail.mockResolvedValue(transactionRecord("transfer"));

    await service.create(authContext, transfer);

    expect(accountsRepository.findActiveOwnedAccountsForUpdate).toHaveBeenCalledOnce();
    expect(accountsRepository.findActiveOwnedAccountsForUpdate).toHaveBeenCalledWith(
      "organization-1",
      [destinationAccountId, validInput.accountId],
      transaction,
    );
    expect(accountsRepository.findActiveOwnedAccount).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transfer", categoryId: null }),
      [
        { accountId: validInput.accountId, amountMinor: -1_200 },
        { accountId: destinationAccountId, amountMinor: 1_200 },
      ],
      transaction,
    );
  });

  it("validates locked organization currency and timezone before writing", async () => {
    const { repository, service } = createHarness();
    repository.findLockedOrganizationContext.mockResolvedValueOnce({
      baseCurrency: "invalid",
      timezone: "Asia/Shanghai",
    });

    await expect(service.create(authContext, validInput)).rejects.toThrow(
      "Organization base currency is invalid",
    );
    expect(repository.create).not.toHaveBeenCalled();

    repository.findLockedOrganizationContext.mockResolvedValueOnce({
      baseCurrency: "CNY",
      timezone: "Not/A_Timezone",
    });
    await expect(service.create(authContext, validInput)).rejects.toThrow("组织时区无效");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("requires the account lock result to contain exactly every requested transfer account", async () => {
    const { accountsRepository, repository, service } = createHarness();
    const destinationAccountId = "423e4567-e89b-12d3-a456-426614174000";
    const transfer = {
      ...validInput,
      type: "transfer" as const,
      categoryId: undefined,
      destinationAccountId,
    };
    accountsRepository.findActiveOwnedAccountsForUpdate.mockResolvedValue([
      { id: validInput.accountId },
      { id: "unexpected-account" },
    ]);

    await expect(service.create(authContext, transfer)).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("locks organization then current transaction before update rule reads and rebuilds in one executor", async () => {
    const {
      accountsRepository,
      auditService,
      categoriesRepository,
      repository,
      service,
      transaction,
      writeLockRepository,
    } = createHarness();
    const dto = { id: "transaction-1", ...validInput, type: "income" as const };
    categoriesRepository.findActiveOwnedCategory.mockResolvedValue({
      ledgerId: validInput.ledgerId,
      type: "income",
    });
    repository.findDetail.mockResolvedValue(transactionRecord("income"));

    await service.update(authContext, dto);

    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findActiveOwnedForUpdate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(repository.findActiveOwnedForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      accountsRepository.findActiveOwnedAccountsForUpdate.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(
      accountsRepository.findActiveOwnedAccountsForUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      categoriesRepository.findActiveOwnedLedger.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(repository.findActiveOwnedForUpdate).toHaveBeenCalledWith(
      "organization-1",
      "transaction-1",
      transaction,
    );
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "transaction-1", type: "income" }),
      [{ accountId: validInput.accountId, amountMinor: 1_200 }],
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "transaction.updated",
        targetId: "transaction-1",
        metadata: expect.objectContaining({ type: "income", changedFields: expect.any(Array) }),
      }),
      transaction,
    );
    const metadata = auditService.appendRequired.mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(metadata)).not.toContain("晚餐");
    expect(JSON.stringify(metadata)).not.toContain("商户");
  });

  it("returns not found before update validation when the active transaction cannot be locked", async () => {
    const { accountsRepository, categoriesRepository, repository, service } = createHarness();
    repository.findActiveOwnedForUpdate.mockResolvedValue(null);

    await expect(
      service.update(authContext, { id: "foreign-transaction", ...validInput }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(categoriesRepository.findActiveOwnedLedger).not.toHaveBeenCalled();
    expect(accountsRepository.findActiveOwnedAccountsForUpdate).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("locks organization then transaction and soft deletes only through the transactional workflow", async () => {
    const { auditService, repository, service, transaction, writeLockRepository } = createHarness();

    await service.delete(authContext, { id: "transaction-1" });

    expect(writeLockRepository.lockOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findActiveOwnedForUpdate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(repository.softDelete).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        id: "transaction-1",
        deletedByUserId: "user-1",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "transaction.deleted",
        targetId: "transaction-1",
        metadata: { type: "expense" },
      }),
      transaction,
    );
  });
});

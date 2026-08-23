import type {
  AccountSummary,
  CategoryNode,
  LedgerSummary,
  MonthlyStatistics,
  TransactionPage,
  TransactionRecord,
} from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";

import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { bookkeepingTestIds } from "../../test/bookkeeping-test-harness.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

type InjectResponse = {
  payload: string;
  statusCode: number;
};

type WriteCase = {
  title: string;
  url: string;
  payload: Record<string, unknown>;
};

const occurredAt = "2026-08-23T08:30:00.000Z";

/** 断言成功 HTTP 响应的状态码与统一响应信封。 */
function expectOk<T>(response: InjectResponse, statusCode = 200): T {
  expect(response.statusCode).toBe(statusCode);
  const body = parseJson<{ code: string; message: string; data: T }>(response);
  expect(body).toEqual({ code: "OK", message: "ok", data: expect.anything() });
  return body.data;
}

/** 断言无业务返回值的成功 HTTP 响应。 */
function expectEmptyOk(response: InjectResponse): void {
  expect(response.statusCode).toBe(200);
  expect(parseJson(response)).toEqual({ code: "OK", message: "ok", data: null });
}

/** 断言失败 HTTP 响应的精确状态码、错误码及统一信封。 */
function expectApiError(response: InjectResponse, statusCode: number, code: string): void {
  expect(response.statusCode).toBe(statusCode);
  expect(parseJson(response)).toEqual({ code, message: expect.any(String), data: null });
}

describe("Bookkeeping e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  /** 创建启用真实记账 HTTP 路由和内存持久化边界的测试应用。 */
  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp({ bookkeeping: true });
    return harness;
  }

  /** 使用指定测试用户登录并生成真实 Bearer 请求头。 */
  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }

  it("owner exercises every bookkeeping interface and creates income, expense and transfer", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");

    const ledgers = expectOk<LedgerSummary[]>(
      await app.inject({ method: "GET", url: "/api/ledgers/list", headers }),
    );
    expect(ledgers).toEqual([
      expect.objectContaining({ id: bookkeepingTestIds.ledger, isDefault: true, type: "personal" }),
    ]);

    const firstAccount = expectOk<AccountSummary>(
      await app.inject({
        method: "POST",
        url: "/api/accounts/create",
        headers,
        payload: { name: "银行卡", type: "bank", initialBalanceMinor: 500 },
      }),
    );
    const secondAccount = expectOk<AccountSummary>(
      await app.inject({
        method: "POST",
        url: "/api/accounts/create",
        headers,
        payload: { name: "微信零钱", type: "e_wallet" },
      }),
    );
    const updatedAccount = expectOk<AccountSummary>(
      await app.inject({
        method: "POST",
        url: "/api/accounts/update",
        headers,
        payload: { id: secondAccount.id, name: "微信钱包" },
      }),
    );
    expect(updatedAccount.name).toBe("微信钱包");
    expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );

    const incomeCategory = expectOk<CategoryNode>(
      await app.inject({
        method: "POST",
        url: "/api/categories/create",
        headers,
        payload: { ledgerId: bookkeepingTestIds.ledger, type: "income", name: "工资" },
      }),
    );
    const expenseCategory = expectOk<CategoryNode>(
      await app.inject({
        method: "POST",
        url: "/api/categories/create",
        headers,
        payload: { ledgerId: bookkeepingTestIds.ledger, type: "expense", name: "餐饮" },
      }),
    );
    const temporaryCategory = expectOk<CategoryNode>(
      await app.inject({
        method: "POST",
        url: "/api/categories/create",
        headers,
        payload: { ledgerId: bookkeepingTestIds.ledger, type: "expense", name: "临时" },
      }),
    );
    expectOk<CategoryNode>(
      await app.inject({
        method: "POST",
        url: "/api/categories/update",
        headers,
        payload: { id: temporaryCategory.id, name: "临时分类" },
      }),
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/categories/delete",
        headers,
        payload: { id: temporaryCategory.id },
      }),
    );
    expectOk<CategoryNode[]>(
      await app.inject({
        method: "GET",
        url: `/api/categories/list?ledgerId=${bookkeepingTestIds.ledger}`,
        headers,
      }),
    );

    const income = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "income",
          accountId: firstAccount.id,
          categoryId: incomeCategory.id,
          amountMinor: 2_000,
          occurredAt,
        },
      }),
    );
    const expense = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: firstAccount.id,
          categoryId: expenseCategory.id,
          amountMinor: 300,
          occurredAt,
        },
      }),
    );
    const transfer = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "transfer",
          accountId: firstAccount.id,
          destinationAccountId: secondAccount.id,
          amountMinor: 400,
          occurredAt,
        },
      }),
    );
    expect(income).toMatchObject({
      type: "income",
      accountId: firstAccount.id,
      amountMinor: 2_000,
    });
    expect(expense).toMatchObject({
      type: "expense",
      accountId: firstAccount.id,
      amountMinor: 300,
    });
    expect(transfer).toMatchObject({
      type: "transfer",
      accountId: firstAccount.id,
      destinationAccountId: secondAccount.id,
      amountMinor: 400,
    });
    expect(
      state.bookkeeping.movements.filter((movement) => movement.transactionId === transfer.id),
    ).toEqual([
      {
        organizationId: testIds.organization,
        transactionId: transfer.id,
        accountId: firstAccount.id,
        amountMinor: -400,
      },
      {
        organizationId: testIds.organization,
        transactionId: transfer.id,
        accountId: secondAccount.id,
        amountMinor: 400,
      },
    ]);
    const updatedIncome = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/update",
        headers,
        payload: {
          id: income.id,
          ledgerId: bookkeepingTestIds.ledger,
          type: "income",
          accountId: firstAccount.id,
          categoryId: incomeCategory.id,
          amountMinor: 2_000,
          occurredAt,
          note: "更新工资",
        },
      }),
    );
    expect(updatedIncome).toMatchObject({ id: income.id, note: "更新工资", amountMinor: 2_000 });

    expectOk<TransactionRecord>(
      await app.inject({
        method: "GET",
        url: `/api/transactions/detail?id=${income.id}`,
        headers,
      }),
    );
    expectOk<TransactionPage>(
      await app.inject({ method: "GET", url: "/api/transactions/list", headers }),
    );
    const accountsAfterTransactions = expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );
    expect(
      accountsAfterTransactions.find((account) => account.id === firstAccount.id)?.balanceMinor,
    ).toBe(1_800);
    expect(
      accountsAfterTransactions.find((account) => account.id === secondAccount.id)?.balanceMinor,
    ).toBe(400);
    const statistics = expectOk<MonthlyStatistics>(
      await app.inject({ method: "GET", url: "/api/statistics/monthly?month=2026-08", headers }),
    );
    expect(statistics).toEqual({
      currency: "CNY",
      incomeMinor: 2_000,
      expenseMinor: 300,
      netMinor: 1_700,
      expenseCategories: [
        {
          categoryId: expenseCategory.id,
          categoryName: "餐饮",
          amountMinor: 300,
          percentage: 100,
        },
      ],
    });

    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/transactions/delete",
        headers,
        payload: { id: transfer.id },
      }),
    );

    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/accounts/delete",
        headers,
        payload: { id: secondAccount.id },
      }),
    );
    const openingBalanceTransaction = [...state.bookkeeping.transactions.values()].find(
      (transaction) =>
        transaction.type === "excluded_inflow" &&
        state.bookkeeping.movements.some(
          (movement) =>
            movement.transactionId === transaction.id && movement.accountId === firstAccount.id,
        ),
    );
    if (!openingBalanceTransaction) throw new Error("测试期初余额交易不存在");
    const auditBase = {
      organizationId: testIds.organization,
      actorUserId: testIds.ownerUser,
      result: "succeeded",
    };
    const auditLogs = state.auditLogs.map((log) => ({
      organizationId: log.organizationId,
      actorUserId: log.actorUserId,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      result: log.result,
      metadata: log.metadata,
    }));
    expect(auditLogs).toEqual([
      {
        ...auditBase,
        action: "auth.login.succeeded",
        targetType: "session",
        targetId: "session-1",
        metadata: { clientType: "web_pc", deviceName: undefined },
      },
      {
        ...auditBase,
        action: "account.created",
        targetType: "account",
        targetId: firstAccount.id,
        metadata: { openingBalanceTransactionId: openingBalanceTransaction.id },
      },
      {
        ...auditBase,
        action: "account.created",
        targetType: "account",
        targetId: secondAccount.id,
        metadata: {},
      },
      {
        ...auditBase,
        action: "account.updated",
        targetType: "account",
        targetId: secondAccount.id,
        metadata: { changedFields: ["name"] },
      },
      {
        ...auditBase,
        action: "category.created",
        targetType: "category",
        targetId: incomeCategory.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "income", parentId: null },
      },
      {
        ...auditBase,
        action: "category.created",
        targetType: "category",
        targetId: expenseCategory.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "expense", parentId: null },
      },
      {
        ...auditBase,
        action: "category.created",
        targetType: "category",
        targetId: temporaryCategory.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "expense", parentId: null },
      },
      {
        ...auditBase,
        action: "category.updated",
        targetType: "category",
        targetId: temporaryCategory.id,
        metadata: { changedFields: ["name"] },
      },
      {
        ...auditBase,
        action: "category.deleted",
        targetType: "category",
        targetId: temporaryCategory.id,
        metadata: {},
      },
      {
        ...auditBase,
        action: "transaction.created",
        targetType: "transaction",
        targetId: income.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "income" },
      },
      {
        ...auditBase,
        action: "transaction.created",
        targetType: "transaction",
        targetId: expense.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "expense" },
      },
      {
        ...auditBase,
        action: "transaction.created",
        targetType: "transaction",
        targetId: transfer.id,
        metadata: { ledgerId: bookkeepingTestIds.ledger, type: "transfer" },
      },
      {
        ...auditBase,
        action: "transaction.updated",
        targetType: "transaction",
        targetId: income.id,
        metadata: {
          type: "income",
          changedFields: [
            "ledgerId",
            "type",
            "accountId",
            "destinationAccountId",
            "categoryId",
            "amountMinor",
            "occurredAt",
            "payee",
            "note",
          ],
        },
      },
      {
        ...auditBase,
        action: "transaction.deleted",
        targetType: "transaction",
        targetId: transfer.id,
        metadata: { type: "transfer" },
      },
      {
        ...auditBase,
        action: "account.deleted",
        targetType: "account",
        targetId: secondAccount.id,
        metadata: {},
      },
    ]);
  });

  it("member creates and updates a transaction but cannot delete it", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000002");
    const created = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 100,
          occurredAt,
        },
      }),
    );
    const updated = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/update",
        headers,
        payload: {
          id: created.id,
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 125,
          occurredAt,
        },
      }),
    );
    expect(updated.amountMinor).toBe(125);

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/transactions/delete",
        headers,
        payload: { id: created.id },
      }),
      403,
      "FORBIDDEN",
    );
  });

  it("viewer receives 403 from every bookkeeping write interface", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000003");
    const writeCases: WriteCase[] = [
      {
        title: "account create",
        url: "/api/accounts/create",
        payload: { name: "禁止", type: "cash" },
      },
      {
        title: "account update",
        url: "/api/accounts/update",
        payload: { id: bookkeepingTestIds.account, name: "禁止" },
      },
      {
        title: "account delete",
        url: "/api/accounts/delete",
        payload: { id: bookkeepingTestIds.account },
      },
      {
        title: "category create",
        url: "/api/categories/create",
        payload: { ledgerId: bookkeepingTestIds.ledger, type: "expense", name: "禁止" },
      },
      {
        title: "category update",
        url: "/api/categories/update",
        payload: { id: bookkeepingTestIds.expenseCategory, name: "禁止" },
      },
      {
        title: "category delete",
        url: "/api/categories/delete",
        payload: { id: bookkeepingTestIds.expenseCategory },
      },
      {
        title: "transaction create",
        url: "/api/transactions/create",
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 1,
          occurredAt,
        },
      },
      {
        title: "transaction update",
        url: "/api/transactions/update",
        payload: {
          id: bookkeepingTestIds.transaction,
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 1,
          occurredAt,
        },
      },
      {
        title: "transaction delete",
        url: "/api/transactions/delete",
        payload: { id: bookkeepingTestIds.transaction },
      },
    ];

    for (const testCase of writeCases) {
      const response = await app.inject({
        method: "POST",
        url: testCase.url,
        headers,
        payload: testCase.payload,
      });
      expectApiError(response, 403, "FORBIDDEN");
    }
  });

  it("rejects unauthenticated bookkeeping requests", async () => {
    const { app } = await createHarness();
    expectApiError(
      await app.inject({ method: "GET", url: "/api/transactions/list" }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("rejects an invalid amount and a same-account transfer with 400", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000001");

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 0,
          occurredAt,
        },
      }),
      400,
      "VALIDATION_FAILED",
    );
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "transfer",
          accountId: bookkeepingTestIds.account,
          destinationAccountId: bookkeepingTestIds.account,
          amountMinor: 100,
          occurredAt,
        },
      }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rolls back account, opening transaction, movement and audit when required audit fails", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const accountsBefore = expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );
    const accountCount = state.bookkeeping.accounts.size;
    const transactionCount = state.bookkeeping.transactions.size;
    const movementCount = state.bookkeeping.movements.length;
    const auditCount = state.auditLogs.length;
    const transactionsBefore = [...state.bookkeeping.transactions].map(([id, transaction]) => [
      id,
      { ...transaction },
    ]);
    const movementsBefore = state.bookkeeping.movements.map((movement) => ({ ...movement }));
    const auditLogsBefore = state.auditLogs.map((log) => ({ ...log }));
    state.failNextRequiredAuditAppend = true;

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/accounts/create",
        headers,
        payload: { name: "应回滚账户", type: "cash", initialBalanceMinor: 100 },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect(state.bookkeeping.accounts.size).toBe(accountCount);
    expect(state.bookkeeping.transactions.size).toBe(transactionCount);
    expect(state.bookkeeping.movements).toHaveLength(movementCount);
    expect(state.auditLogs).toHaveLength(auditCount);
    expect([...state.bookkeeping.transactions]).toEqual(transactionsBefore);
    expect(state.bookkeeping.movements).toEqual(movementsBefore);
    expect(state.auditLogs).toEqual(auditLogsBefore);
    expect(state.failNextRequiredAuditAppend).toBe(false);
    expect(
      [...state.bookkeeping.accounts.values()].some((account) => account.name === "应回滚账户"),
    ).toBe(false);
    const accountsAfter = expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );
    expect(accountsAfter).toEqual(accountsBefore);
  });

  it("returns 404 for cross-organization resource IDs", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/accounts/update",
        headers,
        payload: { id: bookkeepingTestIds.otherAccount, name: "越权" },
      }),
      app.inject({
        method: "GET",
        url: `/api/categories/list?ledgerId=${bookkeepingTestIds.otherLedger}`,
        headers,
      }),
      app.inject({
        method: "GET",
        url: `/api/transactions/detail?id=${bookkeepingTestIds.otherTransaction}`,
        headers,
      }),
      app.inject({
        method: "GET",
        url: `/api/statistics/monthly?month=2026-08&ledgerId=${bookkeepingTestIds.otherLedger}`,
        headers,
      }),
    ]);

    for (const response of responses) expectApiError(response, 404, "NOT_FOUND");
  });

  it("soft delete removes a transaction and reverses account balance and monthly statistics", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const created = expectOk<TransactionRecord>(
      await app.inject({
        method: "POST",
        url: "/api/transactions/create",
        headers,
        payload: {
          ledgerId: bookkeepingTestIds.ledger,
          type: "expense",
          accountId: bookkeepingTestIds.account,
          categoryId: bookkeepingTestIds.expenseCategory,
          amountMinor: 275,
          occurredAt,
        },
      }),
    );
    const accountsBefore = expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );
    const statisticsBefore = expectOk<MonthlyStatistics>(
      await app.inject({ method: "GET", url: "/api/statistics/monthly?month=2026-08", headers }),
    );

    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/transactions/delete",
        headers,
        payload: { id: created.id },
      }),
    );

    const accountsAfter = expectOk<AccountSummary[]>(
      await app.inject({ method: "GET", url: "/api/accounts/list", headers }),
    );
    const statisticsAfter = expectOk<MonthlyStatistics>(
      await app.inject({ method: "GET", url: "/api/statistics/monthly?month=2026-08", headers }),
    );
    const page = expectOk<TransactionPage>(
      await app.inject({ method: "GET", url: "/api/transactions/list", headers }),
    );
    expect(
      accountsAfter.find((account) => account.id === bookkeepingTestIds.account)?.balanceMinor,
    ).toBe(
      (accountsBefore.find((account) => account.id === bookkeepingTestIds.account)?.balanceMinor ??
        0) + 275,
    );
    expect(statisticsAfter.expenseMinor).toBe(statisticsBefore.expenseMinor - 275);
    expect(page.items.map((item) => item.id)).not.toContain(created.id);
    expectApiError(
      await app.inject({
        method: "GET",
        url: `/api/transactions/detail?id=${created.id}`,
        headers,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("returns a stable pagination envelope and honors transaction filters", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000001");
    for (const amountMinor of [101, 102, 103]) {
      expectOk<TransactionRecord>(
        await app.inject({
          method: "POST",
          url: "/api/transactions/create",
          headers,
          payload: {
            ledgerId: bookkeepingTestIds.ledger,
            type: "expense",
            accountId: bookkeepingTestIds.account,
            categoryId: bookkeepingTestIds.expenseCategory,
            amountMinor,
            occurredAt,
            note: "分页筛选",
          },
        }),
      );
    }

    const page = expectOk<TransactionPage>(
      await app.inject({
        method: "GET",
        url: `/api/transactions/list?page=2&pageSize=2&type=expense&accountId=${bookkeepingTestIds.account}&keyword=${encodeURIComponent("分页筛选")}`,
        headers,
      }),
    );
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
  });
});

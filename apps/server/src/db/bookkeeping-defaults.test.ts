import { describe, expect, it } from "vitest";

import {
  deriveDefaultAccountId,
  deriveDefaultCategoryId,
  deriveDefaultLedgerId,
} from "./bookkeeping-default-identities.js";
import {
  BOOKKEEPING_DEFAULTS,
  type BookkeepingDefaultAccountInsert,
  type BookkeepingDefaultCategoryInsert,
  type BookkeepingDefaultLedgerInsert,
  type BookkeepingDefaultsExecutor,
  initializeBookkeepingDefaults,
} from "./bookkeeping-defaults.js";

const organizationId = "11111111-1111-1111-1111-111111111111";
const actorUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("initializeBookkeepingDefaults", () => {
  it("creates the complete deterministic organization-scoped default plan only once", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();

    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });
    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(BOOKKEEPING_DEFAULTS.ledger.name).toBe("个人账本");
    expect(BOOKKEEPING_DEFAULTS.account.name).toBe("现金");
    expect(BOOKKEEPING_DEFAULTS.expenseCategories.map((category) => category.name)).toEqual([
      "餐饮",
      "交通",
      "购物",
      "居住",
      "娱乐",
      "医疗",
      "教育",
      "人情",
      "其他",
    ]);
    expect(BOOKKEEPING_DEFAULTS.incomeCategories.map((category) => category.name)).toEqual([
      "工资",
      "奖金",
      "兼职",
      "理财",
      "其他",
    ]);
    expect(executor.insertedLedgers).toEqual([
      {
        id: "653a20e7-e1d0-8a21-9f35-57059e9dd71d",
        organizationId,
        name: "个人账本",
        type: "personal",
        isDefault: true,
        createdByUserId: actorUserId,
      },
    ]);
    expect(executor.insertedAccounts).toEqual([
      {
        id: "8fac6e23-21b1-84d4-8e37-1c4cbc3bb389",
        organizationId,
        name: "现金",
        type: "cash",
        sortOrder: 0,
        createdByUserId: actorUserId,
      },
    ]);
    expect(executor.insertedCategories).toHaveLength(14);
    expect(
      executor.insertedCategories.filter((category) => category.type === "expense"),
    ).toHaveLength(9);
    expect(
      executor.insertedCategories.filter((category) => category.type === "income"),
    ).toHaveLength(5);
    expect(executor.insertedCategories.find((category) => category.name === "餐饮")?.id).toBe(
      "2601e1a3-2ec6-856b-ba9b-48dc82b0dc19",
    );
    expect(executor.insertedCategories.find((category) => category.name === "工资")?.id).toBe(
      "833b81b1-4f27-816a-9ccf-a55db33e7c14",
    );
    expect(
      executor.insertedCategories.every((category) => category.organizationId === organizationId),
    ).toBe(true);
    expect(
      executor.insertedCategories.every(
        (category) => category.ledgerId === deriveDefaultLedgerId(organizationId),
      ),
    ).toBe(true);
    expect(executor.insertedCategories.every((category) => category.parentId === null)).toBe(true);
    expect(
      executor.insertedCategories.every((category) => category.createdByUserId === actorUserId),
    ).toBe(true);
  });

  it("uses an existing active default personal ledger before attempting an insert", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();
    executor.ledgers.push({
      id: "22222222-2222-2222-2222-222222222222",
      organizationId,
      name: "我的日常账本",
      type: "personal",
      isDefault: true,
      createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      deletedAt: null,
    });

    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(executor.insertedLedgers).toEqual([]);
    expect(
      executor.insertedCategories.every(
        (category) => category.ledgerId === "22222222-2222-2222-2222-222222222222",
      ),
    ).toBe(true);
  });

  it("does not recreate or rename defaults after the cash account and a category are renamed", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();
    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });
    const cashAccount = executor.accounts.find(
      (account) => account.id === deriveDefaultAccountId(organizationId),
    );
    const diningCategory = executor.categories.find((category) => category.name === "餐饮");

    if (!cashAccount || !diningCategory) {
      throw new Error("default account and category must exist after initialization");
    }

    cashAccount.name = "随身现金";
    diningCategory.name = "吃喝";
    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(executor.insertedAccounts).toHaveLength(1);
    expect(executor.insertedCategories).toHaveLength(14);
    expect(cashAccount.name).toBe("随身现金");
    expect(diningCategory.name).toBe("吃喝");
  });

  it.each([
    ["active", null],
    ["soft-deleted", new Date("2026-08-02T00:00:00.000Z")],
  ])("reuses a %s legacy cash account with a random ID", async (_state, deletedAt) => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();
    executor.accounts.push({
      id: "33333333-3333-3333-3333-333333333333",
      organizationId,
      name: "现金",
      type: "cash",
      sortOrder: 77,
      createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      deletedAt,
    });

    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(executor.insertedAccounts).toEqual([]);
    expect(executor.accounts).toEqual([
      expect.objectContaining({
        id: "33333333-3333-3333-3333-333333333333",
        name: "现金",
        deletedAt,
      }),
    ]);
  });

  it("reuses legacy random-ID root categories but does not confuse a same-name child", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();
    const ledgerId = "22222222-2222-2222-2222-222222222222";
    executor.ledgers.push({
      id: ledgerId,
      organizationId,
      name: "个人账本",
      type: "personal",
      isDefault: true,
      createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      deletedAt: null,
    });
    executor.categories.push(
      {
        id: "44444444-4444-4444-4444-444444444444",
        organizationId,
        ledgerId,
        type: "expense",
        parentId: null,
        name: "餐饮",
        sortOrder: 88,
        createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        deletedAt: null,
      },
      {
        id: "55555555-5555-5555-5555-555555555555",
        organizationId,
        ledgerId,
        type: "income",
        parentId: null,
        name: "工资",
        sortOrder: 89,
        createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        deletedAt: new Date("2026-08-03T00:00:00.000Z"),
      },
      {
        id: "66666666-6666-6666-6666-666666666666",
        organizationId,
        ledgerId,
        type: "expense",
        parentId: "77777777-7777-7777-7777-777777777777",
        name: "交通",
        sortOrder: 90,
        createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        deletedAt: null,
      },
    );

    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(executor.insertedCategories).toHaveLength(12);
    expect(executor.insertedCategories.some((category) => category.name === "餐饮")).toBe(false);
    expect(executor.insertedCategories.some((category) => category.name === "工资")).toBe(false);
    expect(executor.insertedCategories.filter((category) => category.name === "交通")).toHaveLength(
      1,
    );
  });

  it("keeps a soft-deleted default category and does not recreate or rename it", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();
    const ledgerId = "22222222-2222-2222-2222-222222222222";
    const diningCategoryId = deriveDefaultCategoryId(organizationId, ledgerId, "expense", "dining");
    executor.ledgers.push({
      id: ledgerId,
      organizationId,
      name: "个人账本",
      type: "personal",
      isDefault: true,
      createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      deletedAt: null,
    });
    executor.categories.push({
      id: diningCategoryId,
      organizationId,
      ledgerId,
      type: "expense",
      parentId: null,
      name: "餐饮",
      sortOrder: 99,
      createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      deletedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    await initializeBookkeepingDefaults(executor, { organizationId, actorUserId });

    expect(executor.insertedCategories).toHaveLength(13);
    expect(executor.insertedCategories.some((category) => category.name === "餐饮")).toBe(false);
    expect(executor.categories.filter((category) => category.id === diningCategoryId)).toEqual([
      expect.objectContaining({
        deletedAt: new Date("2026-08-01T00:00:00.000Z"),
        sortOrder: 99,
        createdByUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
    ]);
  });

  it("converges concurrent initialization attempts on the same deterministic primary keys", async () => {
    const executor = new InMemoryBookkeepingDefaultsExecutor();

    await Promise.all([
      initializeBookkeepingDefaults(executor, { organizationId, actorUserId }),
      initializeBookkeepingDefaults(executor, { organizationId, actorUserId }),
    ]);

    expect(executor.insertedLedgers).toHaveLength(1);
    expect(executor.insertedAccounts).toHaveLength(1);
    expect(executor.insertedCategories).toHaveLength(14);
    expect(new Set(executor.categories.map((category) => category.id)).size).toBe(14);
  });
});

type LedgerRow = BookkeepingDefaultLedgerInsert & { deletedAt: Date | null };
type AccountRow = BookkeepingDefaultAccountInsert & { deletedAt: Date | null };
type CategoryRow = Omit<BookkeepingDefaultCategoryInsert, "parentId"> & {
  parentId: string | null;
  deletedAt: Date | null;
};

class InMemoryBookkeepingDefaultsExecutor implements BookkeepingDefaultsExecutor {
  readonly ledgers: LedgerRow[] = [];
  readonly accounts: AccountRow[] = [];
  readonly categories: CategoryRow[] = [];
  readonly insertedLedgers: BookkeepingDefaultLedgerInsert[] = [];
  readonly insertedAccounts: BookkeepingDefaultAccountInsert[] = [];
  readonly insertedCategories: BookkeepingDefaultCategoryInsert[] = [];

  async findActiveDefaultPersonalLedger(inputOrganizationId: string) {
    return this.ledgers.find(
      (ledger) =>
        ledger.organizationId === inputOrganizationId &&
        ledger.type === "personal" &&
        ledger.isDefault &&
        ledger.deletedAt === null,
    );
  }

  async insertDefaultPersonalLedger(input: BookkeepingDefaultLedgerInsert) {
    if (this.ledgers.some((ledger) => ledger.id === input.id)) {
      return undefined;
    }

    this.insertedLedgers.push(input);
    this.ledgers.push({ ...input, deletedAt: null });
    return { id: input.id };
  }

  async findExistingDefaultAccount(input: { organizationId: string; id: string; name: string }) {
    return this.accounts.find(
      (account) =>
        account.organizationId === input.organizationId &&
        (account.id === input.id || account.name === input.name),
    );
  }

  async insertDefaultAccount(input: BookkeepingDefaultAccountInsert) {
    if (this.accounts.some((account) => account.id === input.id)) {
      return;
    }

    this.insertedAccounts.push(input);
    this.accounts.push({ ...input, deletedAt: null });
  }

  async findExistingRootCategories(input: {
    organizationId: string;
    ledgerId: string;
    type: "income" | "expense";
    ids: readonly string[];
    names: readonly string[];
  }) {
    return this.categories
      .filter(
        (category) =>
          category.organizationId === input.organizationId &&
          category.ledgerId === input.ledgerId &&
          category.type === input.type &&
          category.parentId === null &&
          (input.ids.includes(category.id) || input.names.includes(category.name)),
      )
      .map((category) => ({ id: category.id, name: category.name }));
  }

  async insertRootCategories(inputs: BookkeepingDefaultCategoryInsert[]) {
    for (const input of inputs) {
      if (!this.categories.some((category) => category.id === input.id)) {
        this.insertedCategories.push(input);
        this.categories.push({ ...input, deletedAt: null });
      }
    }
  }
}

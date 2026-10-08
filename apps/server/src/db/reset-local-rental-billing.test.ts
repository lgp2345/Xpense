import { beforeEach, expect, it, vi } from "vitest";
import {
  assertLocalRentalDatabase,
  assertRentalResetDependencies,
  parseRentalBillingResetArgs,
  rentalBillingResetTables,
  resetLocalRentalBilling,
} from "./reset-local-rental-billing.js";

it("默认仅演练，必填组织，不允许隐式全库范围", () => {
  const options = parseRentalBillingResetArgs([
    "--organization-id",
    "00000000-0000-4000-8000-000000000001",
  ]);
  expect(options.apply).toBe(false);
  expect(() => parseRentalBillingResetArgs([])).toThrow(/组织/);
  expect(() => parseRentalBillingResetArgs(["--all"])).toThrow();
});
it("非本地目标与连接参数覆盖拒绝，错误不包含凭据", () => {
  expect(() =>
    assertLocalRentalDatabase("postgres://synthetic:placeholder@example.test/dev"),
  ).toThrow("拒绝写入：目标不是受支持的本地开发数据库");
  expect(() => assertLocalRentalDatabase("postgres://localhost/dev?options=unsafe")).toThrow();
  expect(() => assertLocalRentalDatabase("postgres://localhost/dev")).not.toThrow();
});
it("只清理明确账务依赖，用户组织房产合同和记账交易不在清单", () => {
  for (const table of [
    "users",
    "organizations",
    "rental_properties",
    "rental_spaces",
    "rental_tenants",
    "rental_contracts",
    "transactions",
    "accounts",
  ])
    expect(rentalBillingResetTables).not.toContain(table);
});
it("余额交易引用阻断清理，不能裸删关系造成账不平", () => {
  expect(() =>
    assertRentalResetDependencies([
      { table: "transactions", referencedTable: "rental_cash_entries" },
    ]),
  ).toThrow(/原业务撤销/);
  expect(() =>
    assertRentalResetDependencies([
      { table: "rental_bill_lines", referencedTable: "rental_bills" },
    ]),
  ).not.toThrow();
});
const mocked = vi.hoisted(() => ({ queries: [] as string[] }));
vi.mock("postgres", () => ({
  default: () => {
    const tx = (strings: TemplateStringsArray | string) => {
      if (typeof strings === "string") return strings;
      const query = strings.join("?");
      mocked.queries.push(query);
      if (query.includes("FROM organizations")) return Promise.resolve([{ id: "org" }]);
      if (query.includes("FROM rental_contracts")) return Promise.resolve([{ id: "contract" }]);
      if (query.includes("FROM pg_tables")) return Promise.resolve([{ tablename: "rental_bills" }]);
      if (query.includes("FROM pg_constraint")) return Promise.resolve([]);
      return Promise.resolve([{ count: 3 }]);
    };
    return {
      begin: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
      end: vi.fn(),
    };
  },
}));
beforeEach(() => {
  mocked.queries.length = 0;
});
it("默认演练锁定明确范围并统计，但没有 DELETE", async () => {
  const options = { organizationId: "00000000-0000-4000-8000-000000000001", apply: false };
  expect(await resetLocalRentalBilling("postgres://localhost/dev", options)).toMatchObject({
    mode: "dry-run",
    counts: { rental_bills: 3 },
  });
  expect(mocked.queries.some((query) => query.startsWith("DELETE"))).toBe(false);
  expect(mocked.queries.some((query) => query.includes("FOR UPDATE"))).toBe(true);
});
it("明确 apply 才在同一作用域删除清单内账务", async () => {
  await resetLocalRentalBilling("postgres://localhost/dev", {
    organizationId: "00000000-0000-4000-8000-000000000001",
    apply: true,
  });
  expect(mocked.queries.filter((query) => query.startsWith("DELETE"))).toEqual([
    "DELETE FROM ? WHERE organization_id=? AND contract_id=ANY(?::uuid[])",
  ]);
});

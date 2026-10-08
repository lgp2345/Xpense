import { describe, expect, it, vi } from "vitest";
import {
  assertLocalRentalDatabase,
  assertRentalResetDependencies,
  parseRentalBillingResetArgs,
  rentalBillingResetTables,
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

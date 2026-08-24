import type { CategoryNode } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { formatIsoForLocalDateTime, localDateTimeToIso } from "./transaction-date-time";
import { isTransactionCategoryCompatible } from "./transaction-form-schema";

describe("交易本地日期时间转换", () => {
  it("在 UTC+8 跨日时把 ISO 精确回填为浏览器本地 datetime-local", () => {
    expect(formatIsoForLocalDateTime("2026-08-23T16:30:00.000Z", -480)).toBe("2026-08-24T00:30");
  });

  it("在 UTC+8 跨日时把浏览器本地 datetime-local 精确提交为 ISO", () => {
    expect(localDateTimeToIso("2026-08-24T00:30", -480)).toBe("2026-08-23T16:30:00.000Z");
  });
});

describe("交易分类兼容性", () => {
  const category: CategoryNode = {
    id: "category-expense-a",
    ledgerId: "ledger-a",
    type: "expense",
    parentId: null,
    name: "餐饮",
    icon: null,
    color: null,
    sortOrder: 0,
    children: [],
  };

  it("拒绝来自其他账本或其他交易类型的分类", () => {
    expect(
      isTransactionCategoryCompatible(
        { categoryId: category.id, ledgerId: "ledger-b", type: "expense" },
        [category],
      ),
    ).toBe(false);
    expect(
      isTransactionCategoryCompatible(
        { categoryId: category.id, ledgerId: "ledger-a", type: "income" },
        [category],
      ),
    ).toBe(false);
  });

  it("接受当前账本与交易类型下的分类，并允许转账无分类", () => {
    expect(
      isTransactionCategoryCompatible(
        { categoryId: category.id, ledgerId: "ledger-a", type: "expense" },
        [category],
      ),
    ).toBe(true);
    expect(
      isTransactionCategoryCompatible({ categoryId: "", ledgerId: "ledger-a", type: "transfer" }, [
        category,
      ]),
    ).toBe(true);
  });
});

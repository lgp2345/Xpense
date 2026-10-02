import { describe, expect, it } from "vitest";
import { parseSignedMoneyMinor, toMonthlyBillPreviewRequest } from "./monthly-bill-form";

describe("月度账单金额录入", () => {
  it.each([
    ["-100", -10000],
    ["-0.35", -35],
    ["250.4", 25040],
    ["+0.01", 1],
  ])("把十进制 %s 精确解析为最小单位 %s", (input, expected) => {
    expect(parseSignedMoneyMinor(input)).toBe(expected);
  });

  it.each([
    "",
    "-",
    ".5",
    "1.234",
    "1e2",
    "90071992547409.92",
  ])("拒绝不完整或不安全金额 %s", (input) => {
    expect(parseSignedMoneyMinor(input)).toBeNull();
  });
});

describe("按代收状态提交读数", () => {
  const draft = {
    billingMonth: "2026-08",
    dueDate: "2026-08-31",
    readings: {
      water: { readingDate: "", reading: "" },
      electricity: { readingDate: "", reading: "" },
    },
    extraFees: [],
  };
  it("不代收时空读数可预览，代收项空白仍可得到未完成预览", () => {
    expect(
      toMonthlyBillPreviewRequest("contract", draft, {
        waterCollectionEnabled: false,
        electricityCollectionEnabled: false,
      })?.readings,
    ).toEqual([]);
    expect(
      toMonthlyBillPreviewRequest("contract", draft, {
        waterCollectionEnabled: true,
        electricityCollectionEnabled: false,
      })?.readings,
    ).toEqual([]);
  });
  it("只提交启用项目，真实零读数保留", () => {
    const input = {
      ...draft,
      readings: {
        water: { readingDate: "2026-08-31", reading: "0" },
        electricity: { readingDate: "bad", reading: "hidden" },
      },
    };
    expect(
      toMonthlyBillPreviewRequest("contract", input, {
        waterCollectionEnabled: true,
        electricityCollectionEnabled: false,
      })?.readings,
    ).toEqual([{ kind: "water", readingDate: "2026-08-31", reading: "0" }]);
  });
});

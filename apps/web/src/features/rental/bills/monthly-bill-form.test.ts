import { describe, expect, it } from "vitest";
import { parseSignedMoneyMinor } from "./monthly-bill-form";

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

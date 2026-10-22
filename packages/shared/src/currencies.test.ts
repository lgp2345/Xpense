import { describe, expect, it } from "vitest";

import { formatMinorMoney } from "./currencies.js";

describe("formatMinorMoney", () => {
  it.each([
    [12345, "CNY", "¥123.45"],
    [-1, "USD", "-$0.01"],
    [0, "CNY", "¥0.00"],
    [0n, "USD", "$0.00"],
    [100, "USD", "$1.00"],
    [900719925474099312345n, "USD", "$9007199254740993123.45"],
    [-900719925474099312345n, "CNY", "-¥9007199254740993123.45"],
    [123, "EUR", "EUR 1.23"],
    [-1, "JPY", "-JPY 0.01"],
  ])("formats %s minor units in %s without losing cents", (amount, currency, expected) => {
    expect(formatMinorMoney(amount, currency)).toBe(expected);
  });
});

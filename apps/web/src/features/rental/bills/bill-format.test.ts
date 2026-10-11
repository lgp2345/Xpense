import { expect, it } from "vitest";
import { formatDailyRent } from "./bill-format";

it("每日单价以整数分四舍五入到两位小数", () => {
  expect(formatDailyRent(50000, 31)).toBe("16.13");
  expect(formatDailyRent(29000, 29)).toBe("10.00");
  expect(formatDailyRent(1, 31)).toBe("0.00");
  expect(formatDailyRent(1, 2)).toBe("0.01");
  expect(formatDailyRent(Number.MAX_SAFE_INTEGER, 31)).toBe("2,905,548,146,690.64");
});

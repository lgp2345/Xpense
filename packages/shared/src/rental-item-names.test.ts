import { describe, expect, it } from "vitest";
import { duplicateRentalItemNameIndexes, rentalDepositItemName } from "./rental-item-names.js";

describe("租赁事项名称", () => {
  it("识别重复名称并保留索引，不将空名称视为已占用", () => {
    expect(
      duplicateRentalItemNameIndexes(["", " 管理费 ", "网费", "管理费", " ", " 管理费"]),
    ).toEqual([3, 5]);
    expect(duplicateRentalItemNameIndexes(["停车费", "管理费"])).toEqual([]);
  });
  it.each([
    ["rental", "忽略", "租金"],
    ["utility", "", "水电"],
    ["access_card", "", "门禁卡"],
    ["other", " 钥匙 ", "钥匙"],
  ] as const)("%s 押金使用实际显示名称", (type, customName, expected) => {
    expect(rentalDepositItemName({ type, customName })).toBe(expected);
  });
});

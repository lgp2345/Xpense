import type { RentalDepositType } from "./rental-contracts.js";

/** 押金默认名称与自定义名称使用同一显示口径。 */
export function rentalDepositItemName(item: {
  type: RentalDepositType;
  customName?: string | null;
}): string {
  return item.type === "other"
    ? (item.customName ?? "").trim()
    : { rental: "租金", utility: "水电", access_card: "门禁卡" }[item.type];
}

/** 返回去除首尾空白后重复的非空事项位置；空名称由必填规则处理。 */
export function duplicateRentalItemNameIndexes(names: readonly string[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  names.forEach((value, index) => {
    const name = value.trim();
    if (!name) return;
    if (seen.has(name)) duplicates.push(index);
    seen.add(name);
  });
  return duplicates;
}

import type { RentalPropertyType, RentalSpaceType } from "@xpense/shared";

import type {
  RentalBatchSpaceItem,
  RentalPropertyUpdateValues,
  RentalSpaceUpdateValues,
} from "./rental.types.js";

type PropertyTypeState = {
  type: RentalPropertyType;
  customTypeName?: string | null;
};

type SpaceTypeState = {
  type: RentalSpaceType;
  customTypeName?: string | null;
};

/** 校验类型与自定义类型名称的绑定关系。 */
export function assertCustomTypeName(
  type: RentalPropertyType | RentalSpaceType,
  customTypeName: string | null | undefined,
): void {
  const hasCustomTypeName = customTypeName !== null && customTypeName !== undefined;
  if (type === "other") {
    if (!hasCustomTypeName || customTypeName.trim().length === 0) {
      throw new Error("类型为 other 时必须填写自定义类型名称");
    }
    return;
  }

  if (hasCustomTypeName) {
    if (customTypeName.trim().length === 0) {
      throw new Error("自定义类型名称不能为空");
    }
    throw new Error("非 other 类型不得填写自定义类型名称");
  }
}

/** 将房产的部分更新合并到当前快照，并校验合并后的类型关系。 */
export function mergePropertyUpdate<T extends PropertyTypeState>(
  current: T,
  update: Partial<RentalPropertyUpdateValues>,
): T {
  const merged = { ...current, ...update } as T;
  assertCustomTypeName(merged.type, merged.customTypeName);
  return merged;
}

/** 将空间的部分更新合并到当前快照，并校验合并后的类型关系。 */
export function mergeSpaceUpdate<T extends SpaceTypeState>(
  current: T,
  update: Partial<RentalSpaceUpdateValues>,
): T {
  const merged = { ...current, ...update } as T;
  assertCustomTypeName(merged.type, merged.customTypeName);
  return merged;
}

/** 查找批量创建请求中经过去空白后的同名或同编码项。 */
export function findBatchConflicts(
  items: readonly RentalBatchSpaceItem[],
): Array<{ field: "name" | "code"; indexes: number[]; value: string }> {
  const conflicts: Array<{ field: "name" | "code"; indexes: number[]; value: string }> = [];

  for (const field of ["name", "code"] as const) {
    const occurrences = new Map<string, number[]>();
    items.forEach((item, index) => {
      const rawValue = item[field];
      if (rawValue === undefined || rawValue === null) return;
      const value = rawValue.trim();
      if (value.length === 0) return;
      const indexes = occurrences.get(value);
      if (indexes) indexes.push(index);
      else occurrences.set(value, [index]);
    });

    for (const [value, indexes] of occurrences) {
      if (indexes.length > 1) conflicts.push({ field, indexes, value });
    }
  }

  return conflicts;
}

/** 计算空间结合房产及全部祖先后的实际可用状态。 */
export function calculateEffectiveActive(
  propertyActive: boolean,
  selfActive: boolean,
  ancestorActiveStates: readonly boolean[],
): boolean {
  return propertyActive && selfActive && ancestorActiveStates.every(Boolean);
}

import type { RentalPropertyType, RentalSpaceType } from "@xpense/shared";

/** 可合并的租赁房产资料快照。 */
export type RentalPropertyUpdateValues = {
  name: string;
  type: RentalPropertyType;
  customTypeName: string | null;
  countryCode: string;
  province: string | null;
  city: string | null;
  district: string | null;
  addressLine: string;
  note: string | null;
};

/** 可合并的租赁空间资料快照。 */
export type RentalSpaceUpdateValues = {
  name: string;
  code: string | null;
  type: RentalSpaceType;
  customTypeName: string | null;
  isRentable: boolean;
  isActive: boolean;
  sortOrder: number;
};

/** 批量创建租赁空间的最小冲突检查输入。 */
export type RentalBatchSpaceItem = {
  name: string;
  code?: string | null;
};

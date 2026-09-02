import type { RentalPropertyType } from "@xpense/shared";

import type { PropertyContractCounts } from "./contracts.repository.types.js";
import type { RentalPropertyUpdateValues } from "./rental.types.js";

/** 已归一化的房产列表筛选条件。 */
export type PropertyListInput = {
  keyword?: string;
  type?: RentalPropertyType;
  isActive?: boolean;
  province?: string;
  city?: string;
  district?: string;
  page: number;
  pageSize: number;
};

/** 房产持久化完整记录；日期保留为数据库时间对象。 */
export type RentalPropertyRecord = {
  id: string;
  organizationId: string;
  ledgerId: string;
  name: string;
  type: RentalPropertyType;
  customTypeName: string | null;
  countryCode: string;
  province: string | null;
  city: string | null;
  district: string | null;
  addressLine: string;
  note: string | null;
  isActive: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 对齐共享摘要字段、但仍保留持久化时间对象的房产列表行。 */
export type RentalPropertySummaryRecord = Pick<
  RentalPropertyRecord,
  | "id"
  | "ledgerId"
  | "name"
  | "type"
  | "customTypeName"
  | "countryCode"
  | "province"
  | "city"
  | "district"
  | "addressLine"
  | "isActive"
  | "updatedAt"
> & {
  spaceCount: number;
  rentableSpaceCount: number;
};

/** 对齐共享详情字段、但仍保留持久化时间对象的房产详情记录。 */
export type RentalPropertyDetailRecord = RentalPropertySummaryRecord & {
  note: string | null;
  createdAt: Date;
} & Partial<PropertyContractCounts>;

/** 持久化层分页结果；服务层负责将日期映射为共享契约的 ISO 字符串。 */
export type RentalPropertyPageRecord = {
  items: RentalPropertySummaryRecord[];
  total: number;
  page: number;
  pageSize: number;
};

/** 创建房产的可信持久化输入。 */
export type CreateRentalPropertyInput = Omit<
  RentalPropertyRecord,
  "id" | "deletedAt" | "deletedByUserId" | "createdAt" | "updatedAt" | "isActive"
> & {
  isActive?: boolean;
};

/** 更新房产全部可变资料的可信持久化输入。 */
export type UpdateRentalPropertyInput = RentalPropertyUpdateValues & {
  id: string;
  organizationId: string;
  isActive: boolean;
  updatedByUserId: string;
};

/** 设置房产状态的可信持久化输入。 */
export type SetRentalPropertyStatusInput = {
  organizationId: string;
  id: string;
  isActive: boolean;
  updatedByUserId: string;
};

/** 查询未软删除房产同名冲突的输入。 */
export type ActivePropertyNameConflictInput = {
  organizationId: string;
  name: string;
  excludeId?: string;
};

/** 软删除房产的可信持久化输入。 */
export type SoftDeleteRentalPropertyInput = {
  organizationId: string;
  id: string;
  deletedByUserId: string;
  updatedByUserId: string;
};

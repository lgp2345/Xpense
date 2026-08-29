import type { RentalSpaceType } from "@xpense/shared";

import type { RentalSpaceUpdateValues } from "./rental.types.js";

/** 空间直属子节点分页查询。 */
export type SpaceChildrenListInput = {
  parentId: string | null;
  page: number;
  pageSize: number;
};

/** 空间关键词分页查询。 */
export type SpaceSearchInput = {
  keyword: string;
  page: number;
  pageSize: number;
};

/** 空间完整持久化记录。 */
export type RentalSpaceRecord = {
  id: string;
  organizationId: string;
  propertyId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  type: RentalSpaceType;
  customTypeName: string | null;
  isRentable: boolean;
  isActive: boolean;
  sortOrder: number;
  note: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 空间树节点；有效状态已合并房产、本节点和全部祖先状态。 */
export type RentalSpaceNodeRecord = Pick<
  RentalSpaceRecord,
  | "id"
  | "propertyId"
  | "parentId"
  | "name"
  | "code"
  | "type"
  | "customTypeName"
  | "isRentable"
  | "isActive"
  | "note"
  | "sortOrder"
> & {
  isEffectivelyActive: boolean;
  hasChildren: boolean;
};

/** 空间直属子节点持久化分页结果。 */
export type RentalSpaceChildrenPageRecord = {
  items: RentalSpaceNodeRecord[];
  total: number;
  page: number;
  pageSize: number;
};

/** 搜索结果定位路径节点。 */
export type RentalSpacePathNodeRecord = Pick<RentalSpaceRecord, "id" | "name">;

/** 空间搜索结果；path 始终按根到命中节点排列。 */
export type RentalSpaceSearchRecord = RentalSpaceNodeRecord & {
  path: RentalSpacePathNodeRecord[];
};

/** 空间搜索持久化分页结果。 */
export type RentalSpaceSearchPageRecord = {
  items: RentalSpaceSearchRecord[];
  total: number;
  page: number;
  pageSize: number;
};

/** 创建空间的可信持久化输入。 */
export type CreateRentalSpaceInput = Omit<
  RentalSpaceRecord,
  "id" | "isActive" | "deletedAt" | "deletedByUserId" | "createdAt" | "updatedAt" | "sortOrder"
> & {
  isActive?: boolean;
  sortOrder?: number;
};

/** 更新空间全部可变资料的可信持久化输入。 */
export type UpdateRentalSpaceInput = RentalSpaceUpdateValues & {
  id: string;
  organizationId: string;
  propertyId: string;
  updatedByUserId: string;
};

/** 移动空间的可信持久化输入。 */
export type MoveRentalSpaceInput = {
  id: string;
  organizationId: string;
  propertyId: string;
  parentId: string | null;
  sortOrder: number;
  updatedByUserId: string;
};

/** 设置空间状态的可信持久化输入。 */
export type SetRentalSpaceStatusInput = {
  id: string;
  organizationId: string;
  propertyId: string;
  isActive: boolean;
  updatedByUserId: string;
};

/** 查询同父节点下未软删除空间的批量名称、编码冲突。 */
export type FindSpaceSiblingConflictsInput = {
  organizationId: string;
  propertyId: string;
  parentId: string | null;
  names: readonly string[];
  codes: readonly string[];
  excludeId?: string;
};

/** 同父节点冲突的最小记录。 */
export type RentalSpaceSiblingConflictRecord = Pick<RentalSpaceRecord, "id" | "name" | "code">;

/** 软删除空间的可信持久化输入。 */
export type SoftDeleteRentalSpaceInput = {
  id: string;
  organizationId: string;
  propertyId: string;
  deletedByUserId: string;
  updatedByUserId: string;
};

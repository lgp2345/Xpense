import type { PageResult } from "./bookkeeping.js";

/** 租赁房产可用类型。 */
export const rentalPropertyTypes = [
  "residential_unit",
  "detached_house",
  "apartment_building",
  "commercial_building",
  "complex",
  "shop",
  "office",
  "warehouse",
  "other",
] as const;

/** 租赁房产类型。 */
export type RentalPropertyType = (typeof rentalPropertyTypes)[number];

/** 租赁空间可用类型。 */
export const rentalSpaceTypes = [
  "building",
  "floor",
  "unit",
  "room",
  "shop",
  "office",
  "parking_space",
  "warehouse",
  "other",
] as const;

/** 租赁空间类型。 */
export type RentalSpaceType = (typeof rentalSpaceTypes)[number];

/** 租赁房产摘要。 */
export type RentalPropertySummary = {
  id: string;
  ledgerId: string;
  name: string;
  type: RentalPropertyType;
  customTypeName: string | null;
  countryCode: string;
  province: string | null;
  city: string | null;
  district: string | null;
  addressLine: string;
  isActive: boolean;
  spaceCount: number;
  rentableSpaceCount: number;
  updatedAt: string;
};

/** 租赁房产详情。 */
export type RentalPropertyDetail = RentalPropertySummary & {
  note: string | null;
  createdAt: string;
};

/** 租赁房产分页结果。 */
export type RentalPropertyPage = PageResult<RentalPropertySummary>;

/** 租赁空间树节点。 */
export type RentalSpaceNode = {
  id: string;
  propertyId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  type: RentalSpaceType;
  customTypeName: string | null;
  isRentable: boolean;
  isActive: boolean;
  isEffectivelyActive: boolean;
  sortOrder: number;
  hasChildren: boolean;
};

/** 租赁空间子节点分页结果。 */
export type RentalSpaceChildrenPage = PageResult<RentalSpaceNode>;

/** 租赁空间搜索结果。 */
export type RentalSpaceSearchResult = RentalSpaceNode & {
  path: { id: string; name: string }[];
};

/** 租赁空间搜索分页结果。 */
export type RentalSpaceSearchPage = PageResult<RentalSpaceSearchResult>;

/** 创建租赁房产请求。 */
export type CreateRentalPropertyRequest = {
  name: string;
  type: RentalPropertyType;
  customTypeName?: string;
  countryCode: string;
  province?: string;
  city?: string;
  district?: string;
  addressLine: string;
  note?: string;
};

type AtLeastOne<T, Key extends keyof T = keyof T> = Key extends keyof T
  ? Required<Pick<T, Key>> & Partial<Omit<T, Key>>
  : never;

type RentalPropertyMutableFields = {
  name: string;
  type: RentalPropertyType;
  customTypeName?: string | null;
  countryCode: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  addressLine: string;
  note?: string | null;
};

/** 更新租赁房产资料请求；状态由独立接口维护。 */
export type UpdateRentalPropertyRequest = { id: string } & AtLeastOne<RentalPropertyMutableFields>;

/** 设置租赁房产状态请求。 */
export type SetRentalPropertyStatusRequest = {
  id: string;
  isActive: boolean;
};

/** 删除租赁房产请求。 */
export type DeleteRentalPropertyRequest = {
  id: string;
};

/** 创建租赁空间请求。 */
export type CreateRentalSpaceRequest = {
  propertyId: string;
  parentId?: string;
  name: string;
  code?: string;
  type: RentalSpaceType;
  customTypeName?: string;
  isRentable: boolean;
  sortOrder?: number;
};

/** 批量创建租赁空间的单项输入。 */
export type BatchCreateRentalSpaceItem = {
  name: string;
  code?: string;
  sortOrder?: number;
};

/** 批量创建租赁空间请求。 */
export type BatchCreateRentalSpacesRequest = {
  propertyId: string;
  parentId?: string;
  type: RentalSpaceType;
  customTypeName?: string;
  isRentable: boolean;
  items: BatchCreateRentalSpaceItem[];
};

/** 更新租赁空间请求。 */
export type UpdateRentalSpaceRequest = {
  name: string;
  code?: string | null;
  type: RentalSpaceType;
  customTypeName?: string | null;
  isRentable: boolean;
  isActive: boolean;
  sortOrder: number;
};

/** 移动租赁空间请求。 */
export type MoveRentalSpaceRequest = {
  parentId?: string | null;
  sortOrder: number;
};

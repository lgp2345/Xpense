import { rentalSpaces } from "../../db/schema.js";

/** 空间完整持久化记录字段。 */
export const spaceRecordFields = {
  id: rentalSpaces.id,
  organizationId: rentalSpaces.organizationId,
  propertyId: rentalSpaces.propertyId,
  parentId: rentalSpaces.parentId,
  name: rentalSpaces.name,
  code: rentalSpaces.code,
  type: rentalSpaces.type,
  customTypeName: rentalSpaces.customTypeName,
  isRentable: rentalSpaces.isRentable,
  isActive: rentalSpaces.isActive,
  sortOrder: rentalSpaces.sortOrder,
  note: rentalSpaces.note,
  createdByUserId: rentalSpaces.createdByUserId,
  updatedByUserId: rentalSpaces.updatedByUserId,
  deletedAt: rentalSpaces.deletedAt,
  deletedByUserId: rentalSpaces.deletedByUserId,
  createdAt: rentalSpaces.createdAt,
  updatedAt: rentalSpaces.updatedAt,
};

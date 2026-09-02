import { sql } from "drizzle-orm";

import { rentalTenants } from "../../db/schema.js";

/** 统计当前租户被未删除合同引用的数量，供列表和详情共享。 */
const tenantContractCount = sql<number>`(
  SELECT COUNT(DISTINCT "rental_contract_party_periods"."contract_id")
  FROM "rental_contract_party_periods"
  INNER JOIN "rental_contracts"
    ON "rental_contract_party_periods"."organization_id" = "rental_contracts"."organization_id"
    AND "rental_contract_party_periods"."contract_id" = "rental_contracts"."id"
  WHERE "rental_contract_party_periods"."organization_id" = "rental_tenants"."organization_id"
    AND "rental_contract_party_periods"."tenant_id" = "rental_tenants"."id"
    AND "rental_contracts"."deleted_at" IS NULL
)`.mapWith(Number);

/** 租户完整持久化记录字段；仅详情和受控敏感映射路径读取密文。 */
export const tenantRecordFields = {
  id: rentalTenants.id,
  organizationId: rentalTenants.organizationId,
  type: rentalTenants.type,
  name: rentalTenants.name,
  phone: rentalTenants.phone,
  email: rentalTenants.email,
  primaryContactName: rentalTenants.primaryContactName,
  documentCountryCode: rentalTenants.documentCountryCode,
  documentType: rentalTenants.documentType,
  documentTypeOtherName: rentalTenants.documentTypeOtherName,
  documentNumberLookupHash: rentalTenants.documentNumberLookupHash,
  maskedDocumentNumber: rentalTenants.maskedDocumentNumber,
  sensitiveIdentityCiphertext: rentalTenants.sensitiveIdentityCiphertext,
  sensitiveIdentityKeyVersion: rentalTenants.sensitiveIdentityKeyVersion,
  isActive: rentalTenants.isActive,
  note: rentalTenants.note,
  createdByUserId: rentalTenants.createdByUserId,
  updatedByUserId: rentalTenants.updatedByUserId,
  deletedAt: rentalTenants.deletedAt,
  deletedByUserId: rentalTenants.deletedByUserId,
  createdAt: rentalTenants.createdAt,
  updatedAt: rentalTenants.updatedAt,
};

/** 租户详情字段；在同一组织作用域查询中返回真实合同数量。 */
export const tenantDetailFields = {
  ...tenantRecordFields,
  contractCount: tenantContractCount,
};

/** 租户列表摘要字段；合同数量由相关标量子查询计算，避免逐行回查。 */
export const tenantSummaryFields = {
  id: rentalTenants.id,
  type: rentalTenants.type,
  name: rentalTenants.name,
  phone: rentalTenants.phone,
  email: rentalTenants.email,
  primaryContactName: rentalTenants.primaryContactName,
  documentCountryCode: rentalTenants.documentCountryCode,
  documentType: rentalTenants.documentType,
  documentTypeOtherName: rentalTenants.documentTypeOtherName,
  maskedDocumentNumber: rentalTenants.maskedDocumentNumber,
  isActive: rentalTenants.isActive,
  contractCount: tenantContractCount,
  updatedAt: rentalTenants.updatedAt,
};

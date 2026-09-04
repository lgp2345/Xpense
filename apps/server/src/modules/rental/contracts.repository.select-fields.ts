import type { RentalContractDisplayStatus } from "@xpense/shared";
import { type SQL, sql } from "drizzle-orm";

import {
  rentalContractDepositTerms,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContracts,
  rentalProperties,
  rentalSpaces,
  rentalTenants,
} from "../../db/schema.js";
import type {
  RentalContractDepositRecord,
  RentalContractPartyPeriodRecord,
  RentalContractSpaceRecord,
} from "./contracts.repository.types.js";

/** 按组织本地日期生成与领域规则一致的合同展示状态表达式。 */
export function contractDisplayStatusExpression(today: string): SQL<RentalContractDisplayStatus> {
  return sql<RentalContractDisplayStatus>`CASE
    WHEN ${rentalContracts.status} = 'draft' THEN 'draft'
    WHEN ${rentalContracts.status} = 'cancelled' THEN 'cancelled'
    WHEN ${rentalContracts.status} = 'terminated'
      AND ${today}::date > COALESCE(${rentalContracts.terminationDate}, ${rentalContracts.endDate}) THEN 'terminated'
    WHEN ${today}::date < ${rentalContracts.startDate} THEN 'upcoming'
    WHEN ${today}::date > COALESCE(${rentalContracts.terminationDate}, ${rentalContracts.endDate}) THEN 'expired'
    WHEN ${today}::date >= (COALESCE(${rentalContracts.terminationDate}, ${rentalContracts.endDate}) - INTERVAL '30 days') THEN 'expiring_soon'
    ELSE 'active'
  END`;
}

/** 合同头完整持久化字段。 */
export const contractRecordFields = {
  id: rentalContracts.id,
  organizationId: rentalContracts.organizationId,
  propertyId: rentalContracts.propertyId,
  contractNumber: rentalContracts.contractNumber,
  externalContractNumber: rentalContracts.externalContractNumber,
  status: rentalContracts.status,
  startDate: rentalContracts.startDate,
  endDate: rentalContracts.endDate,
  rentAmountMinor: rentalContracts.rentAmountMinor,
  billingAnchor: rentalContracts.billingAnchor,
  paymentIntervalMonths: rentalContracts.paymentIntervalMonths,
  dueDaysBefore: rentalContracts.dueDaysBefore,
  renewedFromContractId: rentalContracts.renewedFromContractId,
  cancelledAt: rentalContracts.cancelledAt,
  cancelledByUserId: rentalContracts.cancelledByUserId,
  cancellationReason: rentalContracts.cancellationReason,
  terminationDate: rentalContracts.terminationDate,
  terminationRecordedAt: rentalContracts.terminationRecordedAt,
  terminatedByUserId: rentalContracts.terminatedByUserId,
  terminationReason: rentalContracts.terminationReason,
  note: rentalContracts.note,
  createdByUserId: rentalContracts.createdByUserId,
  updatedByUserId: rentalContracts.updatedByUserId,
  deletedAt: rentalContracts.deletedAt,
  deletedByUserId: rentalContracts.deletedByUserId,
  createdAt: rentalContracts.createdAt,
  updatedAt: rentalContracts.updatedAt,
};

/** 受控身份历史读取所需的最小加密快照字段。 */
export const contractPartySensitiveSnapshotFields = {
  contractId: rentalContractPartyPeriods.contractId,
  tenantId: rentalContractPartyPeriods.tenantId,
  validFrom: rentalContractPartyPeriods.validFrom,
  validTo: rentalContractPartyPeriods.validTo,
  identitySnapshotCiphertext: rentalContractPartyPeriods.identitySnapshotCiphertext,
  identitySnapshotKeyVersion: rentalContractPartyPeriods.identitySnapshotKeyVersion,
};

const propertyName = sql<string>`(
  SELECT ${rentalProperties.name}
  FROM ${rentalProperties}
  WHERE ${rentalProperties.organizationId} = ${rentalContracts.organizationId}
    AND ${rentalProperties.id} = ${rentalContracts.propertyId}
  LIMIT 1
)`;

const tenantNames = sql<string[]>`COALESCE(ARRAY(
  SELECT DISTINCT COALESCE("period"."tenant_name_snapshot", "tenant"."name")
  FROM ${rentalContractPartyPeriods} AS "period"
  LEFT JOIN ${rentalTenants} AS "tenant"
    ON "tenant"."organization_id" = "period"."organization_id"
    AND "tenant"."id" = "period"."tenant_id"
  WHERE "period"."organization_id" = ${rentalContracts.organizationId}
    AND "period"."contract_id" = ${rentalContracts.id}
  ORDER BY COALESCE("period"."tenant_name_snapshot", "tenant"."name")
), ARRAY[]::text[])`;

const spaceNames = sql<string[]>`COALESCE(ARRAY(
  SELECT DISTINCT COALESCE("contract_space"."space_name_snapshot", "space"."name")
  FROM ${rentalContractSpaces} AS "contract_space"
  LEFT JOIN ${rentalSpaces} AS "space"
    ON "space"."organization_id" = "contract_space"."organization_id"
    AND "space"."property_id" = "contract_space"."property_id"
    AND "space"."id" = "contract_space"."space_id"
  WHERE "contract_space"."organization_id" = ${rentalContracts.organizationId}
    AND "contract_space"."contract_id" = ${rentalContracts.id}
  ORDER BY COALESCE("contract_space"."space_name_snapshot", "space"."name")
), ARRAY[]::text[])`;

/** 合同列表摘要字段。 */
export function contractSummaryFields(today: string) {
  return {
    id: rentalContracts.id,
    propertyId: rentalContracts.propertyId,
    propertyName,
    contractNumber: rentalContracts.contractNumber,
    externalContractNumber: rentalContracts.externalContractNumber,
    lifecycleStatus: rentalContracts.status,
    displayStatus: contractDisplayStatusExpression(today),
    startDate: rentalContracts.startDate,
    endDate: rentalContracts.endDate,
    actualEndDate: sql<
      string | null
    >`COALESCE(${rentalContracts.terminationDate}, ${rentalContracts.endDate})`,
    rentAmountMinor: rentalContracts.rentAmountMinor,
    tenantNames,
    spaceNames,
    updatedAt: rentalContracts.updatedAt,
  };
}

const spaces = sql<RentalContractSpaceRecord[]>`COALESCE((
  SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
    'spaceId', "contract_space"."space_id",
    'spaceName', COALESCE("contract_space"."space_name_snapshot", "space"."name"),
    'spaceCode', COALESCE("contract_space"."space_code_snapshot", "space"."code"),
    'spacePath', COALESCE("contract_space"."space_path_snapshot", JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT('id', "space"."id", 'name', "space"."name")
    )),
    'rentAllocationMinor', "contract_space"."rent_allocation_minor"
  ) ORDER BY COALESCE("contract_space"."space_name_snapshot", "space"."name"), "contract_space"."id")
  FROM ${rentalContractSpaces} AS "contract_space"
  LEFT JOIN ${rentalSpaces} AS "space"
    ON "space"."organization_id" = "contract_space"."organization_id"
    AND "space"."property_id" = "contract_space"."property_id"
    AND "space"."id" = "contract_space"."space_id"
  WHERE "contract_space"."organization_id" = ${rentalContracts.organizationId}
    AND "contract_space"."contract_id" = ${rentalContracts.id}
), '[]'::jsonb)`;

const parties = sql<RentalContractPartyPeriodRecord[]>`COALESCE((
  SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
    'tenantId', "period"."tenant_id",
    'tenantType', COALESCE("period"."tenant_type_snapshot", "tenant"."type"),
    'tenantName', COALESCE("period"."tenant_name_snapshot", "tenant"."name"),
    'phone', COALESCE("period"."phone_snapshot", "tenant"."phone"),
    'email', COALESCE("period"."email_snapshot", "tenant"."email"),
    'primaryContactName', COALESCE("period"."primary_contact_name_snapshot", "tenant"."primary_contact_name"),
    'primaryContactPhone', COALESCE("period"."primary_contact_phone_snapshot", "tenant"."primary_contact_phone"),
    'documentCountryCode', COALESCE("period"."document_country_code_snapshot", "tenant"."document_country_code"),
    'documentType', COALESCE("period"."document_type_snapshot", "tenant"."document_type"),
    'documentTypeOtherName', COALESCE("period"."document_type_other_name_snapshot", "tenant"."document_type_other_name"),
    'maskedDocumentNumber', CASE WHEN "period"."valid_from" IS NOT NULL THEN "period"."masked_document_number_snapshot" ELSE "tenant"."masked_document_number" END,
    'validFrom', "period"."valid_from",
    'validTo', "period"."valid_to",
    'isPrimaryPayer', "period"."is_primary_payer"
  ) ORDER BY "period"."valid_from" NULLS FIRST, "period"."is_primary_payer" DESC, "period"."id")
  FROM ${rentalContractPartyPeriods} AS "period"
  LEFT JOIN ${rentalTenants} AS "tenant"
    ON "tenant"."organization_id" = "period"."organization_id"
    AND "tenant"."id" = "period"."tenant_id"
  WHERE "period"."organization_id" = ${rentalContracts.organizationId}
    AND "period"."contract_id" = ${rentalContracts.id}
), '[]'::jsonb)`;

const depositTerms = sql<RentalContractDepositRecord[]>`COALESCE((
  SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', "deposit"."id",
    'type', "deposit"."type",
    'customName', "deposit"."custom_name",
    'calculationMode', "deposit"."calculation_mode",
    'fixedAmountMinor', "deposit"."fixed_amount_minor",
    'rentMultiple', "deposit"."rent_multiple",
    'finalAmountMinor', "deposit"."final_amount_minor",
    'sortOrder', "deposit"."sort_order"
  ) ORDER BY "deposit"."sort_order", "deposit"."id")
  FROM ${rentalContractDepositTerms} AS "deposit"
  WHERE "deposit"."organization_id" = ${rentalContracts.organizationId}
    AND "deposit"."contract_id" = ${rentalContracts.id}
), '[]'::jsonb)`;

/** 合同聚合详情字段；草稿回退到当前主档，确认后优先读取固化快照。 */
export function contractDetailFields(today: string) {
  return {
    ...contractSummaryFields(today),
    billingAnchor: rentalContracts.billingAnchor,
    paymentIntervalMonths: rentalContracts.paymentIntervalMonths,
    dueDaysBefore: rentalContracts.dueDaysBefore,
    hasScheduledTermination: sql<boolean>`(
      ${rentalContracts.status} = 'terminated'
      AND ${today}::date <= ${rentalContracts.terminationDate}
    )`,
    renewedFromContractId: rentalContracts.renewedFromContractId,
    cancellationReason: rentalContracts.cancellationReason,
    terminationDate: rentalContracts.terminationDate,
    terminationReason: rentalContracts.terminationReason,
    note: rentalContracts.note,
    spaces,
    parties,
    depositTerms,
    createdAt: rentalContracts.createdAt,
  };
}

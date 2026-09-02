import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./identity.js";
import { rentalProperties, rentalSpaces } from "./rental.js";

/** 租赁租户类型。 */
export const rentalTenantType = pgEnum("rental_tenant_type", ["individual", "company"]);

/** 租赁租户主要证件类型。 */
export const rentalIdentityDocumentType = pgEnum("rental_identity_document_type", [
  "national_id",
  "passport",
  "residence_permit",
  "business_registration",
  "other",
]);

/** 租赁租户敏感身份信息中的性别。 */
export const rentalGender = pgEnum("rental_gender", ["male", "female", "unspecified"]);

/** 租赁合同持久化生命周期状态。 */
export const rentalContractStatus = pgEnum("rental_contract_status", [
  "draft",
  "confirmed",
  "cancelled",
  "terminated",
]);

/** 租赁合同计费锚点。 */
export const rentalBillingAnchor = pgEnum("rental_billing_anchor", [
  "contract_start",
  "calendar_month",
]);

/** 租赁合同押金项目类型。 */
export const rentalDepositType = pgEnum("rental_deposit_type", [
  "rental",
  "utility",
  "access_card",
  "other",
]);

/** 租赁合同押金计算方式。 */
export const rentalDepositCalculationMode = pgEnum("rental_deposit_calculation_mode", [
  "fixed_amount",
  "rent_multiple",
]);

/** 租赁合同变更类型。 */
export const rentalContractChangeType = pgEnum("rental_contract_change_type", ["parties_changed"]);

/** 租赁合同领域动作类型。 */
export const rentalContractActionType = pgEnum("rental_contract_action_type", [
  "termination_revoked",
]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/** 组织级租户主档；敏感身份信息仅保存加密载荷与组织作用域检索摘要。 */
export const rentalTenants = snakeCase.table(
  "rental_tenants",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    type: rentalTenantType().notNull(),
    name: text().notNull(),
    phone: text(),
    email: text(),
    primaryContactName: text(),
    documentCountryCode: text(),
    documentType: rentalIdentityDocumentType(),
    documentTypeOtherName: text(),
    documentNumberLookupHash: text(),
    /** 由规范化证件号码派生的展示掩码，不保存明文证件号码。 */
    maskedDocumentNumber: text(),
    sensitiveIdentityCiphertext: bytea(),
    sensitiveIdentityKeyVersion: integer(),
    isActive: boolean().notNull().default(true),
    note: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("rental_tenants_organization_id_unique").on(table.organizationId, table.id),
    check(
      "rental_tenants_document_fields_check",
      sql`(${table.documentCountryCode} IS NULL AND ${table.documentType} IS NULL AND ${table.documentNumberLookupHash} IS NULL AND ${table.maskedDocumentNumber} IS NULL) OR (${table.documentCountryCode} IS NOT NULL AND ${table.documentType} IS NOT NULL AND ${table.documentNumberLookupHash} IS NOT NULL AND ${table.maskedDocumentNumber} IS NOT NULL)`,
    ),
    check(
      "rental_tenants_document_country_code_check",
      sql`${table.documentCountryCode} IS NULL OR char_length(${table.documentCountryCode}) = 2`,
    ),
    check(
      "rental_tenants_document_type_other_name_check",
      sql`(${table.documentType} = 'other' AND ${table.documentTypeOtherName} IS NOT NULL) OR (${table.documentType} IS DISTINCT FROM 'other' AND ${table.documentTypeOtherName} IS NULL)`,
    ),
    check(
      "rental_tenants_sensitive_identity_key_check",
      sql`(${table.sensitiveIdentityCiphertext} IS NULL AND ${table.sensitiveIdentityKeyVersion} IS NULL) OR (${table.sensitiveIdentityCiphertext} IS NOT NULL AND ${table.sensitiveIdentityKeyVersion} > 0)`,
    ),
    check(
      "rental_tenants_document_identity_ciphertext_check",
      sql`${table.documentNumberLookupHash} IS NULL OR (${table.sensitiveIdentityCiphertext} IS NOT NULL AND ${table.sensitiveIdentityKeyVersion} IS NOT NULL)`,
    ),
    check(
      "rental_tenants_deleted_by_user_check",
      sql`(${table.deletedAt} IS NULL AND ${table.deletedByUserId} IS NULL) OR (${table.deletedAt} IS NOT NULL AND ${table.deletedByUserId} IS NOT NULL)`,
    ),
    uniqueIndex("rental_tenants_active_document_hash_unique")
      .on(table.organizationId, table.documentNumberLookupHash)
      .where(sql`${table.deletedAt} IS NULL AND ${table.documentNumberLookupHash} IS NOT NULL`),
    index("rental_tenants_organization_deleted_name_idx").on(
      table.organizationId,
      table.deletedAt,
      table.name,
    ),
  ],
);

/** 按组织年份递增的合同内部编号计数器。 */
export const rentalContractNumberCounters = snakeCase.table(
  "rental_contract_number_counters",
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    year: integer().notNull(),
    lastValue: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "rental_contract_number_counters_pkey",
      columns: [table.organizationId, table.year],
    }),
    check("rental_contract_number_counters_year_check", sql`${table.year} BETWEEN 1 AND 9999`),
    check("rental_contract_number_counters_last_value_check", sql`${table.lastValue} >= 0`),
  ],
);

/** 租赁合同头；草稿只要求房产和内部编号，确认后补齐租期及计费数据。 */
export const rentalContracts = snakeCase.table(
  "rental_contracts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid().notNull(),
    contractNumber: text().notNull(),
    externalContractNumber: text(),
    status: rentalContractStatus().notNull().default("draft"),
    startDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    rentAmountMinor: bigint({ mode: "number" }),
    billingAnchor: rentalBillingAnchor(),
    paymentIntervalMonths: integer(),
    dueDaysBefore: integer(),
    renewedFromContractId: uuid(),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledByUserId: uuid().references(() => users.id),
    cancellationReason: text(),
    terminationDate: date({ mode: "string" }),
    terminationRecordedAt: timestamp({ withTimezone: true }),
    terminatedByUserId: uuid().references(() => users.id),
    terminationReason: text(),
    note: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("rental_contracts_organization_id_unique").on(table.organizationId, table.id),
    unique("rental_contracts_organization_property_id_unique").on(
      table.organizationId,
      table.propertyId,
      table.id,
    ),
    unique("rental_contracts_organization_contract_number_unique").on(
      table.organizationId,
      table.contractNumber,
    ),
    foreignKey({
      name: "rental_contracts_property_scope_fk",
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [rentalProperties.organizationId, rentalProperties.id],
    }),
    foreignKey({
      name: "rental_contracts_renewed_from_scope_fk",
      columns: [table.organizationId, table.propertyId, table.renewedFromContractId],
      foreignColumns: [table.organizationId, table.propertyId, table.id],
    }),
    check(
      "rental_contracts_date_order_check",
      sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.startDate} <= ${table.endDate}`,
    ),
    check(
      "rental_contracts_rent_amount_minor_check",
      sql`${table.rentAmountMinor} IS NULL OR (${table.rentAmountMinor} > 0 AND ${table.rentAmountMinor} <= 9007199254740991)`,
    ),
    check(
      "rental_contracts_payment_interval_months_check",
      sql`${table.paymentIntervalMonths} IS NULL OR ${table.paymentIntervalMonths} IN (1, 3, 6, 12)`,
    ),
    check(
      "rental_contracts_due_days_before_check",
      sql`${table.dueDaysBefore} IS NULL OR ${table.dueDaysBefore} BETWEEN 0 AND 90`,
    ),
    check(
      "rental_contracts_confirmed_core_fields_check",
      sql`${table.status} = 'draft' OR (${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL AND ${table.rentAmountMinor} IS NOT NULL AND ${table.billingAnchor} IS NOT NULL AND ${table.paymentIntervalMonths} IS NOT NULL AND ${table.dueDaysBefore} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_cancellation_fields_check",
      sql`(${table.cancelledAt} IS NULL AND ${table.cancelledByUserId} IS NULL AND ${table.cancellationReason} IS NULL) OR (${table.cancelledAt} IS NOT NULL AND ${table.cancelledByUserId} IS NOT NULL AND ${table.cancellationReason} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_cancellation_status_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_termination_fields_check",
      sql`(${table.terminationDate} IS NULL AND ${table.terminationRecordedAt} IS NULL AND ${table.terminatedByUserId} IS NULL AND ${table.terminationReason} IS NULL) OR (${table.terminationDate} IS NOT NULL AND ${table.terminationRecordedAt} IS NOT NULL AND ${table.terminatedByUserId} IS NOT NULL AND ${table.terminationReason} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_termination_status_check",
      sql`(${table.status} = 'terminated') = (${table.terminationDate} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_termination_date_check",
      sql`${table.terminationDate} IS NULL OR (${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL AND ${table.terminationDate} BETWEEN ${table.startDate} AND ${table.endDate} AND ${table.terminationDate} < ${table.endDate})`,
    ),
    check(
      "rental_contracts_deleted_by_user_check",
      sql`(${table.deletedAt} IS NULL AND ${table.deletedByUserId} IS NULL) OR (${table.deletedAt} IS NOT NULL AND ${table.deletedByUserId} IS NOT NULL)`,
    ),
    check(
      "rental_contracts_only_drafts_soft_delete_check",
      sql`${table.deletedAt} IS NULL OR ${table.status} = 'draft'`,
    ),
    index("rental_contracts_organization_property_deleted_idx").on(
      table.organizationId,
      table.propertyId,
      table.deletedAt,
    ),
    index("rental_contracts_organization_status_dates_idx").on(
      table.organizationId,
      table.status,
      table.startDate,
      table.endDate,
    ),
  ],
);

/** 合同关联空间与确认时固化的空间快照。 */
export const rentalContractSpaces = snakeCase.table(
  "rental_contract_spaces",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractId: uuid().notNull(),
    propertyId: uuid().notNull(),
    spaceId: uuid().notNull(),
    spaceNameSnapshot: text(),
    spaceCodeSnapshot: text(),
    spacePathSnapshot: jsonb(),
    rentAllocationMinor: bigint({ mode: "number" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_contract_spaces_organization_contract_id_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    unique("rental_contract_spaces_contract_space_unique").on(
      table.organizationId,
      table.contractId,
      table.spaceId,
    ),
    foreignKey({
      name: "rental_contract_spaces_contract_scope_fk",
      columns: [table.organizationId, table.contractId, table.propertyId],
      foreignColumns: [
        rentalContracts.organizationId,
        rentalContracts.id,
        rentalContracts.propertyId,
      ],
    }),
    foreignKey({
      name: "rental_contract_spaces_space_scope_fk",
      columns: [table.organizationId, table.propertyId, table.spaceId],
      foreignColumns: [rentalSpaces.organizationId, rentalSpaces.propertyId, rentalSpaces.id],
    }),
    check(
      "rental_contract_spaces_snapshot_fields_check",
      sql`(${table.spaceNameSnapshot} IS NULL AND ${table.spaceCodeSnapshot} IS NULL AND ${table.spacePathSnapshot} IS NULL) OR (${table.spaceNameSnapshot} IS NOT NULL AND ${table.spacePathSnapshot} IS NOT NULL)`,
    ),
    check(
      "rental_contract_spaces_rent_allocation_minor_check",
      sql`${table.rentAllocationMinor} IS NULL OR (${table.rentAllocationMinor} > 0 AND ${table.rentAllocationMinor} <= 9007199254740991)`,
    ),
    index("rental_contract_spaces_organization_space_idx").on(table.organizationId, table.spaceId),
  ],
);

/** 合同承租方在有效日期区间内的不可变快照。 */
export const rentalContractPartyPeriods = snakeCase.table(
  "rental_contract_party_periods",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractId: uuid().notNull(),
    tenantId: uuid().notNull(),
    validFrom: date({ mode: "string" }),
    validTo: date({ mode: "string" }),
    isPrimaryPayer: boolean().notNull().default(false),
    tenantTypeSnapshot: rentalTenantType(),
    tenantNameSnapshot: text(),
    phoneSnapshot: text(),
    emailSnapshot: text(),
    primaryContactNameSnapshot: text(),
    documentCountryCodeSnapshot: text(),
    documentTypeSnapshot: rentalIdentityDocumentType(),
    documentTypeOtherNameSnapshot: text(),
    /** 确认时固化的证件号码展示掩码，避免依赖可变租户主档。 */
    maskedDocumentNumberSnapshot: text(),
    identitySnapshotCiphertext: bytea(),
    identitySnapshotKeyVersion: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_contract_party_periods_organization_contract_id_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    foreignKey({
      name: "rental_contract_party_periods_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    foreignKey({
      name: "rental_contract_party_periods_tenant_scope_fk",
      columns: [table.organizationId, table.tenantId],
      foreignColumns: [rentalTenants.organizationId, rentalTenants.id],
    }),
    check(
      "rental_contract_party_periods_date_fields_check",
      sql`(${table.validFrom} IS NULL AND ${table.validTo} IS NULL) OR (${table.validFrom} IS NOT NULL AND ${table.validTo} IS NOT NULL AND ${table.validFrom} <= ${table.validTo})`,
    ),
    check(
      "rental_contract_party_periods_snapshot_fields_check",
      sql`(${table.validFrom} IS NULL AND ${table.validTo} IS NULL AND ${table.tenantTypeSnapshot} IS NULL AND ${table.tenantNameSnapshot} IS NULL AND ${table.phoneSnapshot} IS NULL AND ${table.emailSnapshot} IS NULL AND ${table.primaryContactNameSnapshot} IS NULL AND ${table.documentCountryCodeSnapshot} IS NULL AND ${table.documentTypeSnapshot} IS NULL AND ${table.documentTypeOtherNameSnapshot} IS NULL AND ${table.maskedDocumentNumberSnapshot} IS NULL AND ${table.identitySnapshotCiphertext} IS NULL AND ${table.identitySnapshotKeyVersion} IS NULL) OR (${table.validFrom} IS NOT NULL AND ${table.validTo} IS NOT NULL AND ${table.tenantTypeSnapshot} IS NOT NULL AND ${table.tenantNameSnapshot} IS NOT NULL)`,
    ),
    check(
      "rental_contract_party_periods_document_fields_check",
      sql`(${table.documentCountryCodeSnapshot} IS NULL AND ${table.documentTypeSnapshot} IS NULL AND ${table.maskedDocumentNumberSnapshot} IS NULL) OR (${table.documentCountryCodeSnapshot} IS NOT NULL AND ${table.documentTypeSnapshot} IS NOT NULL AND ${table.maskedDocumentNumberSnapshot} IS NOT NULL)`,
    ),
    check(
      "rental_contract_party_periods_document_country_code_check",
      sql`${table.documentCountryCodeSnapshot} IS NULL OR char_length(${table.documentCountryCodeSnapshot}) = 2`,
    ),
    check(
      "rental_contract_party_periods_document_type_other_name_check",
      sql`(${table.documentTypeSnapshot} = 'other' AND ${table.documentTypeOtherNameSnapshot} IS NOT NULL) OR (${table.documentTypeSnapshot} IS DISTINCT FROM 'other' AND ${table.documentTypeOtherNameSnapshot} IS NULL)`,
    ),
    check(
      "rental_contract_party_periods_identity_snapshot_key_check",
      sql`(${table.identitySnapshotCiphertext} IS NULL AND ${table.identitySnapshotKeyVersion} IS NULL) OR (${table.identitySnapshotCiphertext} IS NOT NULL AND ${table.identitySnapshotKeyVersion} > 0)`,
    ),
    index("rental_contract_party_periods_contract_validity_idx").on(
      table.organizationId,
      table.contractId,
      table.validFrom,
      table.validTo,
    ),
    index("rental_contract_party_periods_tenant_idx").on(table.organizationId, table.tenantId),
  ],
);

/** 已开始合同承租方变化的审计型领域记录。 */
export const rentalContractChanges = snakeCase.table(
  "rental_contract_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractId: uuid().notNull(),
    type: rentalContractChangeType().notNull(),
    effectiveDate: date({ mode: "string" }).notNull(),
    reason: text().notNull(),
    beforePartyRefs: jsonb().notNull(),
    afterPartyRefs: jsonb().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "rental_contract_changes_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    index("rental_contract_changes_contract_effective_date_idx").on(
      table.organizationId,
      table.contractId,
      table.effectiveDate,
    ),
  ],
);

/** 只追加保存合同终止撤销业务原因的领域动作历史。 */
export const rentalContractActions = snakeCase.table(
  "rental_contract_actions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    type: rentalContractActionType().notNull(),
    reason: text().notNull(),
    terminationDateBeforeRevoke: date({ mode: "string" }).notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "rental_contract_actions_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_contract_actions_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
    index("rental_contract_actions_contract_created_at_idx").on(
      table.organizationId,
      table.contractId,
      table.createdAt,
    ),
  ],
);

/** 合同的押金约定；仅记录约定和确认结果，不产生资金责任或流水。 */
export const rentalContractDepositTerms = snakeCase.table(
  "rental_contract_deposit_terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractId: uuid().notNull(),
    type: rentalDepositType().notNull(),
    customName: text(),
    calculationMode: rentalDepositCalculationMode().notNull(),
    fixedAmountMinor: bigint({ mode: "number" }),
    rentMultiple: numeric({ precision: 12, scale: 4 }),
    finalAmountMinor: bigint({ mode: "number" }),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "rental_contract_deposit_terms_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_contract_deposit_terms_custom_name_check",
      sql`(${table.type} = 'other' AND ${table.customName} IS NOT NULL) OR (${table.type} <> 'other' AND ${table.customName} IS NULL)`,
    ),
    check(
      "rental_contract_deposit_terms_calculation_mode_check",
      sql`(${table.calculationMode} = 'fixed_amount' AND ${table.fixedAmountMinor} IS NOT NULL AND ${table.rentMultiple} IS NULL) OR (${table.calculationMode} = 'rent_multiple' AND ${table.fixedAmountMinor} IS NULL AND ${table.rentMultiple} IS NOT NULL)`,
    ),
    check(
      "rental_contract_deposit_terms_fixed_amount_minor_check",
      sql`${table.fixedAmountMinor} IS NULL OR (${table.fixedAmountMinor} > 0 AND ${table.fixedAmountMinor} <= 9007199254740991)`,
    ),
    check(
      "rental_contract_deposit_terms_rent_multiple_check",
      sql`${table.rentMultiple} IS NULL OR ${table.rentMultiple} > 0`,
    ),
    check(
      "rental_contract_deposit_terms_final_amount_minor_check",
      sql`${table.finalAmountMinor} IS NULL OR (${table.finalAmountMinor} > 0 AND ${table.finalAmountMinor} <= 9007199254740991)`,
    ),
    index("rental_contract_deposit_terms_contract_sort_idx").on(
      table.organizationId,
      table.contractId,
      table.sortOrder,
    ),
  ],
);

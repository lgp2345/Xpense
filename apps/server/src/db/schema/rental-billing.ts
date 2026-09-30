import type {
  RentalBillSnapshot,
  RentalBillTotals,
  RentalContractDepositTerm,
} from "@xpense/shared";
import { rentalBillLineKinds, rentalBillTypes } from "@xpense/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
import { rentalProperties } from "./rental.js";
import { rentalContracts } from "./rental-tenancy.js";

export const rentalBillType = pgEnum("rental_bill_type", rentalBillTypes);
export const rentalBillStatus = pgEnum("rental_bill_status", ["active", "voided"]);
export const rentalBillLineKind = pgEnum("rental_bill_line_kind", rentalBillLineKinds);

/** 一次确认整批应收的请求记录；幂等键在组织内唯一。 */
export const rentalBillGenerations = snakeCase.table(
  "rental_bill_generations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    idempotencyKey: text().notNull(),
    requestHash: text().notNull(),
    sourceVersion: text().notNull(),
    origin: text().$type<"manual" | "termination">().notNull(),
    createdCount: integer().notNull(),
    existingCount: integer().notNull(),
    totals: jsonb().$type<RentalBillTotals>().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_bill_generations_scope_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    unique("rental_bill_generations_request_unique").on(table.organizationId, table.idempotencyKey),
    foreignKey({
      name: "rental_bill_generations_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_bill_generations_origin_check",
      sql`${table.origin} IN ('manual', 'termination')`,
    ),
    check(
      "rental_bill_generations_count_check",
      sql`${table.createdCount} >= 0 AND ${table.existingCount} >= 0`,
    ),
  ],
);

/** 独立终止财务事件，撤销保留原因和操作人。 */
export const rentalBillAdjustments = snakeCase.table(
  "rental_bill_adjustments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    terminationDate: date({ mode: "string" }).notNull(),
    terminationRecordedAt: timestamp({ withTimezone: true }).notNull(),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    originalAmountMinor: bigint({ mode: "number" }).notNull(),
    referenceAmountMinor: bigint({ mode: "number" }).notNull(),
    finalAmountMinor: bigint({ mode: "number" }).notNull(),
    reason: text().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => users.id),
    revokeReason: text(),
  },
  (table) => [
    unique("rental_bill_adjustments_scope_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    foreignKey({
      name: "rental_bill_adjustments_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    uniqueIndex("rental_bill_adjustments_current_unique")
      .on(table.organizationId, table.contractId)
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      "rental_bill_adjustments_dates_check",
      sql`${table.periodStart} <= ${table.terminationDate} AND ${table.terminationDate} <= ${table.periodEnd}`,
    ),
    check(
      "rental_bill_adjustments_money_check",
      sql`${table.originalAmountMinor} BETWEEN 0 AND 9007199254740991 AND ${table.referenceAmountMinor} BETWEEN 0 AND 9007199254740991 AND ${table.finalAmountMinor} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      "rental_bill_adjustments_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
    check(
      "rental_bill_adjustments_revoke_check",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedByUserId} IS NULL AND ${table.revokeReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revokedByUserId} IS NOT NULL AND char_length(btrim(${table.revokeReason})) BETWEEN 1 AND 1000)`,
    ),
  ],
);

/** 组织年度账单序列，整批原子分配，不共享合同编号。 */
export const rentalBillNumberCounters = snakeCase.table(
  "rental_bill_number_counters",
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    year: integer().notNull(),
    lastValue: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.year] }),
    check(
      "rental_bill_number_counters_check",
      sql`${table.year} BETWEEN 1 AND 9999 AND ${table.lastValue} >= 0`,
    ),
  ],
);

/** 应收历史；押金条目 UUID 只作快照，允许合同条目重建。 */
export const rentalBills = snakeCase.table(
  "rental_bills",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    propertyId: uuid().notNull(),
    billNumber: text().notNull(),
    contractNumber: text().notNull(),
    propertyName: text().notNull(),
    currencyCode: text().notNull(),
    type: rentalBillType().notNull(),
    status: rentalBillStatus().notNull().default("active"),
    sourceKey: text().notNull(),
    periodStart: date({ mode: "string" }),
    periodEnd: date({ mode: "string" }),
    effectiveEnd: date({ mode: "string" }),
    dueDate: date({ mode: "string" }).notNull(),
    amountMinor: bigint({ mode: "number" }).notNull(),
    generationId: uuid().notNull(),
    adjustmentId: uuid(),
    snapshot: jsonb().$type<RentalBillSnapshot>().notNull(),
    depositSourceId: uuid(),
    depositSnapshot: jsonb().$type<RentalContractDepositTerm>(),
    voidReason: text(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedBy: uuid().references(() => users.id),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_bills_scope_unique").on(table.organizationId, table.contractId, table.id),
    unique("rental_bills_number_unique").on(table.organizationId, table.billNumber),
    uniqueIndex("rental_bills_active_source_unique")
      .on(table.organizationId, table.contractId, table.type, table.sourceKey)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      name: "rental_bills_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    foreignKey({
      name: "rental_bills_property_scope_fk",
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [rentalProperties.organizationId, rentalProperties.id],
    }),
    foreignKey({
      name: "rental_bills_generation_scope_fk",
      columns: [table.organizationId, table.contractId, table.generationId],
      foreignColumns: [
        rentalBillGenerations.organizationId,
        rentalBillGenerations.contractId,
        rentalBillGenerations.id,
      ],
    }),
    foreignKey({
      name: "rental_bills_adjustment_scope_fk",
      columns: [table.organizationId, table.contractId, table.adjustmentId],
      foreignColumns: [
        rentalBillAdjustments.organizationId,
        rentalBillAdjustments.contractId,
        rentalBillAdjustments.id,
      ],
    }),
    check("rental_bills_amount_check", sql`${table.amountMinor} BETWEEN 0 AND 9007199254740991`),
    check(
      "rental_bills_period_check",
      sql`(${table.type} = 'deposit' AND ${table.periodStart} IS NULL AND ${table.periodEnd} IS NULL AND ${table.effectiveEnd} IS NULL) OR (${table.type} = 'rent' AND ${table.periodStart} IS NOT NULL AND ${table.periodEnd} IS NOT NULL AND ${table.effectiveEnd} IS NOT NULL AND ${table.effectiveEnd} BETWEEN ${table.periodStart} AND ${table.periodEnd})`,
    ),
    check(
      "rental_bills_void_check",
      sql`(${table.status} = 'active' AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL AND ${table.voidReason} IS NULL) OR (${table.status} = 'voided' AND ${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL AND ${table.voidReason} IS NOT NULL)`,
    ),
    index("rental_bills_filter_idx").on(
      table.organizationId,
      table.status,
      table.dueDate,
      table.id,
    ),
  ],
);

/** 月度计算片段、押金依据和有符号的终止差额。 */
export const rentalBillLines = snakeCase.table(
  "rental_bill_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    billId: uuid().notNull(),
    kind: rentalBillLineKind().notNull(),
    label: text().notNull(),
    amountMinor: bigint({ mode: "number" }).notNull(),
    periodStart: date({ mode: "string" }),
    periodEnd: date({ mode: "string" }),
    referenceStart: date({ mode: "string" }),
    referenceEnd: date({ mode: "string" }),
    coveredDays: integer(),
    referenceDays: integer(),
    baseRentAmountMinor: bigint({ mode: "number" }),
    sortOrder: integer().notNull(),
  },
  (table) => [
    foreignKey({
      name: "rental_bill_lines_bill_scope_fk",
      columns: [table.organizationId, table.contractId, table.billId],
      foreignColumns: [rentalBills.organizationId, rentalBills.contractId, rentalBills.id],
    }),
    unique("rental_bill_lines_order_unique").on(
      table.organizationId,
      table.billId,
      table.sortOrder,
    ),
    check(
      "rental_bill_lines_money_check",
      sql`${table.amountMinor} BETWEEN -9007199254740991 AND 9007199254740991 AND (${table.kind} = 'termination_adjustment' OR ${table.amountMinor} >= 0)`,
    ),
    check(
      "rental_bill_lines_reference_check",
      sql`${table.kind} <> 'rent_period' OR (${table.periodStart} IS NOT NULL AND ${table.periodEnd} >= ${table.periodStart} AND ${table.referenceStart} IS NOT NULL AND ${table.coveredDays} > 0 AND ${table.referenceDays} >= ${table.coveredDays} AND ${table.baseRentAmountMinor} BETWEEN 1 AND 9007199254740991)`,
    ),
  ],
);

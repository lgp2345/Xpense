import type { RentalFixedFee, RentalMeterKind } from "@xpense/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import { rentalBillLineKind, rentalBillLines, rentalBills } from "./rental-billing.js";
import { rentalContractSpaces, rentalContracts } from "./rental-tenancy.js";

/** 合同收费标准当前版本；固定费用作为有明确定义的 JSON 数组保存。 */
export const rentalChargeTerms = snakeCase.table(
  "rental_charge_terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    version: integer().notNull().default(1),
    waterUnitPrice: numeric({ precision: 20, scale: 4 }).notNull(),
    electricityUnitPrice: numeric({ precision: 20, scale: 4 }).notNull(),
    fixedFees: jsonb().$type<RentalFixedFee[]>().notNull().default([]),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_charge_terms_scope_unique").on(table.organizationId, table.contractId),
    foreignKey({
      name: "rental_charge_terms_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check("rental_charge_terms_version_check", sql`${table.version} >= 1`),
    check(
      "rental_charge_terms_prices_check",
      sql`${table.waterUnitPrice} BETWEEN 0 AND 9999999999999999.9999 AND ${table.electricityUnitPrice} BETWEEN 0 AND 9999999999999999.9999`,
    ),
  ],
);

/** 收费标准历史快照；不覆盖既有价格依据。 */
export const rentalChargeTermRevisions = snakeCase.table(
  "rental_charge_term_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    version: integer().notNull(),
    termsSnapshot: jsonb()
      .$type<{
        waterUnitPrice: string;
        electricityUnitPrice: string;
        fixedFees: RentalFixedFee[];
      }>()
      .notNull(),
    reason: text().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_charge_term_revisions_version_unique").on(
      table.organizationId,
      table.contractId,
      table.version,
    ),
    foreignKey({
      name: "rental_charge_term_revisions_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_charge_term_revisions_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
  ],
);

/** 一条稳定水电读数链；更正沿用 ID 并把旧版本写入历史表。 */
export const rentalMeterReadings = snakeCase.table(
  "rental_meter_readings",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    spaceId: uuid().notNull(),
    kind: rentalBillLineKind().$type<RentalMeterKind>().notNull(),
    readingDate: date({ mode: "string" }).notNull(),
    reading: numeric({ precision: 20, scale: 4 }).notNull(),
    predecessorId: uuid(),
    revision: integer().notNull().default(1),
    reason: text().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_meter_readings_scope_id_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    unique("rental_meter_readings_scope_kind_id_unique").on(
      table.organizationId,
      table.contractId,
      table.spaceId,
      table.kind,
      table.id,
    ),
    unique("rental_meter_readings_predecessor_target_unique").on(
      table.organizationId,
      table.contractId,
      table.spaceId,
      table.kind,
      table.id,
      table.predecessorId,
    ),
    foreignKey({
      name: "rental_meter_readings_contract_space_scope_fk",
      columns: [table.organizationId, table.contractId, table.spaceId],
      foreignColumns: [
        rentalContractSpaces.organizationId,
        rentalContractSpaces.contractId,
        rentalContractSpaces.spaceId,
      ],
    }),
    foreignKey({
      name: "rental_meter_readings_predecessor_scope_kind_fk",
      columns: [
        table.organizationId,
        table.contractId,
        table.spaceId,
        table.kind,
        table.predecessorId,
      ],
      foreignColumns: [table.organizationId, table.contractId, table.spaceId, table.kind, table.id],
    }),
    check("rental_meter_readings_kind_check", sql`${table.kind}::text IN ('water', 'electricity')`),
    check(
      "rental_meter_readings_value_check",
      sql`${table.reading} BETWEEN 0 AND 9999999999999999.9999 AND ${table.revision} >= 1 AND (${table.predecessorId} IS NULL OR ${table.predecessorId} <> ${table.id})`,
    ),
    check(
      "rental_meter_readings_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
    uniqueIndex("rental_meter_readings_baseline_unique")
      .on(table.organizationId, table.contractId, table.spaceId, table.kind)
      .where(sql`${table.predecessorId} IS NULL`),
    unique("rental_meter_readings_date_unique").on(
      table.organizationId,
      table.contractId,
      table.spaceId,
      table.kind,
      table.readingDate,
    ),
    index("rental_meter_readings_scope_date_idx").on(
      table.organizationId,
      table.contractId,
      table.kind,
      table.readingDate,
    ),
  ],
);

/** 被更正读数的完整旧版本。 */
export const rentalMeterReadingRevisions = snakeCase.table(
  "rental_meter_reading_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    readingId: uuid().notNull(),
    revision: integer().notNull(),
    snapshot: jsonb().notNull(),
    reason: text().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_meter_reading_revisions_version_unique").on(
      table.organizationId,
      table.contractId,
      table.readingId,
      table.revision,
    ),
    foreignKey({
      name: "rental_meter_reading_revisions_reading_scope_fk",
      columns: [table.organizationId, table.contractId, table.readingId],
      foreignColumns: [
        rentalMeterReadings.organizationId,
        rentalMeterReadings.contractId,
        rentalMeterReadings.id,
      ],
    }),
    check(
      "rental_meter_reading_revisions_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`,
    ),
  ],
);

/** 当前账单行与真实表计边界；复合外键证明终值正好以前值为前驱。 */
export const rentalBillMeterIntervals = snakeCase.table(
  "rental_bill_meter_intervals",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    spaceId: uuid().notNull(),
    billId: uuid().notNull(),
    billLineId: uuid().notNull(),
    kind: rentalBillLineKind().$type<RentalMeterKind>().notNull(),
    startReadingId: uuid().notNull(),
    endReadingId: uuid().notNull(),
  },
  (table) => [
    unique("rental_bill_meter_intervals_line_unique").on(
      table.organizationId,
      table.contractId,
      table.billLineId,
    ),
    unique("rental_bill_meter_intervals_period_unique").on(
      table.organizationId,
      table.contractId,
      table.spaceId,
      table.kind,
      table.startReadingId,
      table.endReadingId,
    ),
    foreignKey({
      name: "rental_bill_meter_intervals_bill_scope_fk",
      columns: [table.organizationId, table.contractId, table.billId],
      foreignColumns: [rentalBills.organizationId, rentalBills.contractId, rentalBills.id],
    }),
    foreignKey({
      name: "rental_bill_meter_intervals_line_scope_kind_fk",
      columns: [table.organizationId, table.contractId, table.billId, table.billLineId, table.kind],
      foreignColumns: [
        rentalBillLines.organizationId,
        rentalBillLines.contractId,
        rentalBillLines.billId,
        rentalBillLines.id,
        rentalBillLines.kind,
      ],
    }),
    foreignKey({
      name: "rental_bill_meter_intervals_start_reading_scope_kind_fk",
      columns: [
        table.organizationId,
        table.contractId,
        table.spaceId,
        table.kind,
        table.startReadingId,
      ],
      foreignColumns: [
        rentalMeterReadings.organizationId,
        rentalMeterReadings.contractId,
        rentalMeterReadings.spaceId,
        rentalMeterReadings.kind,
        rentalMeterReadings.id,
      ],
    }),
    foreignKey({
      name: "rental_bill_meter_intervals_end_predecessor_scope_fk",
      columns: [
        table.organizationId,
        table.contractId,
        table.spaceId,
        table.kind,
        table.endReadingId,
        table.startReadingId,
      ],
      foreignColumns: [
        rentalMeterReadings.organizationId,
        rentalMeterReadings.contractId,
        rentalMeterReadings.spaceId,
        rentalMeterReadings.kind,
        rentalMeterReadings.id,
        rentalMeterReadings.predecessorId,
      ],
    }),
    check(
      "rental_bill_meter_intervals_kind_check",
      sql`${table.kind}::text IN ('water', 'electricity')`,
    ),
    check(
      "rental_bill_meter_intervals_distinct_check",
      sql`${table.startReadingId} <> ${table.endReadingId}`,
    ),
    index("rental_bill_meter_intervals_bill_idx").on(
      table.organizationId,
      table.contractId,
      table.billId,
    ),
  ],
);

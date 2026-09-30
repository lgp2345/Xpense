import type { RentalCashKind, RentalCashPurpose } from "@xpense/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./identity.js";
import { rentalBills } from "./rental-billing.js";
import { rentalSettlements } from "./rental-settlements.js";
import { rentalContracts } from "./rental-tenancy.js";

/** 可撤销的租赁收退款事实；撤销不会改变金额或删除记录。 */
export const rentalCashEntries = snakeCase.table(
  "rental_cash_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    billId: uuid(),
    settlementId: uuid(),
    kind: text().$type<RentalCashKind>().notNull(),
    purpose: text().$type<RentalCashPurpose>().notNull(),
    amountMinor: bigint({ mode: "number" }).notNull(),
    occurredOn: date({ mode: "string" }).notNull(),
    note: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => users.id),
    revokeReason: text(),
  },
  (table) => [
    unique("rental_cash_entries_scope_unique").on(table.organizationId, table.contractId, table.id),
    foreignKey({
      name: "rental_cash_entries_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    foreignKey({
      name: "rental_cash_entries_bill_scope_fk",
      columns: [table.organizationId, table.contractId, table.billId],
      foreignColumns: [rentalBills.organizationId, rentalBills.contractId, rentalBills.id],
    }),
    foreignKey({
      name: "rental_cash_entries_settlement_scope_fk",
      columns: [table.organizationId, table.contractId, table.settlementId],
      foreignColumns: [
        rentalSettlements.organizationId,
        rentalSettlements.contractId,
        rentalSettlements.id,
      ],
    }),
    check(
      "rental_cash_entries_target_check",
      sql`(${table.billId} IS NOT NULL AND ${table.settlementId} IS NULL) OR (${table.billId} IS NULL AND ${table.settlementId} IS NOT NULL)`,
    ),
    check(
      "rental_cash_entries_kind_purpose_target_check",
      sql`(${table.kind} = 'receipt' AND ${table.purpose} IN ('bill_receipt', 'deposit_receipt') AND ${table.billId} IS NOT NULL) OR (${table.kind} = 'receipt' AND ${table.purpose} = 'settlement_receipt' AND ${table.settlementId} IS NOT NULL) OR (${table.kind} = 'refund' AND ${table.purpose} = 'refund')`,
    ),
    check(
      "rental_cash_entries_amount_check",
      sql`${table.amountMinor} BETWEEN 1 AND 9007199254740991`,
    ),
    check(
      "rental_cash_entries_revoke_check",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedByUserId} IS NULL AND ${table.revokeReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revokedByUserId} IS NOT NULL AND ${table.revokeReason} IS NOT NULL AND char_length(btrim(${table.revokeReason})) BETWEEN 1 AND 1000)`,
    ),
    uniqueIndex("rental_cash_entries_active_deposit_receipt_unique")
      .on(table.organizationId, table.contractId, table.billId)
      .where(
        sql`${table.purpose} = 'deposit_receipt' AND ${table.revokedAt} IS NULL AND ${table.billId} IS NOT NULL`,
      ),
    index("rental_cash_entries_bill_occurred_idx").on(
      table.organizationId,
      table.contractId,
      table.billId,
      table.occurredOn,
    ),
    index("rental_cash_entries_settlement_occurred_idx").on(
      table.organizationId,
      table.contractId,
      table.settlementId,
      table.occurredOn,
    ),
  ],
);

/** 事务成功后写入的组织级幂等结果；唯一键不被合同或动作缩窄。 */
export const rentalFinanceRequests = snakeCase.table(
  "rental_finance_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    contractId: uuid().notNull(),
    idempotencyKey: text().notNull(),
    action: text().notNull(),
    requestHash: text().notNull(),
    result: jsonb()
      .$type<{
        resourceId: string;
        resourceKind: "terms" | "baseline" | "bill" | "cash" | "revision" | "settlement";
      }>()
      .notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_finance_requests_request_unique").on(table.organizationId, table.idempotencyKey),
    foreignKey({
      name: "rental_finance_requests_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_finance_requests_key_check",
      sql`char_length(btrim(${table.idempotencyKey})) BETWEEN 1 AND 200 AND char_length(btrim(${table.action})) BETWEEN 1 AND 100 AND char_length(btrim(${table.requestHash})) BETWEEN 1 AND 200`,
    ),
    index("rental_finance_requests_contract_created_idx").on(
      table.organizationId,
      table.contractId,
      table.createdAt,
    ),
  ],
);

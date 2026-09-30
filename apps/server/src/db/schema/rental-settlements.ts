import type { RentalSettlementKind, RentalSettlementStatus } from "@xpense/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";
import { rentalBills } from "./rental-billing.js";
import { rentalContracts } from "./rental-tenancy.js";

type SettlementSnapshot = {
  effectiveEndDate: string;
  finalBills: Array<{
    billId: string | null;
    billingMonth: string;
    lines: unknown[];
    amountMinor: number;
  }>;
  finalCostMinor: number;
  differenceMinor: number;
};

/** 合同当前结算；修改沿用稳定 ID 并追加修订快照。 */
export const rentalSettlements = snakeCase.table(
  "rental_settlements",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    eventId: uuid().notNull(),
    kind: text().$type<RentalSettlementKind>().notNull(),
    effectiveEndDate: date({ mode: "string" }).notNull(),
    version: text().notNull(),
    revision: integer().notNull().default(1),
    finalCostMinor: bigint({ mode: "number" }).notNull(),
    status: text().$type<RentalSettlementStatus>().notNull(),
    snapshot: jsonb().$type<SettlementSnapshot>().notNull(),
    confirmedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    confirmedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_settlements_scope_unique").on(table.organizationId, table.contractId, table.id),
    unique("rental_settlements_contract_current_unique").on(table.organizationId, table.contractId),
    unique("rental_settlements_event_unique").on(
      table.organizationId,
      table.contractId,
      table.eventId,
    ),
    foreignKey({
      name: "rental_settlements_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check(
      "rental_settlements_kind_check",
      sql`${table.kind} IN ('termination', 'expiry', 'cancellation')`,
    ),
    check(
      "rental_settlements_status_check",
      sql`${table.status} IN ('pending_collection', 'pending_refund', 'settled')`,
    ),
    check(
      "rental_settlements_amount_check",
      sql`${table.finalCostMinor} BETWEEN 0 AND 9007199254740991 AND ${table.revision} >= 1`,
    ),
    check(
      "rental_settlements_version_check",
      sql`char_length(btrim(${table.version})) BETWEEN 1 AND 200`,
    ),
    index("rental_settlements_contract_confirmed_idx").on(
      table.organizationId,
      table.contractId,
      table.confirmedAt,
    ),
  ],
);

/** 每次结算确认和投影刷新之前的完整版本。 */
export const rentalSettlementRevisions = snakeCase.table(
  "rental_settlement_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    settlementId: uuid().notNull(),
    revision: integer().notNull(),
    snapshot: jsonb().notNull(),
    reason: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_settlement_revisions_version_unique").on(
      table.organizationId,
      table.contractId,
      table.settlementId,
      table.revision,
    ),
    foreignKey({
      name: "rental_settlement_revisions_settlement_scope_fk",
      columns: [table.organizationId, table.contractId, table.settlementId],
      foreignColumns: [
        rentalSettlements.organizationId,
        rentalSettlements.contractId,
        rentalSettlements.id,
      ],
    }),
  ],
);

/** 当前结算纳入的账单集合；账单本身不反向关联结算，避免循环引用。 */
export const rentalSettlementBills = snakeCase.table(
  "rental_settlement_bills",
  {
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    settlementId: uuid().notNull(),
    billId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rental_settlement_bills_contract_bill_unique").on(
      table.organizationId,
      table.contractId,
      table.billId,
    ),
    foreignKey({
      name: "rental_settlement_bills_settlement_scope_fk",
      columns: [table.organizationId, table.contractId, table.settlementId],
      foreignColumns: [
        rentalSettlements.organizationId,
        rentalSettlements.contractId,
        rentalSettlements.id,
      ],
    }),
    foreignKey({
      name: "rental_settlement_bills_bill_scope_fk",
      columns: [table.organizationId, table.contractId, table.billId],
      foreignColumns: [rentalBills.organizationId, rentalBills.contractId, rentalBills.id],
    }),
    index("rental_settlement_bills_settlement_idx").on(
      table.organizationId,
      table.contractId,
      table.settlementId,
    ),
  ],
);

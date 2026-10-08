import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  snakeCase,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import { rentalContracts } from "./rental-tenancy.js";
/** 首次成功出账时保存的接续下界，作废账单不删除该设置。 */
export const rentalBillingStarts = snakeCase.table(
  "rental_billing_starts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    firstPeriodStart: date({ mode: "string" }).notNull(),
    invalidatedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rental_billing_starts_contract_current_unique")
      .on(table.organizationId, table.contractId)
      .where(sql`${table.invalidatedAt} IS NULL`),
    unique("rental_billing_starts_scope_unique").on(
      table.organizationId,
      table.contractId,
      table.id,
    ),
    foreignKey({
      name: "rental_billing_starts_contract_scope_fk",
      columns: [table.organizationId, table.contractId],
      foreignColumns: [rentalContracts.organizationId, rentalContracts.id],
    }),
    check("rental_billing_starts_version_check", sql`${table.version} >= 1`),
  ],
);

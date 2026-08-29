import { rentalPropertyTypes, rentalSpaceTypes } from "@xpense/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ledgers } from "./bookkeeping.js";
import { organizations, users } from "./identity.js";

/** 租赁房产类型。 */
export const rentalPropertyType = pgEnum("rental_property_type", rentalPropertyTypes);

/** 租赁空间类型。 */
export const rentalSpaceType = pgEnum("rental_space_type", rentalSpaceTypes);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/** 组织租赁账本对应的房产；一个租赁账本只能绑定一处房产。 */
export const rentalProperties = snakeCase.table(
  "rental_properties",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    ledgerId: uuid().notNull(),
    name: text().notNull(),
    type: rentalPropertyType().notNull(),
    /** 仅当类型为 other 时填写的自定义房产类型名称。 */
    customTypeName: text(),
    /** ISO 3166-1 alpha-2 两位国家代码。 */
    countryCode: text().notNull(),
    province: text(),
    city: text(),
    district: text(),
    addressLine: text().notNull(),
    note: text(),
    /** 停用房产不再用于新业务，但历史记录仍可关联。 */
    isActive: boolean().notNull().default(true),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；保留账务与租赁历史对房产的引用。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("rental_properties_organization_id_unique").on(table.organizationId, table.id),
    unique("rental_properties_organization_ledger_unique").on(table.organizationId, table.ledgerId),
    foreignKey({
      name: "rental_properties_organization_ledger_fk",
      columns: [table.organizationId, table.ledgerId],
      foreignColumns: [ledgers.organizationId, ledgers.id],
    }),
    check(
      "rental_properties_custom_type_name_check",
      sql`(${table.type} = 'other' AND ${table.customTypeName} IS NOT NULL) OR (${table.type} <> 'other' AND ${table.customTypeName} IS NULL)`,
    ),
    check("rental_properties_country_code_check", sql`char_length(${table.countryCode}) = 2`),
    uniqueIndex("rental_properties_active_name_unique")
      .on(table.organizationId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("rental_properties_organization_deleted_idx").on(table.organizationId, table.deletedAt),
  ],
);

/** 房产下可分组、可出租的空间树；父子关系始终限定在同一组织与房产中。 */
export const rentalSpaces = snakeCase.table(
  "rental_spaces",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid().notNull(),
    /** 空值表示房产的根空间；非空值必须属于同一房产。 */
    parentId: uuid(),
    name: text().notNull(),
    /** 同父空间内可选且唯一的业务编码。 */
    code: text(),
    type: rentalSpaceType().notNull(),
    /** 仅当类型为 other 时填写的自定义空间类型名称。 */
    customTypeName: text(),
    isRentable: boolean().notNull().default(false),
    /** 停用空间保留其树位置和历史关联，但不可继续使用。 */
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    note: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；保留历史账务或租约对空间的关联。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("rental_spaces_organization_property_id_unique").on(
      table.organizationId,
      table.propertyId,
      table.id,
    ),
    foreignKey({
      name: "rental_spaces_organization_property_fk",
      columns: [table.organizationId, table.propertyId],
      foreignColumns: [rentalProperties.organizationId, rentalProperties.id],
    }),
    foreignKey({
      name: "rental_spaces_parent_scope_fk",
      columns: [table.organizationId, table.propertyId, table.parentId],
      foreignColumns: [table.organizationId, table.propertyId, table.id],
    }),
    check(
      "rental_spaces_custom_type_name_check",
      sql`(${table.type} = 'other' AND ${table.customTypeName} IS NOT NULL) OR (${table.type} <> 'other' AND ${table.customTypeName} IS NULL)`,
    ),
    uniqueIndex("rental_spaces_active_root_name_unique")
      .on(table.organizationId, table.propertyId, table.name)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("rental_spaces_active_child_name_unique")
      .on(table.organizationId, table.propertyId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("rental_spaces_active_root_code_unique")
      .on(table.organizationId, table.propertyId, table.code)
      .where(
        sql`${table.parentId} IS NULL AND ${table.code} IS NOT NULL AND ${table.deletedAt} IS NULL`,
      ),
    uniqueIndex("rental_spaces_active_child_code_unique")
      .on(table.organizationId, table.propertyId, table.parentId, table.code)
      .where(
        sql`${table.parentId} IS NOT NULL AND ${table.code} IS NOT NULL AND ${table.deletedAt} IS NULL`,
      ),
    index("rental_spaces_scope_parent_deleted_sort_idx").on(
      table.organizationId,
      table.propertyId,
      table.parentId,
      table.deletedAt,
      table.sortOrder,
    ),
  ],
);

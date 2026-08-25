import { rentalPropertyTypes, rentalSpaceTypes } from "@xpense/shared";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  accountMovements,
  accounts,
  accountType,
  auditLogs,
  categories,
  categoryType,
  ledgers,
  ledgerType,
  menus,
  menuType,
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rentalProperties,
  rentalPropertyType,
  rentalSpaces,
  rentalSpaceType,
  rolePermissions,
  roles,
  transactions,
  transactionType,
  users,
} from "./schema.js";

describe("RBAC database schema", () => {
  it("exports all RBAC tables", () => {
    expect(users).toBeDefined();
    expect(organizations).toBeDefined();
    expect(organizationMemberships).toBeDefined();
    expect(roles).toBeDefined();
    expect(permissions).toBeDefined();
    expect(rolePermissions).toBeDefined();
    expect(refreshSessions).toBeDefined();
    expect(auditLogs).toBeDefined();
  });
});

describe("organization menu database schema", () => {
  it("uses identity menu ids and organization-scoped numeric parents", () => {
    expect(menus.id.dataType).toMatch(/^number/);
    expect(menus.id.generatedIdentity?.type).toBe("always");
    expect(menus.organizationId.notNull).toBe(true);
    expect(menus.parentId.dataType).toMatch(/^number/);
  });

  it("exports the menu type enum and complete menu fields", () => {
    expect(menuType.enumValues).toEqual(["directory", "menu", "button"]);
    expect(menus).toMatchObject({
      type: expect.anything(),
      routeKey: expect.anything(),
      path: expect.anything(),
      permissionCode: expect.anything(),
      isExternal: expect.anything(),
      isVisible: expect.anything(),
      keepAlive: expect.anything(),
      icon: expect.anything(),
      name: expect.anything(),
      sortOrder: expect.anything(),
    });
    expect(menus).not.toHaveProperty("componentKey");
    expect(menus).not.toHaveProperty("url");
  });

  it("enforces menu type combinations and organization-local parentage", () => {
    const config = getTableConfig(menus);
    const dialect = new PgDialect();
    const checks = Object.fromEntries(
      config.checks.map((constraint) => [
        constraint.name,
        dialect.sqlToQuery(constraint.value).sql,
      ]),
    );

    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      "menus_directory_fields_check",
      "menus_internal_menu_fields_check",
      "menus_external_menu_fields_check",
      "menus_button_fields_check",
    ]);
    const expectCheck = (name: string, included: string[], excluded: string[]) => {
      const expression = checks[name];

      expect(expression).toEqual(expect.any(String));
      for (const fragment of included) {
        expect(expression).toContain(fragment);
      }
      for (const fragment of excluded) {
        expect(expression).not.toContain(fragment);
      }
    };

    expectCheck(
      "menus_directory_fields_check",
      [
        '"menus"."type" <> \'directory\' OR (',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."keep_alive" IS NULL',
        '"menus"."is_visible" IS NOT NULL',
      ],
      [
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_external" IS TRUE',
        '"menus"."is_external" IS FALSE',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_internal_menu_fields_check",
      [
        '"menus"."type" <> \'menu\' OR "menus"."is_external" IS TRUE OR (',
        '"menus"."is_external" IS FALSE',
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NOT NULL',
      ],
      [
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_external_menu_fields_check",
      [
        '"menus"."type" <> \'menu\' OR "menus"."is_external" IS FALSE OR (',
        '"menus"."is_external" IS TRUE',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NULL',
      ],
      [
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_button_fields_check",
      [
        '"menus"."type" <> \'button\' OR (',
        '"menus"."parent_id" IS NOT NULL',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NULL',
        '"menus"."icon" IS NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NULL',
      ],
      [
        '"menus"."parent_id" IS NULL',
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."icon" IS NOT NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_external" IS TRUE',
        '"menus"."is_external" IS FALSE',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."url"',
      ],
    );

    const routeKeyIndex = config.indexes.find(
      (index) => index.config.name === "menus_organization_route_key_unique",
    );
    const pathIndex = config.indexes.find(
      (index) => index.config.name === "menus_organization_path_unique",
    );
    const routeKeyPredicate = routeKeyIndex?.config.where;
    const pathPredicate = pathIndex?.config.where;
    if (!routeKeyIndex || !pathIndex || !routeKeyPredicate || !pathPredicate) {
      throw new Error("menu partial unique indexes must be configured");
    }
    expect(
      routeKeyIndex.config.columns.map((column) => ("name" in column ? column.name : undefined)),
    ).toEqual(["organization_id", "route_key"]);
    expect(dialect.sqlToQuery(routeKeyPredicate).sql).toBe('"menus"."route_key" IS NOT NULL');
    expect(
      pathIndex.config.columns.map((column) => ("name" in column ? column.name : undefined)),
    ).toEqual(["organization_id", "path"]);
    expect(dialect.sqlToQuery(pathPredicate).sql).toBe('"menus"."path" IS NOT NULL');

    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "menus_organization_id_unique",
    );
    const parentForeignKey = config.foreignKeys.find(
      (constraint) => constraint.getName() === "menus_organization_parent_fk",
    );
    const parentReference = parentForeignKey?.reference();
    expect(parentReference?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "parent_id",
    ]);
    expect(parentReference?.foreignColumns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
    ]);
  });
});

describe("bookkeeping database schema", () => {
  const columnNames = (columns: unknown[]) =>
    columns.map((column) =>
      typeof column === "object" && column !== null && "name" in column ? column.name : undefined,
    );

  it("exports bookkeeping tables and enums", () => {
    expect(ledgers).toBeDefined();
    expect(accounts).toBeDefined();
    expect(categories).toBeDefined();
    expect(transactions).toBeDefined();
    expect(accountMovements).toBeDefined();

    expect(ledgerType.enumValues).toEqual(["personal", "rental"]);
    expect(accountType.enumValues).toEqual(["cash", "bank", "e_wallet", "credit_card", "other"]);
    expect(categoryType.enumValues).toEqual(["income", "expense"]);
    expect(transactionType.enumValues).toEqual([
      "income",
      "expense",
      "transfer",
      "excluded_inflow",
      "excluded_outflow",
    ]);
  });

  it("adds organization bookkeeping defaults", () => {
    expect(organizations.baseCurrency).toMatchObject({
      dataType: "string",
      default: "CNY",
      notNull: true,
    });
    expect(organizations.timezone).toMatchObject({
      dataType: "string",
      default: "Asia/Shanghai",
      notNull: true,
    });
  });

  it("uses number-mode bigint amounts and explicit accounting dates", () => {
    expect(transactions.amountMinor.dataType).toBe("number int53");
    expect(transactions.amountMinor.getSQLType()).toBe("bigint");
    expect(accountMovements.amountMinor.dataType).toBe("number int53");
    expect(accountMovements.amountMinor.getSQLType()).toBe("bigint");
    expect(transactions.occurredAt.getSQLType()).toBe("timestamp with time zone");
    expect(transactions.occurredOn.getSQLType()).toBe("date");
  });

  it("enforces amount and bookkeeping index rules", () => {
    const dialect = new PgDialect();
    const transactionConfig = getTableConfig(transactions);
    const movementConfig = getTableConfig(accountMovements);
    const transactionChecks = Object.fromEntries(
      transactionConfig.checks.map((constraint) => [
        constraint.name,
        dialect.sqlToQuery(constraint.value).sql,
      ]),
    );
    const movementChecks = Object.fromEntries(
      movementConfig.checks.map((constraint) => [
        constraint.name,
        dialect.sqlToQuery(constraint.value).sql,
      ]),
    );

    expect(transactionChecks.transaction_amount_minor_positive_check).toBe(
      '"transactions"."amount_minor" > 0 AND "transactions"."amount_minor" <= 9007199254740991',
    );
    expect(movementChecks.account_movements_amount_minor_nonzero_check).toBe(
      '"account_movements"."amount_minor" <> 0 AND "account_movements"."amount_minor" BETWEEN -9007199254740991 AND 9007199254740991',
    );

    expect(
      getTableConfig(ledgers).indexes.map((item) => columnNames(item.config.columns)),
    ).toContainEqual(["organization_id", "deleted_at"]);
    expect(
      getTableConfig(accounts).indexes.map((item) => columnNames(item.config.columns)),
    ).toContainEqual(["organization_id", "deleted_at", "sort_order"]);
    expect(
      getTableConfig(categories).indexes.map((item) => columnNames(item.config.columns)),
    ).toContainEqual(["organization_id", "ledger_id", "type", "parent_id", "deleted_at"]);
    expect(transactionConfig.indexes.map((item) => columnNames(item.config.columns))).toEqual(
      expect.arrayContaining([
        ["organization_id", "occurred_on", "occurred_at"],
        ["organization_id", "ledger_id", "occurred_on"],
        ["organization_id", "category_id", "occurred_on"],
      ]),
    );
    expect(movementConfig.indexes.map((item) => columnNames(item.config.columns))).toContainEqual([
      "organization_id",
      "account_id",
      "transaction_id",
    ]);
  });

  it("enforces active defaults and category sibling scope", () => {
    const dialect = new PgDialect();
    const ledgerConfig = getTableConfig(ledgers);
    const categoryConfig = getTableConfig(categories);
    const activeDefault = ledgerConfig.indexes.find(
      (item) => item.config.name === "ledgers_organization_active_default_unique",
    );
    const activeRootName = categoryConfig.indexes.find(
      (item) => item.config.name === "categories_active_root_name_unique",
    );
    const activeChildName = categoryConfig.indexes.find(
      (item) => item.config.name === "categories_active_child_name_unique",
    );
    if (
      !activeDefault?.config.where ||
      !activeRootName?.config.where ||
      !activeChildName?.config.where
    ) {
      throw new Error("bookkeeping partial unique indexes must be configured");
    }

    expect(activeDefault.config.unique).toBe(true);
    expect(columnNames(activeDefault.config.columns)).toEqual(["organization_id"]);
    expect(dialect.sqlToQuery(activeDefault.config.where).sql).toBe(
      '"ledgers"."is_default" IS TRUE AND "ledgers"."deleted_at" IS NULL',
    );

    expect(activeRootName.config.unique).toBe(true);
    expect(columnNames(activeRootName.config.columns)).toEqual([
      "organization_id",
      "ledger_id",
      "type",
      "name",
    ]);
    expect(dialect.sqlToQuery(activeRootName.config.where).sql).toBe(
      '"categories"."parent_id" IS NULL AND "categories"."deleted_at" IS NULL',
    );

    expect(activeChildName.config.unique).toBe(true);
    expect(columnNames(activeChildName.config.columns)).toEqual([
      "organization_id",
      "ledger_id",
      "type",
      "parent_id",
      "name",
    ]);
    expect(dialect.sqlToQuery(activeChildName.config.where).sql).toBe(
      '"categories"."parent_id" IS NOT NULL AND "categories"."deleted_at" IS NULL',
    );

    const parentScopeUnique = categoryConfig.uniqueConstraints.find(
      (constraint) => constraint.getName() === "categories_parent_scope_unique",
    );
    expect(columnNames(parentScopeUnique?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
      "type",
      "id",
    ]);
    const parentForeignKey = categoryConfig.foreignKeys.find(
      (constraint) => constraint.getName() === "categories_parent_scope_fk",
    );
    const parentReference = parentForeignKey?.reference();
    expect(columnNames(parentReference?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
      "type",
      "parent_id",
    ]);
    expect(columnNames(parentReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
      "type",
      "id",
    ]);
  });

  it("keeps bookkeeping foreign keys inside their organization and ledger scopes", () => {
    const ledgerConfig = getTableConfig(ledgers);
    const accountConfig = getTableConfig(accounts);
    const categoryConfig = getTableConfig(categories);
    const transactionConfig = getTableConfig(transactions);
    const movementConfig = getTableConfig(accountMovements);

    expect(
      columnNames(
        ledgerConfig.uniqueConstraints.find(
          (constraint) => constraint.getName() === "ledgers_organization_id_unique",
        )?.columns ?? [],
      ),
    ).toEqual(["organization_id", "id"]);
    expect(
      columnNames(
        accountConfig.uniqueConstraints.find(
          (constraint) => constraint.getName() === "accounts_organization_id_unique",
        )?.columns ?? [],
      ),
    ).toEqual(["organization_id", "id"]);
    expect(
      columnNames(
        categoryConfig.uniqueConstraints.find(
          (constraint) => constraint.getName() === "categories_organization_ledger_id_unique",
        )?.columns ?? [],
      ),
    ).toEqual(["organization_id", "ledger_id", "id"]);
    expect(
      columnNames(
        transactionConfig.uniqueConstraints.find(
          (constraint) => constraint.getName() === "transactions_organization_id_unique",
        )?.columns ?? [],
      ),
    ).toEqual(["organization_id", "id"]);

    const categoryLedgerReference = categoryConfig.foreignKeys
      .find((constraint) => constraint.getName() === "categories_organization_ledger_fk")
      ?.reference();
    expect(columnNames(categoryLedgerReference?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
    ]);
    expect(columnNames(categoryLedgerReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(categoryLedgerReference?.foreignTable).toBe(ledgers);

    const transactionLedgerReference = transactionConfig.foreignKeys
      .find((constraint) => constraint.getName() === "transactions_organization_ledger_fk")
      ?.reference();
    expect(columnNames(transactionLedgerReference?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
    ]);
    expect(columnNames(transactionLedgerReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(transactionLedgerReference?.foreignTable).toBe(ledgers);

    const transactionCategoryReference = transactionConfig.foreignKeys
      .find((constraint) => constraint.getName() === "transactions_category_scope_fk")
      ?.reference();
    expect(columnNames(transactionCategoryReference?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
      "category_id",
    ]);
    expect(columnNames(transactionCategoryReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
      "id",
    ]);
    expect(transactionCategoryReference?.foreignTable).toBe(categories);

    const movementTransactionReference = movementConfig.foreignKeys
      .find(
        (constraint) => constraint.getName() === "account_movements_organization_transaction_fk",
      )
      ?.reference();
    expect(columnNames(movementTransactionReference?.columns ?? [])).toEqual([
      "organization_id",
      "transaction_id",
    ]);
    expect(columnNames(movementTransactionReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(movementTransactionReference?.foreignTable).toBe(transactions);

    const movementAccountReference = movementConfig.foreignKeys
      .find((constraint) => constraint.getName() === "account_movements_organization_account_fk")
      ?.reference();
    expect(columnNames(movementAccountReference?.columns ?? [])).toEqual([
      "organization_id",
      "account_id",
    ]);
    expect(columnNames(movementAccountReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(movementAccountReference?.foreignTable).toBe(accounts);

    expect(
      categoryConfig.foreignKeys.map((constraint) => columnNames(constraint.reference().columns)),
    ).not.toContainEqual(["ledger_id"]);
    expect(
      transactionConfig.foreignKeys.map((constraint) =>
        columnNames(constraint.reference().columns),
      ),
    ).toEqual(expect.not.arrayContaining([["ledger_id"], ["category_id"]]));
    expect(
      movementConfig.foreignKeys.map((constraint) => columnNames(constraint.reference().columns)),
    ).toEqual(expect.not.arrayContaining([["transaction_id"], ["account_id"]]));
  });
});

describe("rental property and space database schema", () => {
  const columnNames = (columns: unknown[]) =>
    columns.map((column) =>
      typeof column === "object" && column !== null && "name" in column ? column.name : undefined,
    );

  it("exports rental tables and keeps enum vocabularies aligned with shared contracts", () => {
    expect(rentalProperties).toBeDefined();
    expect(rentalSpaces).toBeDefined();
    expect(rentalPropertyType.enumValues).toEqual(rentalPropertyTypes);
    expect(rentalSpaceType.enumValues).toEqual(rentalSpaceTypes);
  });

  it("stores required property and space fields with active and historical lifecycle state", () => {
    expect(rentalProperties).toMatchObject({
      id: expect.anything(),
      organizationId: expect.anything(),
      ledgerId: expect.anything(),
      name: expect.anything(),
      type: expect.anything(),
      customTypeName: expect.anything(),
      countryCode: expect.anything(),
      province: expect.anything(),
      city: expect.anything(),
      district: expect.anything(),
      addressLine: expect.anything(),
      note: expect.anything(),
      isActive: expect.anything(),
      createdByUserId: expect.anything(),
      deletedAt: expect.anything(),
      deletedByUserId: expect.anything(),
      createdAt: expect.anything(),
      updatedAt: expect.anything(),
    });
    expect(rentalSpaces).toMatchObject({
      id: expect.anything(),
      organizationId: expect.anything(),
      propertyId: expect.anything(),
      parentId: expect.anything(),
      name: expect.anything(),
      code: expect.anything(),
      type: expect.anything(),
      customTypeName: expect.anything(),
      isRentable: expect.anything(),
      isActive: expect.anything(),
      sortOrder: expect.anything(),
      createdByUserId: expect.anything(),
      deletedAt: expect.anything(),
      deletedByUserId: expect.anything(),
      createdAt: expect.anything(),
      updatedAt: expect.anything(),
    });
    expect(rentalProperties.isActive.default).toBe(true);
    expect(rentalSpaces.isRentable.default).toBe(false);
    expect(rentalSpaces.isActive.default).toBe(true);
    expect(rentalSpaces.sortOrder.default).toBe(0);
  });

  it("enforces organization-scoped one-to-one rental ledgers and property ownership", () => {
    const propertyConfig = getTableConfig(rentalProperties);
    const spaceConfig = getTableConfig(rentalSpaces);

    expect(propertyConfig.uniqueConstraints.map((item) => item.getName())).toEqual(
      expect.arrayContaining([
        "rental_properties_organization_id_unique",
        "rental_properties_organization_ledger_unique",
      ]),
    );
    expect(spaceConfig.uniqueConstraints.map((item) => item.getName())).toContain(
      "rental_spaces_organization_property_id_unique",
    );

    const propertyLedgerReference = propertyConfig.foreignKeys
      .find((item) => item.getName() === "rental_properties_organization_ledger_fk")
      ?.reference();
    expect(columnNames(propertyLedgerReference?.columns ?? [])).toEqual([
      "organization_id",
      "ledger_id",
    ]);
    expect(columnNames(propertyLedgerReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(propertyLedgerReference?.foreignTable).toBe(ledgers);

    const spacePropertyReference = spaceConfig.foreignKeys
      .find((item) => item.getName() === "rental_spaces_organization_property_fk")
      ?.reference();
    expect(columnNames(spacePropertyReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
    ]);
    expect(columnNames(spacePropertyReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(spacePropertyReference?.foreignTable).toBe(rentalProperties);
  });

  it("keeps parent spaces within one property scope and exposes the composite self-reference", () => {
    const spaceConfig = getTableConfig(rentalSpaces);
    const parentReference = spaceConfig.foreignKeys
      .find((item) => item.getName() === "rental_spaces_parent_scope_fk")
      ?.reference();

    expect(spaceConfig.foreignKeys.map((item) => item.getName())).toContain(
      "rental_spaces_parent_scope_fk",
    );
    expect(columnNames(parentReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "parent_id",
    ]);
    expect(columnNames(parentReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "id",
    ]);
    expect(parentReference?.foreignTable).toBe(rentalSpaces);
  });

  it("requires custom names only for other types and validates two-letter country codes", () => {
    const dialect = new PgDialect();
    const propertyChecks = Object.fromEntries(
      getTableConfig(rentalProperties).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const spaceChecks = Object.fromEntries(
      getTableConfig(rentalSpaces).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );

    expect(propertyChecks.rental_properties_custom_type_name_check).toContain("'other'");
    expect(propertyChecks.rental_properties_custom_type_name_check).toContain(
      '"rental_properties"."custom_type_name" IS NOT NULL',
    );
    expect(propertyChecks.rental_properties_country_code_check).toContain("char_length");
    expect(propertyChecks.rental_properties_country_code_check).toContain(" = 2");
    expect(spaceChecks.rental_spaces_custom_type_name_check).toContain("'other'");
    expect(spaceChecks.rental_spaces_custom_type_name_check).toContain(
      '"rental_spaces"."custom_type_name" IS NOT NULL',
    );
  });

  it("keeps active sibling names and non-empty codes unique while supporting fast tree lookup", () => {
    const dialect = new PgDialect();
    const propertyConfig = getTableConfig(rentalProperties);
    const spaceConfig = getTableConfig(rentalSpaces);
    const propertyIndexes = Object.fromEntries(
      propertyConfig.indexes.map((item) => [item.config.name, item]),
    );
    const indexes = Object.fromEntries(spaceConfig.indexes.map((item) => [item.config.name, item]));

    const expectPartialUniqueIndex = (
      item: (typeof propertyConfig.indexes)[number] | undefined,
      name: string,
      columns: string[],
      predicate: string,
    ) => {
      if (!item?.config.where) {
        throw new Error(`${name} must be a partial index`);
      }
      expect(item.config.unique).toBe(true);
      expect(columnNames(item.config.columns)).toEqual(columns);
      expect(dialect.sqlToQuery(item.config.where).sql).toBe(predicate);
    };

    expectPartialUniqueIndex(
      propertyIndexes.rental_properties_active_name_unique,
      "rental_properties_active_name_unique",
      ["organization_id", "name"],
      '"rental_properties"."is_active" IS TRUE AND "rental_properties"."deleted_at" IS NULL',
    );
    const propertyLookupIndex = propertyIndexes.rental_properties_organization_deleted_idx;
    if (!propertyLookupIndex) {
      throw new Error("rental property lookup index must be configured");
    }
    expect(columnNames(propertyLookupIndex.config.columns)).toEqual([
      "organization_id",
      "deleted_at",
    ]);
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_root_name_unique,
      "rental_spaces_active_root_name_unique",
      ["organization_id", "property_id", "name"],
      '"rental_spaces"."parent_id" IS NULL AND "rental_spaces"."is_active" IS TRUE AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_child_name_unique,
      "rental_spaces_active_child_name_unique",
      ["organization_id", "property_id", "parent_id", "name"],
      '"rental_spaces"."parent_id" IS NOT NULL AND "rental_spaces"."is_active" IS TRUE AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_root_code_unique,
      "rental_spaces_active_root_code_unique",
      ["organization_id", "property_id", "code"],
      '"rental_spaces"."parent_id" IS NULL AND "rental_spaces"."code" IS NOT NULL AND "rental_spaces"."is_active" IS TRUE AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_child_code_unique,
      "rental_spaces_active_child_code_unique",
      ["organization_id", "property_id", "parent_id", "code"],
      '"rental_spaces"."parent_id" IS NOT NULL AND "rental_spaces"."code" IS NOT NULL AND "rental_spaces"."is_active" IS TRUE AND "rental_spaces"."deleted_at" IS NULL',
    );
    expect(columnNames(indexes.rental_spaces_scope_parent_deleted_sort_idx.config.columns)).toEqual(
      ["organization_id", "property_id", "parent_id", "deleted_at", "sort_order"],
    );
  });
});

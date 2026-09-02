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
  rentalContractActions,
  rentalContractActionType,
  rentalContractChanges,
  rentalContractDepositTerms,
  rentalContractNumberCounters,
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContractStatus,
  rentalContracts,
  rentalProperties,
  rentalPropertyType,
  rentalSpaces,
  rentalSpaceType,
  rentalTenants,
  rentalTenantType,
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
      updatedByUserId: expect.anything(),
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
      note: expect.anything(),
      createdByUserId: expect.anything(),
      updatedByUserId: expect.anything(),
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

  it("keeps undeleted property and sibling identities unique while supporting fast tree lookup", () => {
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
      '"rental_properties"."deleted_at" IS NULL',
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
      '"rental_spaces"."parent_id" IS NULL AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_child_name_unique,
      "rental_spaces_active_child_name_unique",
      ["organization_id", "property_id", "parent_id", "name"],
      '"rental_spaces"."parent_id" IS NOT NULL AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_root_code_unique,
      "rental_spaces_active_root_code_unique",
      ["organization_id", "property_id", "code"],
      '"rental_spaces"."parent_id" IS NULL AND "rental_spaces"."code" IS NOT NULL AND "rental_spaces"."deleted_at" IS NULL',
    );
    expectPartialUniqueIndex(
      indexes.rental_spaces_active_child_code_unique,
      "rental_spaces_active_child_code_unique",
      ["organization_id", "property_id", "parent_id", "code"],
      '"rental_spaces"."parent_id" IS NOT NULL AND "rental_spaces"."code" IS NOT NULL AND "rental_spaces"."deleted_at" IS NULL',
    );
    expect(columnNames(indexes.rental_spaces_scope_parent_deleted_sort_idx.config.columns)).toEqual(
      ["organization_id", "property_id", "parent_id", "deleted_at", "sort_order"],
    );
  });
});

describe("rental tenant and contract database schema", () => {
  it("persists masked document numbers alongside their encrypted/hash identity", () => {
    expect(rentalTenants.maskedDocumentNumber).toBeDefined();
    expect(rentalTenants.maskedDocumentNumber.notNull).toBe(false);
    expect(rentalContractPartyPeriods.maskedDocumentNumberSnapshot).toBeDefined();
    expect(rentalContractPartyPeriods.maskedDocumentNumberSnapshot.notNull).toBe(false);

    const dialect = new PgDialect();
    const tenantChecks = Object.fromEntries(
      getTableConfig(rentalTenants).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const partyChecks = Object.fromEntries(
      getTableConfig(rentalContractPartyPeriods).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );

    expect(tenantChecks.rental_tenants_document_fields_check).toContain(
      '"rental_tenants"."masked_document_number"',
    );
    const partySnapshotCheck = partyChecks.rental_contract_party_periods_snapshot_fields_check;
    expect(partySnapshotCheck).toContain(
      '"rental_contract_party_periods"."masked_document_number_snapshot"',
    );
    expect(partySnapshotCheck).toContain(
      '"rental_contract_party_periods"."valid_from" IS NOT NULL',
    );
    expect(partySnapshotCheck).toContain(
      '"rental_contract_party_periods"."tenant_type_snapshot" IS NOT NULL',
    );
    expect(partySnapshotCheck).toContain(
      '"rental_contract_party_periods"."tenant_name_snapshot" IS NOT NULL',
    );
    expect(partySnapshotCheck).not.toContain(
      '"rental_contract_party_periods"."identity_snapshot_ciphertext" IS NOT NULL',
    );
    expect(partySnapshotCheck).not.toContain(
      '"rental_contract_party_periods"."identity_snapshot_key_version" > 0',
    );
  });

  const columnNames = (columns: unknown[]) =>
    columns.map((column) =>
      typeof column === "object" && column !== null && "name" in column ? column.name : undefined,
    );

  it("exports the tenant and contract lifecycle vocabularies", () => {
    expect(rentalTenantType.enumValues).toEqual(["individual", "company"]);
    expect(rentalContractStatus.enumValues).toEqual([
      "draft",
      "confirmed",
      "cancelled",
      "terminated",
    ]);
  });

  it("defines typed append-only contract actions for termination revocations", () => {
    expect(rentalContractActionType.enumValues).toEqual(["termination_revoked"]);
    expect(rentalContractActions).toMatchObject({
      organizationId: expect.anything(),
      contractId: expect.anything(),
      type: expect.anything(),
      reason: expect.anything(),
      terminationDateBeforeRevoke: expect.anything(),
      createdByUserId: expect.anything(),
      createdAt: expect.anything(),
    });

    const config = getTableConfig(rentalContractActions);
    const checks = Object.fromEntries(
      config.checks.map((item) => [item.name, new PgDialect().sqlToQuery(item.value).sql]),
    );
    expect(checks.rental_contract_actions_reason_check).toContain("btrim");
    expect(checks.rental_contract_actions_reason_check).toContain("1000");
    expect(config.indexes.map((item) => item.config.name)).toContain(
      "rental_contract_actions_contract_created_at_idx",
    );
    const scopeReference = config.foreignKeys
      .find((item) => item.getName() === "rental_contract_actions_contract_scope_fk")
      ?.reference();
    expect(columnNames(scopeReference?.columns ?? [])).toEqual(["organization_id", "contract_id"]);
    expect(columnNames(scopeReference?.foreignColumns ?? [])).toEqual(["organization_id", "id"]);
  });

  it("keeps active tenant document hashes uniquely scoped with a generated partial index", () => {
    const dialect = new PgDialect();
    const activeDocumentHash = getTableConfig(rentalTenants).indexes.find(
      (item) => item.config.name === "rental_tenants_active_document_hash_unique",
    );
    if (!activeDocumentHash?.config.where) {
      throw new Error("tenant document hash must use a partial unique index");
    }

    expect(activeDocumentHash.config.unique).toBe(true);
    expect(columnNames(activeDocumentHash.config.columns)).toEqual([
      "organization_id",
      "document_number_lookup_hash",
    ]);
    expect(dialect.sqlToQuery(activeDocumentHash.config.where).sql).toBe(
      '"rental_tenants"."deleted_at" IS NULL AND "rental_tenants"."document_number_lookup_hash" IS NOT NULL',
    );
  });

  it("keeps contract spaces within their organization, contract, and property scopes", () => {
    const spaceReference = getTableConfig(rentalContractSpaces)
      .foreignKeys.find((item) => item.getName() === "rental_contract_spaces_space_scope_fk")
      ?.reference();

    expect(columnNames(spaceReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "space_id",
    ]);
    expect(columnNames(spaceReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "id",
    ]);
    expect(spaceReference?.foreignTable).toBe(rentalSpaces);
  });

  it("gives every tenancy relation child an organization column and exact composite scope foreign keys", () => {
    const relationTables = [
      rentalContractSpaces,
      rentalContractPartyPeriods,
      rentalContractChanges,
      rentalContractActions,
      rentalContractDepositTerms,
    ];
    for (const table of relationTables) {
      expect(table.organizationId.notNull).toBe(true);
    }
    expect(rentalContractNumberCounters.organizationId.notNull).toBe(true);

    const contractForeignKeys = getTableConfig(rentalContracts).foreignKeys;
    const propertyReference = contractForeignKeys
      .find((item) => item.getName() === "rental_contracts_property_scope_fk")
      ?.reference();
    expect(columnNames(propertyReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
    ]);
    expect(columnNames(propertyReference?.foreignColumns ?? [])).toEqual(["organization_id", "id"]);
    expect(propertyReference?.foreignTable).toBe(rentalProperties);

    const renewalReference = contractForeignKeys
      .find((item) => item.getName() === "rental_contracts_renewed_from_scope_fk")
      ?.reference();
    expect(columnNames(renewalReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "renewed_from_contract_id",
    ]);
    expect(columnNames(renewalReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "id",
    ]);
    expect(renewalReference?.foreignTable).toBe(rentalContracts);

    const contractSpaceForeignKeys = getTableConfig(rentalContractSpaces).foreignKeys;
    const contractSpaceReference = contractSpaceForeignKeys
      .find((item) => item.getName() === "rental_contract_spaces_contract_scope_fk")
      ?.reference();
    expect(columnNames(contractSpaceReference?.columns ?? [])).toEqual([
      "organization_id",
      "contract_id",
      "property_id",
    ]);
    expect(columnNames(contractSpaceReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
      "property_id",
    ]);
    expect(contractSpaceReference?.foreignTable).toBe(rentalContracts);

    const spaceScopeReference = contractSpaceForeignKeys
      .find((item) => item.getName() === "rental_contract_spaces_space_scope_fk")
      ?.reference();
    expect(columnNames(spaceScopeReference?.columns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "space_id",
    ]);
    expect(columnNames(spaceScopeReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "property_id",
      "id",
    ]);
    expect(spaceScopeReference?.foreignTable).toBe(rentalSpaces);

    const partyForeignKeys = getTableConfig(rentalContractPartyPeriods).foreignKeys;
    const partyContractReference = partyForeignKeys
      .find((item) => item.getName() === "rental_contract_party_periods_contract_scope_fk")
      ?.reference();
    expect(columnNames(partyContractReference?.columns ?? [])).toEqual([
      "organization_id",
      "contract_id",
    ]);
    expect(columnNames(partyContractReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(partyContractReference?.foreignTable).toBe(rentalContracts);

    const partyTenantReference = partyForeignKeys
      .find((item) => item.getName() === "rental_contract_party_periods_tenant_scope_fk")
      ?.reference();
    expect(columnNames(partyTenantReference?.columns ?? [])).toEqual([
      "organization_id",
      "tenant_id",
    ]);
    expect(columnNames(partyTenantReference?.foreignColumns ?? [])).toEqual([
      "organization_id",
      "id",
    ]);
    expect(partyTenantReference?.foreignTable).toBe(rentalTenants);

    const changeReference = getTableConfig(rentalContractChanges)
      .foreignKeys.find((item) => item.getName() === "rental_contract_changes_contract_scope_fk")
      ?.reference();
    expect(columnNames(changeReference?.columns ?? [])).toEqual(["organization_id", "contract_id"]);
    expect(columnNames(changeReference?.foreignColumns ?? [])).toEqual(["organization_id", "id"]);
    expect(changeReference?.foreignTable).toBe(rentalContracts);

    const depositReference = getTableConfig(rentalContractDepositTerms)
      .foreignKeys.find(
        (item) => item.getName() === "rental_contract_deposit_terms_contract_scope_fk",
      )
      ?.reference();
    expect(columnNames(depositReference?.columns ?? [])).toEqual([
      "organization_id",
      "contract_id",
    ]);
    expect(columnNames(depositReference?.foreignColumns ?? [])).toEqual(["organization_id", "id"]);
    expect(depositReference?.foreignTable).toBe(rentalContracts);
  });

  it("keeps document, snapshot, money, date, payment, and lifecycle checks non-degenerate", () => {
    const dialect = new PgDialect();
    const tenantChecks = Object.fromEntries(
      getTableConfig(rentalTenants).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const spaceChecks = Object.fromEntries(
      getTableConfig(rentalContractSpaces).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const partyChecks = Object.fromEntries(
      getTableConfig(rentalContractPartyPeriods).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const contractChecks = Object.fromEntries(
      getTableConfig(rentalContracts).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );
    const depositChecks = Object.fromEntries(
      getTableConfig(rentalContractDepositTerms).checks.map((item) => [
        item.name,
        dialect.sqlToQuery(item.value).sql,
      ]),
    );

    expect(tenantChecks.rental_tenants_document_type_other_name_check).toBe(
      '("rental_tenants"."document_type" = \'other\' AND "rental_tenants"."document_type_other_name" IS NOT NULL) OR ("rental_tenants"."document_type" IS DISTINCT FROM \'other\' AND "rental_tenants"."document_type_other_name" IS NULL)',
    );
    expect(tenantChecks.rental_tenants_document_fields_check).toBe(
      '("rental_tenants"."document_country_code" IS NULL AND "rental_tenants"."document_type" IS NULL AND "rental_tenants"."document_number_lookup_hash" IS NULL AND "rental_tenants"."masked_document_number" IS NULL) OR ("rental_tenants"."document_country_code" IS NOT NULL AND "rental_tenants"."document_type" IS NOT NULL AND "rental_tenants"."document_number_lookup_hash" IS NOT NULL AND "rental_tenants"."masked_document_number" IS NOT NULL)',
    );
    expect(tenantChecks.rental_tenants_document_country_code_check).toBe(
      '"rental_tenants"."document_country_code" IS NULL OR char_length("rental_tenants"."document_country_code") = 2',
    );
    expect(tenantChecks.rental_tenants_sensitive_identity_key_check).toBe(
      '("rental_tenants"."sensitive_identity_ciphertext" IS NULL AND "rental_tenants"."sensitive_identity_key_version" IS NULL) OR ("rental_tenants"."sensitive_identity_ciphertext" IS NOT NULL AND "rental_tenants"."sensitive_identity_key_version" > 0)',
    );
    expect(tenantChecks.rental_tenants_document_identity_ciphertext_check).toBe(
      '"rental_tenants"."document_number_lookup_hash" IS NULL OR ("rental_tenants"."sensitive_identity_ciphertext" IS NOT NULL AND "rental_tenants"."sensitive_identity_key_version" IS NOT NULL)',
    );
    expect(spaceChecks.rental_contract_spaces_snapshot_fields_check).toBe(
      '("rental_contract_spaces"."space_name_snapshot" IS NULL AND "rental_contract_spaces"."space_code_snapshot" IS NULL AND "rental_contract_spaces"."space_path_snapshot" IS NULL) OR ("rental_contract_spaces"."space_name_snapshot" IS NOT NULL AND "rental_contract_spaces"."space_path_snapshot" IS NOT NULL)',
    );
    expect(partyChecks.rental_contract_party_periods_date_fields_check).toBe(
      '("rental_contract_party_periods"."valid_from" IS NULL AND "rental_contract_party_periods"."valid_to" IS NULL) OR ("rental_contract_party_periods"."valid_from" IS NOT NULL AND "rental_contract_party_periods"."valid_to" IS NOT NULL AND "rental_contract_party_periods"."valid_from" <= "rental_contract_party_periods"."valid_to")',
    );
    expect(partyChecks.rental_contract_party_periods_snapshot_fields_check).toBe(
      '("rental_contract_party_periods"."valid_from" IS NULL AND "rental_contract_party_periods"."valid_to" IS NULL AND "rental_contract_party_periods"."tenant_type_snapshot" IS NULL AND "rental_contract_party_periods"."tenant_name_snapshot" IS NULL AND "rental_contract_party_periods"."phone_snapshot" IS NULL AND "rental_contract_party_periods"."email_snapshot" IS NULL AND "rental_contract_party_periods"."primary_contact_name_snapshot" IS NULL AND "rental_contract_party_periods"."document_country_code_snapshot" IS NULL AND "rental_contract_party_periods"."document_type_snapshot" IS NULL AND "rental_contract_party_periods"."document_type_other_name_snapshot" IS NULL AND "rental_contract_party_periods"."masked_document_number_snapshot" IS NULL AND "rental_contract_party_periods"."identity_snapshot_ciphertext" IS NULL AND "rental_contract_party_periods"."identity_snapshot_key_version" IS NULL) OR ("rental_contract_party_periods"."valid_from" IS NOT NULL AND "rental_contract_party_periods"."valid_to" IS NOT NULL AND "rental_contract_party_periods"."tenant_type_snapshot" IS NOT NULL AND "rental_contract_party_periods"."tenant_name_snapshot" IS NOT NULL)',
    );
    expect(partyChecks.rental_contract_party_periods_document_fields_check).toBe(
      '("rental_contract_party_periods"."document_country_code_snapshot" IS NULL AND "rental_contract_party_periods"."document_type_snapshot" IS NULL AND "rental_contract_party_periods"."masked_document_number_snapshot" IS NULL) OR ("rental_contract_party_periods"."document_country_code_snapshot" IS NOT NULL AND "rental_contract_party_periods"."document_type_snapshot" IS NOT NULL AND "rental_contract_party_periods"."masked_document_number_snapshot" IS NOT NULL)',
    );
    expect(partyChecks.rental_contract_party_periods_document_country_code_check).toBe(
      '"rental_contract_party_periods"."document_country_code_snapshot" IS NULL OR char_length("rental_contract_party_periods"."document_country_code_snapshot") = 2',
    );
    expect(partyChecks.rental_contract_party_periods_document_type_other_name_check).toBe(
      '("rental_contract_party_periods"."document_type_snapshot" = \'other\' AND "rental_contract_party_periods"."document_type_other_name_snapshot" IS NOT NULL) OR ("rental_contract_party_periods"."document_type_snapshot" IS DISTINCT FROM \'other\' AND "rental_contract_party_periods"."document_type_other_name_snapshot" IS NULL)',
    );
    expect(partyChecks.rental_contract_party_periods_identity_snapshot_key_check).toBe(
      '("rental_contract_party_periods"."identity_snapshot_ciphertext" IS NULL AND "rental_contract_party_periods"."identity_snapshot_key_version" IS NULL) OR ("rental_contract_party_periods"."identity_snapshot_ciphertext" IS NOT NULL AND "rental_contract_party_periods"."identity_snapshot_key_version" > 0)',
    );
    expect(contractChecks.rental_contracts_date_order_check).toBe(
      '"rental_contracts"."start_date" IS NULL OR "rental_contracts"."end_date" IS NULL OR "rental_contracts"."start_date" <= "rental_contracts"."end_date"',
    );
    expect(contractChecks.rental_contracts_rent_amount_minor_check).toBe(
      '"rental_contracts"."rent_amount_minor" IS NULL OR ("rental_contracts"."rent_amount_minor" > 0 AND "rental_contracts"."rent_amount_minor" <= 9007199254740991)',
    );
    expect(contractChecks.rental_contracts_payment_interval_months_check).toBe(
      '"rental_contracts"."payment_interval_months" IS NULL OR "rental_contracts"."payment_interval_months" IN (1, 3, 6, 12)',
    );
    expect(contractChecks.rental_contracts_due_days_before_check).toBe(
      '"rental_contracts"."due_days_before" IS NULL OR "rental_contracts"."due_days_before" BETWEEN 0 AND 90',
    );
    expect(contractChecks.rental_contracts_confirmed_core_fields_check).toBe(
      '"rental_contracts"."status" = \'draft\' OR ("rental_contracts"."start_date" IS NOT NULL AND "rental_contracts"."end_date" IS NOT NULL AND "rental_contracts"."rent_amount_minor" IS NOT NULL AND "rental_contracts"."billing_anchor" IS NOT NULL AND "rental_contracts"."payment_interval_months" IS NOT NULL AND "rental_contracts"."due_days_before" IS NOT NULL)',
    );
    expect(contractChecks.rental_contracts_cancellation_status_check).toBe(
      '("rental_contracts"."status" = \'cancelled\') = ("rental_contracts"."cancelled_at" IS NOT NULL)',
    );
    expect(contractChecks.rental_contracts_cancellation_fields_check).toBe(
      '("rental_contracts"."cancelled_at" IS NULL AND "rental_contracts"."cancelled_by_user_id" IS NULL AND "rental_contracts"."cancellation_reason" IS NULL) OR ("rental_contracts"."cancelled_at" IS NOT NULL AND "rental_contracts"."cancelled_by_user_id" IS NOT NULL AND "rental_contracts"."cancellation_reason" IS NOT NULL)',
    );
    expect(contractChecks.rental_contracts_termination_status_check).toBe(
      '("rental_contracts"."status" = \'terminated\') = ("rental_contracts"."termination_date" IS NOT NULL)',
    );
    expect(contractChecks.rental_contracts_termination_fields_check).toBe(
      '("rental_contracts"."termination_date" IS NULL AND "rental_contracts"."termination_recorded_at" IS NULL AND "rental_contracts"."terminated_by_user_id" IS NULL AND "rental_contracts"."termination_reason" IS NULL) OR ("rental_contracts"."termination_date" IS NOT NULL AND "rental_contracts"."termination_recorded_at" IS NOT NULL AND "rental_contracts"."terminated_by_user_id" IS NOT NULL AND "rental_contracts"."termination_reason" IS NOT NULL)',
    );
    expect(contractChecks.rental_contracts_termination_date_check).toBe(
      '"rental_contracts"."termination_date" IS NULL OR ("rental_contracts"."start_date" IS NOT NULL AND "rental_contracts"."end_date" IS NOT NULL AND "rental_contracts"."termination_date" BETWEEN "rental_contracts"."start_date" AND "rental_contracts"."end_date" AND "rental_contracts"."termination_date" < "rental_contracts"."end_date")',
    );
    expect(contractChecks.rental_contracts_only_drafts_soft_delete_check).toBe(
      '"rental_contracts"."deleted_at" IS NULL OR "rental_contracts"."status" = \'draft\'',
    );
    expect(spaceChecks.rental_contract_spaces_rent_allocation_minor_check).toBe(
      '"rental_contract_spaces"."rent_allocation_minor" IS NULL OR ("rental_contract_spaces"."rent_allocation_minor" > 0 AND "rental_contract_spaces"."rent_allocation_minor" <= 9007199254740991)',
    );
    expect(depositChecks.rental_contract_deposit_terms_fixed_amount_minor_check).toBe(
      '"rental_contract_deposit_terms"."fixed_amount_minor" IS NULL OR ("rental_contract_deposit_terms"."fixed_amount_minor" > 0 AND "rental_contract_deposit_terms"."fixed_amount_minor" <= 9007199254740991)',
    );
    expect(depositChecks.rental_contract_deposit_terms_custom_name_check).toBe(
      '("rental_contract_deposit_terms"."type" = \'other\' AND "rental_contract_deposit_terms"."custom_name" IS NOT NULL) OR ("rental_contract_deposit_terms"."type" <> \'other\' AND "rental_contract_deposit_terms"."custom_name" IS NULL)',
    );
    expect(depositChecks.rental_contract_deposit_terms_calculation_mode_check).toBe(
      '("rental_contract_deposit_terms"."calculation_mode" = \'fixed_amount\' AND "rental_contract_deposit_terms"."fixed_amount_minor" IS NOT NULL AND "rental_contract_deposit_terms"."rent_multiple" IS NULL) OR ("rental_contract_deposit_terms"."calculation_mode" = \'rent_multiple\' AND "rental_contract_deposit_terms"."fixed_amount_minor" IS NULL AND "rental_contract_deposit_terms"."rent_multiple" IS NOT NULL)',
    );
    expect(depositChecks.rental_contract_deposit_terms_rent_multiple_check).toBe(
      '"rental_contract_deposit_terms"."rent_multiple" IS NULL OR "rental_contract_deposit_terms"."rent_multiple" > 0',
    );
    expect(depositChecks.rental_contract_deposit_terms_final_amount_minor_check).toBe(
      '"rental_contract_deposit_terms"."final_amount_minor" IS NULL OR ("rental_contract_deposit_terms"."final_amount_minor" > 0 AND "rental_contract_deposit_terms"."final_amount_minor" <= 9007199254740991)',
    );
  });
});

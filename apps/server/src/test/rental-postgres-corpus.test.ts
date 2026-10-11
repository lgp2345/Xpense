import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertRentalTestSchema,
  copyRentalMigrationCorpus,
  rentalTestDatabaseUrl,
} from "./rental-postgres-corpus.js";

describe("真实租赁演练的纯隔离预检", () => {
  it("只接受生成的测试 schema，拒绝共享命名空间", () => {
    for (const name of [
      "public",
      "drizzle",
      "rental_finance_test_abc",
      'rental_finance_test_";DROP SCHEMA public',
    ]) {
      expect(() => assertRentalTestSchema(name)).toThrow();
    }
    expect(() => assertRentalTestSchema(`rental_finance_test_${"a".repeat(32)}`)).not.toThrow();
  });
  it("配置连接不等于隔离DDL许可，专用URL优先默认库", () => {
    expect(rentalTestDatabaseUrl({ DATABASE_URL: "postgres://localhost/unused" })).toBeNull();
    expect(
      rentalTestDatabaseUrl({ RENTAL_MIGRATION_TEST_DATABASE_URL: "postgres://localhost/unused" }),
    ).toBeNull();
    const env = {
      RENTAL_MIGRATION_TEST_DATABASE_URL: "postgres://localhost/unused",
      RENTAL_FINANCE_TEST_DDL_APPROVED: "isolated-schema",
    };
    expect(rentalTestDatabaseUrl(env)).toBe("postgres://localhost/unused");
    for (const key of ["search_path", "options", "application_name", "lock_timeout"]) {
      expect(() =>
        rentalTestDatabaseUrl({
          ...env,
          RENTAL_MIGRATION_TEST_DATABASE_URL: `postgres://localhost/unused?${key}=public`,
        }),
      ).toThrow("连接参数覆盖");
    }
  });
  it("复制完整20段和旧11段，唯一改写可逆且保留真实 runner 排序", async () => {
    const schema = `rental_finance_test_${"b".repeat(32)}`;
    const corpus = await copyRentalMigrationCorpus(schema);
    expect(corpus.entries).toHaveLength(20);
    expect(corpus.entries.at(14)?.name).toBe("20261002133352_rental_charge_collection");
    expect(corpus.entries.at(15)?.name).toBe("20261005104010_contract_local_datetime");
    expect(
      corpus.entries.filter((entry) => entry.name <= "20260928035119_rental_billing_scope"),
    ).toHaveLength(11);
    for (const entry of corpus.entries) {
      const original = await readFile(entry.originalPath, "utf8");
      const copied = await readFile(`${corpus.folder}/${entry.name}/migration.sql`, "utf8");
      if (entry.name === "20260704154322_pink_sauron") {
        expect(copied.split(`"${schema}".`)).toHaveLength(18);
        expect(copied.replaceAll(`"${schema}".`, '"public".')).toBe(original);
        expect(entry.originalHash).not.toBe(entry.copiedHash);
      } else expect(copied).toBe(original);
    }
  });
});

it("空专用URL回退同一.env默认URL，但仍必须隔离DDL许可且只接受本地目标", () => {
  const local = "postgres://localhost/xpense_test";
  expect(
    rentalTestDatabaseUrl({
      DATABASE_URL: local,
      RENTAL_MIGRATION_TEST_DATABASE_URL: "",
      RENTAL_FINANCE_TEST_DDL_APPROVED: "isolated-schema",
    }),
  ).toBe(local);
  expect(rentalTestDatabaseUrl({ DATABASE_URL: local })).toBeNull();
  expect(() =>
    rentalTestDatabaseUrl({
      DATABASE_URL: "postgres://example.test/dev",
      RENTAL_FINANCE_TEST_DDL_APPROVED: "isolated-schema",
    }),
  ).toThrow(/本地/);
});

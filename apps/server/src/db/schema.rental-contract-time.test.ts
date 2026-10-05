import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { normalizeStoredContractTime } from "../modules/rental/contract-time.rules.js";

const migrationContents = readFileSync(
  new URL("./migrations/20261005104010_contract_local_datetime/migration.sql", import.meta.url),
  "utf8",
);
const migrationSql = migrationContents.replace(/\s+/g, " ");
const schemaSnapshot = JSON.parse(
  readFileSync(
    new URL("./migrations/20261005104010_contract_local_datetime/snapshot.json", import.meta.url),
    "utf8",
  ),
) as {
  ddl: Array<{
    type?: string;
    notNull?: boolean;
    value?: string;
    name: string;
    entityType: string;
    table?: string;
  }>;
};

describe("rental contract local datetime migration", () => {
  it("converts legacy start and end dates to their contract time boundaries", () => {
    const dropConstraint = migrationSql.indexOf(
      'DROP CONSTRAINT "rental_contracts_termination_date_check"',
    );
    const startConversion = migrationSql.indexOf('ALTER COLUMN "start_date"');
    const endConversion = migrationSql.indexOf('ALTER COLUMN "end_date"');
    const addConstraint = migrationSql.lastIndexOf(
      'ADD CONSTRAINT "rental_contracts_termination_date_check"',
    );

    expect(dropConstraint).toBeGreaterThanOrEqual(0);
    expect(dropConstraint).toBeLessThan(startConversion);
    expect(startConversion).toBeLessThan(endConversion);
    expect(endConversion).toBeLessThan(addConstraint);
    expect(migrationSql).toContain(
      '"start_date" SET DATA TYPE timestamp(0) without time zone USING "start_date"::timestamp(0) without time zone',
    );
    expect(migrationSql).toContain('WHEN "end_date" IS NULL THEN NULL');
    expect(migrationSql).toContain(
      "\"end_date\"::timestamp(0) without time zone + INTERVAL '23:59:59'",
    );
  });

  it("keeps termination checks exclusive of the scheduled end calendar day", () => {
    expect(migrationSql).toContain(
      '"termination_date" >= "start_date"::date AND "termination_date" < "end_date"::date',
    );
  });

  it("keeps nullable second-precision timestamps and the start-before-end constraint in its snapshot", () => {
    const columns = schemaSnapshot.ddl.filter(
      (entry) => entry.entityType === "columns" && entry.table === "rental_contracts",
    );
    for (const columnName of ["start_date", "end_date"]) {
      expect(columns.find((column) => column.name === columnName)).toMatchObject({
        type: "timestamp(0)",
        notNull: false,
      });
    }

    expect(
      schemaSnapshot.ddl.find(
        (entry) =>
          entry.entityType === "checks" && entry.name === "rental_contracts_date_order_check",
      )?.value,
    ).toBe('"start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date"');
  });

  it("rehearses the date conversion and constraints in an isolated PostgreSQL schema", async (context) => {
    const databaseUrl = process.env.RENTAL_MIGRATION_TEST_DATABASE_URL;
    if (!databaseUrl) {
      context.skip(
        "RENTAL_MIGRATION_TEST_DATABASE_URL is not configured; skipped disposable PostgreSQL rehearsal",
      );
      return;
    }

    const client = postgres(databaseUrl, { max: 1, prepare: false });
    const schema = `rental_contract_time_${randomUUID().replaceAll("-", "")}`;
    let schemaCreated = false;
    try {
      await client`CREATE SCHEMA ${client(schema)}`;
      schemaCreated = true;
      await client`SET search_path TO ${client(schema)}, pg_catalog`;
      await client.unsafe(`
        CREATE TABLE "rental_contracts" (
          "id" integer PRIMARY KEY,
          "start_date" date,
          "end_date" date,
          "termination_date" date,
          CONSTRAINT "rental_contracts_date_order_check" CHECK (
            "start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date"
          ),
          CONSTRAINT "rental_contracts_termination_date_check" CHECK (
            "termination_date" IS NULL OR (
              "start_date" IS NOT NULL AND "end_date" IS NOT NULL
              AND "termination_date" BETWEEN "start_date" AND "end_date"
              AND "termination_date" < "end_date"
            )
          )
        )
      `);
      await client`
        INSERT INTO "rental_contracts" ("id", "start_date", "end_date", "termination_date")
        VALUES
          (1, '2026-10-05', '2026-11-04', NULL),
          (2, NULL, NULL, NULL),
          (3, '2026-10-05', '2026-10-20', '2026-10-05')
      `;

      const migrationStatements = migrationContents
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of migrationStatements) await client.unsafe(statement);

      const rows = await client<
        {
          id: number;
          start_date: string | null;
          end_date: string | null;
          termination_date: string | null;
        }[]
      >`
        SELECT "id",
          to_char("start_date", 'YYYY-MM-DD HH24:MI:SS') AS "start_date",
          to_char("end_date", 'YYYY-MM-DD HH24:MI:SS') AS "end_date",
          to_char("termination_date", 'YYYY-MM-DD') AS "termination_date"
        FROM "rental_contracts"
        ORDER BY "id"
      `;
      const legacyRow = rows.find((row) => row.id === 1);
      const nullRow = rows.find((row) => row.id === 2);
      const sameDayTerminationRow = rows.find((row) => row.id === 3);

      expect(normalizeStoredContractTime(legacyRow?.start_date ?? null, "start")).toBe(
        "2026-10-05T00:00:00",
      );
      expect(normalizeStoredContractTime(legacyRow?.end_date ?? null, "end")).toBe(
        "2026-11-04T23:59:59",
      );
      expect(nullRow?.start_date).toBeNull();
      expect(nullRow?.end_date).toBeNull();
      expect(sameDayTerminationRow?.termination_date).toBe("2026-10-05");

      await client`
        UPDATE "rental_contracts"
        SET "start_date" = timestamp '2026-10-05 15:00:00'
        WHERE "id" = 3
      `;
      const [sameDayStartRow] = await client<{ start_date: string }[]>`
        SELECT to_char("start_date", 'YYYY-MM-DD HH24:MI:SS') AS "start_date"
        FROM "rental_contracts"
        WHERE "id" = 3
      `;
      expect(normalizeStoredContractTime(sameDayStartRow?.start_date ?? null, "start")).toBe(
        "2026-10-05T15:00:00",
      );

      await client`
        UPDATE "rental_contracts"
        SET "start_date" = timestamp '2026-10-05 14:15:16'
        WHERE "id" = 1
      `;
      const [writtenRow] = await client<{ start_date: string }[]>`
        SELECT to_char("start_date", 'YYYY-MM-DD HH24:MI:SS') AS "start_date"
        FROM "rental_contracts"
        WHERE "id" = 1
      `;
      expect(normalizeStoredContractTime(writtenRow?.start_date ?? null, "start")).toBe(
        "2026-10-05T14:15:16",
      );

      await expect(
        client`
          INSERT INTO "rental_contracts" ("id", "start_date", "end_date")
          VALUES (4, '2026-10-06', '2026-10-05')
        `,
      ).rejects.toThrow();
      await expect(
        client`
          INSERT INTO "rental_contracts" ("id", "start_date", "end_date", "termination_date")
          VALUES (5, '2026-10-05', '2026-11-04', '2026-10-04')
        `,
      ).rejects.toThrow();
      await expect(
        client`
          INSERT INTO "rental_contracts" ("id", "start_date", "end_date", "termination_date")
          VALUES (6, '2026-10-05', '2026-11-04', '2026-11-04')
        `,
      ).rejects.toThrow();
    } finally {
      try {
        if (schemaCreated) await client`DROP SCHEMA ${client(schema)} CASCADE`;
      } finally {
        await client.end();
      }
    }
  });
});

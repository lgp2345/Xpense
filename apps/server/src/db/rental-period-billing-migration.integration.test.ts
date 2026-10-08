import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("账期账单存储迁移", () => {
  it("新库从完整历史链到达账期模型，同日读数不再日期唯一", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, applyMigrations }) => {
      await applyMigrations();
      const columns =
        await client`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='rental_bills'`;
      expect(columns.map((row) => row.column_name)).toContain("period_start");
      expect(columns.map((row) => row.column_name)).not.toContain("billing_month");
      expect(columns.map((row) => row.column_name)).not.toContain("model_version");
      const constraints =
        await client`SELECT conname FROM pg_constraint WHERE conrelid='rental_meter_readings'::regclass`;
      expect(constraints.map((row) => row.conname)).not.toContain(
        "rental_meter_readings_date_unique",
      );
      expect(constraints.map((row) => row.conname)).toContain(
        "rental_meter_readings_predecessor_scope_kind_fk",
      );
      const indexes =
        await client`SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename='rental_bills'`;
      expect(
        indexes.some(
          (row) => row.indexdef.includes("period_start") && row.indexdef.includes("active"),
        ),
      ).toBe(true);
    });
  });
});

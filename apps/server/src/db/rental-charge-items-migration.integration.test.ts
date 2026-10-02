import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("收费代收字段兼容迁移", () => {
  it("旧行双代收且金额及旧 JSON 不变，新行可独立禁用", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ db, client, applyMigrations }) => {
      await applyMigrations("20261001131738_rental_monthly_permissions");
      const fixture = await insertRentalPostgresFixture(db);
      const fees = [{ id: randomUUID(), name: "管理费", monthlyAmountMinor: 5000 }];
      await client`INSERT INTO rental_charge_terms (organization_id, contract_id, water_unit_price, electricity_unit_price, fixed_fees, updated_by_user_id)
        VALUES (${fixture.auth.organizationId}, ${fixture.scope.contractId}, '3.0000', '0.5000', ${client.json(fees)}, ${fixture.auth.userId})`;
      await client`INSERT INTO rental_charge_term_revisions (organization_id, contract_id, version, terms_snapshot, reason, created_by_user_id)
        VALUES (${fixture.auth.organizationId}, ${fixture.scope.contractId}, 1, ${client.json({ waterUnitPrice: "3.0000", electricityUnitPrice: "0.5000", fixedFees: fees })}, '旧标准', ${fixture.auth.userId})`;
      await applyMigrations();
      const [terms] =
        await client`SELECT * FROM rental_charge_terms WHERE contract_id = ${fixture.scope.contractId}`;
      expect(terms).toMatchObject({
        water_collection_enabled: true,
        electricity_collection_enabled: true,
        water_unit_price: "3.0000",
        electricity_unit_price: "0.5000",
        fixed_fees: fees,
      });
      const [revision] =
        await client`SELECT terms_snapshot FROM rental_charge_term_revisions WHERE contract_id = ${fixture.scope.contractId}`;
      expect(revision?.terms_snapshot).toEqual({
        waterUnitPrice: "3.0000",
        electricityUnitPrice: "0.5000",
        fixedFees: fees,
      });
      await client`UPDATE rental_charge_terms SET water_collection_enabled = false WHERE contract_id = ${fixture.scope.contractId}`;
      const [changed] =
        await client`SELECT water_collection_enabled, electricity_collection_enabled FROM rental_charge_terms WHERE contract_id = ${fixture.scope.contractId}`;
      expect(changed).toEqual({
        water_collection_enabled: false,
        electricity_collection_enabled: true,
      });
    });
  });
});

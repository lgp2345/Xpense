import { describe, expect, it } from "vitest";
import { BillsRepository } from "../modules/rental/bills.repository.js";
import { BillsReadService } from "../modules/rental/bills-read.service.js";
import { RentalCashProjectionRepository } from "../modules/rental/rental-cash-projection.repository.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("真实历史币种分组", () => {
  it("keeps CNY snapshots in a USD organization and separates complete-filter totals across pages", async () => {
    if (!url) throw Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const fixture = await insertRentalPostgresFixture(pg.db);
      await pg.client`UPDATE organizations SET base_currency='USD' WHERE id=${fixture.organizationId}`;
      await pg.client`UPDATE rental_bills SET currency_code='USD' WHERE id=${fixture.ids.february}`;
      const service = new BillsReadService(
        new BillsRepository(pg.db),
        new RentalCashProjectionRepository(),
        {} as never,
        { lockOrganizationContext: async () => ({ today: "2026-03-01" }) } as never,
        { assertPermission: () => {} } as never,
        new DatabaseTransactionService(pg.db),
      );
      const result = await service.list(fixture.auth, { status: "active", page: 1, pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.totals.financial).toBeUndefined();
      expect(result.totals.rentAmountMinor).toBeUndefined();
      expect(
        result.totals.byCurrency?.map((total) => [
          total.currencyCode,
          total.periodAmountMinor,
          total.depositAmountMinor,
          total.financial?.outstandingMinor,
        ]),
      ).toEqual([
        ["CNY", 11000, 5000, 16000],
        ["USD", 12000, 0, 12000],
      ]);
      expect(
        await pg.client`SELECT currency_code FROM rental_bills WHERE id=${fixture.ids.january}`,
      ).toEqual([{ currency_code: "CNY" }]);
    });
  });
});

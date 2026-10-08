import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { ContractRelationsRepository } from "../modules/rental/contract-relations.repository.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);
it.skipIf(!url)(
  "有真实底数与所属读数时，同空间更正保留关联ID及外键",
  async () => {
    if (!url) throw new Error("隔离库未配置");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const f = await insertRentalPostgresFixture(pg.db);
      const before = await pg.db
        .select()
        .from(tables.rentalContractSpaces)
        .where(eq(tables.rentalContractSpaces.contractId, f.scope.contractId));
      const readings = await pg.db.select().from(tables.rentalMeterReadings);
      await pg.db.transaction(async (tx) => {
        await new ContractRelationsRepository().replaceDraftSpaces(
          {
            ...f.scope,
            propertyId: f.propertyId,
            spaces: [{ spaceId: f.spaceId, rentAllocationMinor: 10000 }],
          },
          tx,
        );
        await tx
          .update(tables.rentalContracts)
          .set({ rentAmountMinor: 20000 })
          .where(eq(tables.rentalContracts.id, f.scope.contractId));
      });
      const after = await pg.db
        .select()
        .from(tables.rentalContractSpaces)
        .where(eq(tables.rentalContractSpaces.contractId, f.scope.contractId));
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(before[0]?.id);
      expect(after[0]?.rentAllocationMinor).toBe(10000);
      expect(await pg.db.select().from(tables.rentalMeterReadings)).toEqual(readings);
    });
  },
  120000,
);

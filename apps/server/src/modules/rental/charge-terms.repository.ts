import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalChargeTermRevisions, rentalChargeTerms } from "../../db/schema.js";
import type {
  ChargeTermsActor,
  ChargeTermsRecord,
  ChargeTermsWriteInput,
} from "./charge-terms.repository.types.js";

export type {
  ChargeTermsRecord,
  ChargeTermsRevisionRecord,
  ChargeTermsWriteInput,
} from "./charge-terms.repository.types.js";

/** 合同非租金收费标准与不可变价格版本的持久化。 */
@Injectable()
export class ChargeTermsRepository {
  async find(
    scope: { organizationId: string; contractId: string },
    executor: AppDbExecutor,
  ): Promise<ChargeTermsRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalChargeTerms)
      .where(
        and(
          eq(rentalChargeTerms.organizationId, scope.organizationId),
          eq(rentalChargeTerms.contractId, scope.contractId),
        ),
      );
    return record ?? null;
  }

  async save(
    scope: { organizationId: string; contractId: string },
    terms: ChargeTermsWriteInput,
    reason: string,
    actor: ChargeTermsActor,
    executor: AppDbExecutor,
  ): Promise<ChargeTermsRecord> {
    const [record] = await executor
      .insert(rentalChargeTerms)
      .values({
        ...scope,
        version: 1,
        ...terms,
        updatedByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: [rentalChargeTerms.organizationId, rentalChargeTerms.contractId],
        set: {
          waterCollectionEnabled: terms.waterCollectionEnabled,
          electricityCollectionEnabled: terms.electricityCollectionEnabled,
          waterUnitPrice: terms.waterUnitPrice,
          electricityUnitPrice: terms.electricityUnitPrice,
          fixedFees: terms.fixedFees,
          version: sql`${rentalChargeTerms.version} + 1`,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!record) throw new Error("Failed to save rental charge terms");

    await executor.insert(rentalChargeTermRevisions).values({
      ...scope,
      version: record.version,
      termsSnapshot: {
        waterCollectionEnabled: record.waterCollectionEnabled,
        electricityCollectionEnabled: record.electricityCollectionEnabled,
        waterUnitPrice: record.waterUnitPrice,
        electricityUnitPrice: record.electricityUnitPrice,
        fixedFees: record.fixedFees,
      },
      reason,
      createdByUserId: actor.userId,
    });
    return record;
  }
}

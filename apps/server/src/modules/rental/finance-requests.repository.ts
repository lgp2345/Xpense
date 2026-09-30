import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalFinanceRequests } from "../../db/schema.js";
import type {
  CompleteFinanceRequestInput,
  FinanceRequestActor,
  FinanceRequestRecord,
} from "./finance-requests.repository.types.js";

export type {
  CompleteFinanceRequestInput,
  FinanceRequestActor,
  FinanceRequestRecord,
} from "./finance-requests.repository.types.js";

type FinanceScope = { organizationId: string; contractId: string };

/** 幂等请求以组织和 key 唯一；跨合同或动作的冲突留给 service 转为 409。 */
@Injectable()
export class FinanceRequestsRepository {
  async find(
    scope: FinanceScope,
    idempotencyKey: string,
    executor: AppDbExecutor,
  ): Promise<FinanceRequestRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalFinanceRequests)
      .where(
        and(
          eq(rentalFinanceRequests.organizationId, scope.organizationId),
          eq(rentalFinanceRequests.idempotencyKey, idempotencyKey),
        ),
      );
    return record ?? null;
  }

  async complete(
    scope: FinanceScope,
    input: CompleteFinanceRequestInput,
    actor: FinanceRequestActor,
    executor: AppDbExecutor,
  ): Promise<FinanceRequestRecord> {
    const [record] = await executor
      .insert(rentalFinanceRequests)
      .values({ ...scope, ...input, createdByUserId: actor.userId })
      .returning();
    if (!record) throw new Error("Failed to save completed rental finance request");
    return record;
  }
}

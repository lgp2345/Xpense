import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalContractPartyPeriods, rentalContracts } from "../../db/schema.js";
import { contractPartySensitiveSnapshotFields } from "./contracts.repository.select-fields.js";
import type { FindContractPartySensitiveSnapshotInput } from "./contracts.repository.types.js";

type ContractPartySensitiveSelectExecutor = Pick<AppDbExecutor, "select">;

/** 构建仅访问合同历史身份快照、而不回读当前租户主档的受控查询。 */
export function buildContractPartySensitiveSnapshotQuery(
  executor: ContractPartySensitiveSelectExecutor,
  input: FindContractPartySensitiveSnapshotInput,
) {
  return executor
    .select(contractPartySensitiveSnapshotFields)
    .from(rentalContractPartyPeriods)
    .innerJoin(
      rentalContracts,
      and(
        eq(rentalContracts.organizationId, rentalContractPartyPeriods.organizationId),
        eq(rentalContracts.id, rentalContractPartyPeriods.contractId),
      ),
    )
    .where(
      and(
        eq(rentalContractPartyPeriods.organizationId, input.organizationId),
        eq(rentalContractPartyPeriods.contractId, input.contractId),
        eq(rentalContractPartyPeriods.tenantId, input.tenantId),
        eq(rentalContractPartyPeriods.validFrom, input.validFrom),
        isNotNull(rentalContractPartyPeriods.identitySnapshotCiphertext),
        isNotNull(rentalContractPartyPeriods.identitySnapshotKeyVersion),
        eq(rentalContracts.organizationId, input.organizationId),
        eq(rentalContracts.id, input.contractId),
        isNull(rentalContracts.deletedAt),
      ),
    )
    .limit(1);
}

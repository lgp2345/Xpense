import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalContracts, rentalSpaces } from "../../db/schema.js";
import { contractDisplayStatusExpression } from "./contracts.repository.select-fields.js";
import type { PropertyBillingScanInput } from "./property-billing.repository.types.js";
export function scanPropertyContracts(input: PropertyBillingScanInput, tx: AppDbExecutor) {
  return tx
    .select({
      id: rentalContracts.id,
      contractNumber: rentalContracts.contractNumber,
      lifecycleStatus: rentalContracts.status,
      displayStatus: contractDisplayStatusExpression(input.now),
      startDate: rentalContracts.startDate,
      endDate: rentalContracts.endDate,
      rentAmountMinor: rentalContracts.rentAmountMinor,
      billingAnchor: rentalContracts.billingAnchor,
      paymentIntervalMonths: rentalContracts.paymentIntervalMonths,
      dueDaysBefore: rentalContracts.dueDaysBefore,
      terminationDate: rentalContracts.terminationDate,
      cancelledAt: rentalContracts.cancelledAt,
    })
    .from(rentalContracts)
    .where(
      and(
        eq(rentalContracts.organizationId, input.organizationId),
        eq(rentalContracts.propertyId, input.propertyId),
        isNull(rentalContracts.deletedAt),
        input.afterContractId ? gt(rentalContracts.id, input.afterContractId) : undefined,
      ),
    )
    .orderBy(asc(rentalContracts.id))
    .limit(input.pageSize + 1);
}
/** 沿本批空间向上读取真实祖先；UNION 去重使异常环也有界，始终限定房产与组织。 */
export async function readPropertyAncestors(
  input: PropertyBillingScanInput,
  spaceIds: string[],
  tx: AppDbExecutor,
) {
  if (!spaceIds.length) return [];
  return tx.execute<{ id: string; parentId: string | null; name: string; sortOrder: number }>(sql`
 WITH RECURSIVE ancestors AS (
 SELECT id, parent_id, name, sort_order FROM ${rentalSpaces}
 WHERE organization_id=${input.organizationId} AND property_id=${input.propertyId} AND deleted_at IS NULL AND ${inArray(rentalSpaces.id, spaceIds)}
 UNION
 SELECT parent.id,parent.parent_id,parent.name,parent.sort_order FROM ${rentalSpaces} parent
 JOIN ancestors child ON child.parent_id=parent.id
 WHERE parent.organization_id=${input.organizationId} AND parent.property_id=${input.propertyId} AND parent.deleted_at IS NULL
 ) SELECT id, parent_id AS "parentId", name, sort_order AS "sortOrder" FROM ancestors`);
}

import type {
  RentalBillingSpacePathNode,
  RentalBillSnapshot,
  RentalBillSummary,
  RentalPropertyUnpaidBill,
} from "@xpense/shared";
import { withBillFinancial } from "./bills.queries.js";
import { organizationDateTime } from "./contract-time.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

type PropertyBillingBill = Omit<RentalBillSummary, "createdAt" | "dueState"> & {
  createdAt: Date;
  snapshot: RentalBillSnapshot;
};

type PropertyBillingSpaceRelation = {
  contractId: string;
  spaceId: string;
  deletedAt: Date | null;
  parentId: string | null;
  name: string;
  sortOrder: number;
  spaceNameSnapshot: string | null;
  spacePathSnapshot: unknown;
};

type PropertyBillingTenantPeriod = {
  contractId: string;
  name: string | null;
  validFrom: string | null;
  validTo: string | null;
};

type PropertyBillingSpaceNode = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
};

export function toPropertyBillingUnpaidBills(input: {
  organizationId: string;
  timezone: string;
  now: string;
  bills: PropertyBillingBill[];
  spaces: PropertyBillingSpaceRelation[];
  parties: PropertyBillingTenantPeriod[];
  nodes: Map<string, PropertyBillingSpaceNode>;
  factsByContract: Map<string, RentalCashProjectionFacts>;
}): RentalPropertyUnpaidBill[] {
  const today = input.now.slice(0, 10);
  const unpaidBills: RentalPropertyUnpaidBill[] = [];
  const spacesByContract = groupBy(input.spaces, (space) => space.contractId);
  const partiesByContract = groupBy(input.parties, (party) => party.contractId);
  for (const bill of input.bills) {
    const contractFacts = input.factsByContract.get(bill.contractId);
    if (!contractFacts) throw new Error("Rental bill finance facts could not be loaded");
    const summary: RentalBillSummary = {
      id: bill.id,
      billNumber: bill.billNumber,
      contractId: bill.contractId,
      contractNumber: bill.contractNumber,
      propertyId: bill.propertyId,
      propertyName: bill.propertyName,
      currencyCode: bill.currencyCode,
      type: bill.type,
      status: bill.status,
      sourceKey: bill.sourceKey,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      effectiveEnd: bill.effectiveEnd,
      dueDate: bill.dueDate,
      amountMinor: bill.amountMinor,
      dueState:
        bill.dueDate < today ? "date_passed" : bill.dueDate === today ? "due_today" : "upcoming",
      createdAt: bill.createdAt.toISOString(),
      revision: bill.revision,
    };
    const financialBill = withBillFinancial(summary, contractFacts, today, input.organizationId);
    if (
      financialBill.settlementId ||
      !financialBill.financial ||
      financialBill.financial.outstandingMinor <= 0
    )
      continue;

    const contractSpaces = spacesByContract.get(bill.contractId) ?? [];
    const snapshotSpace = bill.snapshot.spaces.find((space) => space.spaceId) ?? null;
    const relationSpace =
      contractSpaces.find((space) => space.spaceId === snapshotSpace?.spaceId) ??
      [...contractSpaces].sort((left, right) => left.spaceId.localeCompare(right.spaceId))[0] ??
      null;
    const spaceId = snapshotSpace?.spaceId ?? relationSpace?.spaceId;
    if (!spaceId) continue;

    unpaidBills.push({
      bill: financialBill,
      spaceId,
      path: propertyBillingBillPath(snapshotSpace, relationSpace, input.nodes),
      tenantNames: propertyBillingBillTenantNames(
        bill,
        partiesByContract.get(bill.contractId) ?? [],
        input.timezone,
      ),
    });
  }
  return unpaidBills;
}

function groupBy<T, K>(values: T[], key: (value: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = grouped.get(groupKey);
    if (group) group.push(value);
    else grouped.set(groupKey, [value]);
  }
  return grouped;
}

function propertyBillingBillPath(
  snapshotSpace: RentalBillSnapshot["spaces"][number] | null,
  relationSpace: PropertyBillingSpaceRelation | null | undefined,
  nodes: Map<string, PropertyBillingSpaceNode>,
): RentalBillingSpacePathNode[] {
  const spaceId = snapshotSpace?.spaceId ?? relationSpace?.spaceId ?? "";
  const relationPath = [];
  const visited = new Set<string>();
  let node = nodes.get(spaceId);
  while (node) {
    if (visited.has(node.id)) throw new Error("空间祖先路径存在循环");
    visited.add(node.id);
    relationPath.unshift(node);
    if (node.parentId === null) break;
    node = nodes.get(node.parentId);
  }
  if (relationPath.length && relationPath[0]?.parentId === null) return relationPath;

  const pathSnapshot = snapshotSpace?.spacePath ?? [];
  if (pathSnapshot.length) {
    const snapshotSpaceId = snapshotSpace?.spaceId;
    const path = pathSnapshot.map((node, index) => ({
      ...node,
      parentId: index === 0 ? null : (pathSnapshot[index - 1]?.id ?? null),
      sortOrder: 0,
    }));
    const leaf = path.at(-1);
    if (snapshotSpaceId && leaf?.id !== snapshotSpaceId) {
      path.push({
        id: snapshotSpaceId,
        parentId: leaf?.id ?? null,
        name: snapshotSpace?.spaceName ?? "",
        sortOrder: 0,
      });
    }
    return path;
  }

  const relationSnapshot =
    relationSpace?.spaceId === spaceId
      ? (relationSpace.spacePathSnapshot as Array<{ id: string; name: string }> | null)
      : null;
  if (relationSnapshot?.length) {
    return relationSnapshot.map((node, index) => ({
      ...node,
      parentId: index === 0 ? null : (relationSnapshot[index - 1]?.id ?? null),
      sortOrder: 0,
    }));
  }
  if (snapshotSpace?.spaceId) {
    return [
      {
        id: snapshotSpace.spaceId,
        parentId: null,
        name: snapshotSpace.spaceName ?? "",
        sortOrder: 0,
      },
    ];
  }
  if (!relationSpace) return [];
  return [
    {
      id: relationSpace.spaceId,
      parentId: null,
      name: relationSpace.spaceNameSnapshot ?? relationSpace.name,
      sortOrder: relationSpace.sortOrder,
    },
  ];
}

function propertyBillingBillTenantNames(
  bill: Pick<PropertyBillingBill, "snapshot" | "periodStart" | "periodEnd" | "createdAt">,
  tenantPeriods: Array<Pick<PropertyBillingTenantPeriod, "name" | "validFrom" | "validTo">>,
  timezone: string,
): string[] {
  const snapshotNames = bill.snapshot.parties.map((party) => party.name.trim()).filter(Boolean);
  if (snapshotNames.length) return [...new Set(snapshotNames)];

  const createdOn = organizationDateTime(bill.createdAt, timezone).slice(0, 10);
  return [
    ...new Set(
      tenantPeriods.flatMap((party) => {
        if (!party.name || !party.validFrom || !party.validTo) return [];
        const matchesPeriod =
          bill.periodStart !== null &&
          bill.periodEnd !== null &&
          party.validFrom <= bill.periodEnd &&
          party.validTo >= bill.periodStart;
        const matchesDeposit =
          bill.periodStart === null && party.validFrom <= createdOn && party.validTo >= createdOn;
        return matchesPeriod || matchesDeposit ? [party.name] : [];
      }),
    ),
  ];
}

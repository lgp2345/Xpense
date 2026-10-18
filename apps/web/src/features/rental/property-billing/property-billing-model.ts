import type {
  RentalBillDetail,
  RentalBillingSpacePathNode,
  RentalPropertyBillingCandidate,
} from "@xpense/shared";
import { differenceInCalendarDays, parseISO } from "date-fns";
export type CompletedPropertyBill = {
  candidate: RentalPropertyBillingCandidate;
  bill: RentalBillDetail;
};
export type PropertyBillingRow = {
  candidate: RentalPropertyBillingCandidate;
  bill?: RentalBillDetail;
};
export type PropertyBillingNode = {
  space: RentalBillingSpacePathNode;
  children: PropertyBillingNode[];
  rows: PropertyBillingRow[];
};
export function displayBillingDayDistance(today: string, periodStart: string): number {
  return differenceInCalendarDays(parseISO(periodStart), parseISO(today));
}
export const propertyBillingIdentity = (candidate: RentalPropertyBillingCandidate) =>
  `${candidate.contractId}:${candidate.period.periodStart}:${candidate.period.periodEnd}`;
/** 完成项优先；同空间保留独立合同，节点只由实际候选及完成项的路径建立。 */
export function buildPropertyBillingTree(
  candidates: RentalPropertyBillingCandidate[],
  completed: CompletedPropertyBill[],
): PropertyBillingNode[] {
  const completedContracts = new Set(completed.map((c) => c.candidate.contractId));
  const rows: PropertyBillingRow[] = [
    ...candidates
      .filter((c) => !completedContracts.has(c.contractId))
      .map((candidate) => ({ candidate })),
    ...completed.map(({ candidate, bill }) => ({
      candidate: {
        ...candidate,
        period: { periodStart: bill.periodStart!, periodEnd: bill.periodEnd! },
      },
      bill,
    })),
  ];
  const nodes = new Map<string, PropertyBillingNode>();
  const seenRows = new Set<string>();
  for (const row of rows) {
    for (const space of row.candidate.path)
      if (!nodes.has(space.id)) nodes.set(space.id, { space, children: [], rows: [] });
    const identity = propertyBillingIdentity(row.candidate);
    if (!seenRows.has(identity)) {
      nodes.get(row.candidate.spaceId)?.rows.push(row);
      seenRows.add(identity);
    }
  }
  const roots: PropertyBillingNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.space.parentId ? nodes.get(node.space.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: PropertyBillingNode[]) => {
    list.sort(
      (a, b) => a.space.sortOrder - b.space.sortOrder || a.space.id.localeCompare(b.space.id),
    );
    for (const node of list) {
      node.rows.sort((a, b) => a.candidate.contractId.localeCompare(b.candidate.contractId));
      sort(node.children);
    }
  };
  sort(roots);
  return roots;
}

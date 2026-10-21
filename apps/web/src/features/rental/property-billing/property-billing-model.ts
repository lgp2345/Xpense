import type {
  RentalBillDetail,
  RentalBillingSpacePathNode,
  RentalPropertyBillingCandidate,
  RentalPropertyUnpaidBill,
} from "@xpense/shared";
import { differenceInCalendarDays, parseISO } from "date-fns";

export type CompletedPropertyBill = {
  candidate: RentalPropertyBillingCandidate;
  bill: RentalBillDetail;
};
export type PropertyBillingRow =
  | { kind: "candidate"; candidate: RentalPropertyBillingCandidate }
  | { kind: "bill"; unpaid: RentalPropertyUnpaidBill };
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

/** 历史账单及候选共同建立空间树；本地结果只覆盖原候选账期，不阻止继续出下一期。 */
export function buildPropertyBillingTree(
  candidates: RentalPropertyBillingCandidate[],
  unpaidBills: RentalPropertyUnpaidBill[],
  completed: CompletedPropertyBill[],
): PropertyBillingNode[] {
  const completedPeriods = new Set(completed.map((c) => propertyBillingIdentity(c.candidate)));
  const localBills = completed.flatMap(({ candidate, bill }) =>
    bill.status === "active" && (bill.financial?.outstandingMinor ?? bill.amountMinor) > 0
      ? [{ ...candidate, bill }]
      : [],
  );
  const rows: PropertyBillingRow[] = [
    ...unpaidBills.map((unpaid): PropertyBillingRow => ({ kind: "bill", unpaid })),
    ...localBills.map((unpaid): PropertyBillingRow => ({ kind: "bill", unpaid })),
    ...candidates
      .filter((c) => !completedPeriods.has(propertyBillingIdentity(c)))
      .map((candidate): PropertyBillingRow => ({ kind: "candidate", candidate })),
  ];
  const nodes = new Map<string, PropertyBillingNode>();
  const seenRows = new Set<string>();
  for (const row of rows) {
    const source = row.kind === "bill" ? row.unpaid : row.candidate;
    const identity =
      row.kind === "bill"
        ? `bill:${source.spaceId}:${row.unpaid.bill.id}`
        : `candidate:${propertyBillingIdentity(row.candidate)}`;
    if (seenRows.has(identity)) continue;
    seenRows.add(identity);
    for (const space of source.path)
      if (!nodes.has(space.id)) nodes.set(space.id, { space, children: [], rows: [] });
    nodes.get(source.spaceId)?.rows.push(row);
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
      node.rows.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "bill" ? -1 : 1;
        if (a.kind === "bill" && b.kind === "bill")
          return (
            a.unpaid.bill.createdAt.localeCompare(b.unpaid.bill.createdAt) ||
            a.unpaid.bill.id.localeCompare(b.unpaid.bill.id)
          );
        if (a.kind === "candidate" && b.kind === "candidate")
          return propertyBillingIdentity(a.candidate).localeCompare(
            propertyBillingIdentity(b.candidate),
          );
        return 0;
      });
      sort(node.children);
    }
  };
  sort(roots);
  return roots;
}

/** 折叠不影响合计；同一账单只累计一次，不同币种分别按整数分求和。 */
export function propertyBillingTotals(nodes: PropertyBillingNode[]) {
  const totals = new Map<string, bigint>();
  const seen = new Set<string>();
  const visit = (node: PropertyBillingNode) => {
    for (const row of node.rows) {
      if (row.kind !== "bill" || seen.has(row.unpaid.bill.id)) continue;
      const { bill } = row.unpaid;
      seen.add(bill.id);
      totals.set(
        bill.currencyCode,
        (totals.get(bill.currencyCode) ?? 0n) + BigInt(bill.amountMinor),
      );
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
}

/** 空间分组行按合同展示租户与合同入口，同合同的多张账单合并展示。 */
export function propertyBillingContracts(rows: PropertyBillingRow[]) {
  const contracts = new Map<
    string,
    {
      contractId: string;
      contractNumber: string;
      tenantNames: string[];
    }
  >();
  for (const row of rows) {
    const source = row.kind === "bill" ? row.unpaid : row.candidate;
    const contractId = row.kind === "bill" ? row.unpaid.bill.contractId : row.candidate.contractId;
    const contractNumber =
      row.kind === "bill" ? row.unpaid.bill.contractNumber : row.candidate.contractNumber;
    const existing = contracts.get(contractId);
    if (existing) {
      existing.tenantNames = [...new Set([...existing.tenantNames, ...source.tenantNames])];
    } else {
      contracts.set(contractId, {
        contractId,
        contractNumber,
        tenantNames: [...new Set(source.tenantNames)],
      });
    }
  }
  return [...contracts.values()];
}

import type { RentalPropertyBillingCandidate } from "@xpense/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrganizationCurrency } from "@/features/organizations/organization-currency";
import { formatBillAmount } from "../bills/bill-format";
import {
  type PropertyBillingNode,
  propertyBillingContracts,
  propertyBillingTotals,
} from "./property-billing-model";
import { PropertyBillingRows } from "./property-billing-rows";

export function PropertyBillingTree({
  nodes,
  today,
  onSelect,
  onNavigateContract,
  onNavigateBill,
  disabledReason,
}: {
  nodes: PropertyBillingNode[];
  today: string;
  onNavigateContract: (contractId: string) => void;
  onNavigateBill: (billId: string) => void;
  onSelect: (candidate: RentalPropertyBillingCandidate, trigger: HTMLButtonElement) => void;
  disabledReason?: string;
}) {
  const currencyCode = useOrganizationCurrency();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const totals = propertyBillingTotals(nodes);
  const hasPending = (list: PropertyBillingNode[]): boolean =>
    list.some(
      (node) => node.rows.some((row) => row.kind === "candidate") || hasPending(node.children),
    );
  const visit = (node: PropertyBillingNode, depth: number): React.ReactNode => {
    const closed = collapsed.has(node.space.id);
    const contracts = propertyBillingContracts(node.rows);
    return (
      <Fragment key={node.space.id}>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="py-2 align-top">
            <Button
              variant="ghost"
              className="h-9 font-medium"
              style={{ marginLeft: `${depth * 16}px` }}
              aria-label={`${closed ? "展开" : "折叠"} ${node.space.name}`}
              aria-expanded={!closed}
              onClick={() => toggle(node.space.id)}
            >
              {closed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              {node.space.name}
            </Button>
          </TableCell>
          <TableCell className="py-2 align-top whitespace-normal">
            <div className="space-y-2">
              {contracts.map((contract) => (
                <div key={contract.contractId} className="space-y-0.5">
                  <p>{contract.tenantNames.join("、")}</p>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-muted-foreground tabular-nums"
                    aria-label={`查看合同 ${contract.contractNumber}`}
                    onClick={() => onNavigateContract(contract.contractId)}
                  >
                    {contract.contractNumber}
                  </Button>
                </div>
              ))}
            </div>
          </TableCell>
          <TableCell colSpan={5} />
        </TableRow>
        {closed ? null : (
          <>
            <PropertyBillingRows
              node={node}
              today={today}
              onSelect={onSelect}
              onNavigateBill={onNavigateBill}
              disabledReason={disabledReason}
            />
            {node.children.map((child) => visit(child, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="min-w-[860px]" aria-label="空间账单列表">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["空间", "租户", "账单号", "账期", "总收费", "状态", "操作"].map((label) => (
              <TableHead key={label} className={label === "总收费" ? "text-right" : undefined}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{nodes.map((node) => visit(node, 0))}</TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="py-4 pl-4">
              总收费合计
              {hasPending(nodes) ? (
                <p className="mt-1 text-xs font-normal text-muted-foreground">待计算账单未计入</p>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {totals.length
                ? totals.map((total) => (
                    <p key={total.currencyCode}>
                      {formatBillAmount(total.amountMinor, total.currencyCode)}
                    </p>
                  ))
                : formatBillAmount(0, currencyCode)}
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

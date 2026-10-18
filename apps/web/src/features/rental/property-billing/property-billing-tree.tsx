import type { RentalPropertyBillingCandidate } from "@xpense/shared";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBillAmount } from "../bills/bill-format";
import { BillingDistanceBadge } from "./billing-distance-badge";
import {
  displayBillingDayDistance,
  type PropertyBillingNode,
  type PropertyBillingRow,
  propertyBillingIdentity,
} from "./property-billing-model";
export function PropertyBillingTree({
  nodes,
  today,
  onSelect,
}: {
  nodes: PropertyBillingNode[];
  today: string;
  onSelect: (candidate: RentalPropertyBillingCandidate, trigger: HTMLButtonElement) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const feeRow = (row: PropertyBillingRow, node: PropertyBillingNode, depth: number) => (
    <TableRow key={propertyBillingIdentity(row.candidate)}>
      <TableCell>
        <Button
          variant="ghost"
          className="h-auto py-2 text-left whitespace-normal"
          style={{ marginLeft: `${depth * 20}px` }}
          aria-label={`生成账单 ${node.space.name} ${row.candidate.tenantNames.join("、")}`}
          aria-disabled={Boolean(row.bill)}
          onClick={(event) => {
            if (!row.bill) onSelect(row.candidate, event.currentTarget);
          }}
        >
          {node.space.name}
          {node.rows.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              合同 {row.candidate.contractId.slice(-8)}
            </span>
          ) : null}
        </Button>
      </TableCell>
      <TableCell className="max-w-48 whitespace-normal">
        {row.candidate.tenantNames.join("、")}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs tabular-nums">
        {row.candidate.period.periodStart} 至 {row.candidate.period.periodEnd}
      </TableCell>
      <TableCell>
        <BillingDistanceBadge
          daysUntilStart={displayBillingDayDistance(today, row.candidate.period.periodStart)}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.bill ? (
          formatBillAmount(row.bill.amountMinor)
        ) : (
          <span className="text-muted-foreground">待计算</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={row.bill ? "secondary" : "outline"}>{row.bill ? "已生成" : "待出账"}</Badge>
      </TableCell>
    </TableRow>
  );
  const visit = (node: PropertyBillingNode, depth: number): React.ReactNode => {
    if (!node.children.length && node.rows.length === 1) return feeRow(node.rows[0]!, node, depth);
    const closed = collapsed.has(node.space.id);
    return (
      <Fragment key={node.space.id}>
        <TableRow className="bg-muted/30">
          <TableCell>
            <Button
              variant="ghost"
              className="font-medium"
              style={{ marginLeft: `${depth * 20}px` }}
              aria-label={`${closed ? "展开" : "折叠"} ${node.space.name}`}
              aria-expanded={!closed}
              onClick={() => toggle(node.space.id)}
            >
              {closed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              <Folder className="size-4 text-muted-foreground" />
              {node.space.name}
            </Button>
          </TableCell>
          <TableCell colSpan={5} />
        </TableRow>
        {closed ? null : (
          <>
            {node.rows.map((row) => feeRow(row, node, depth + 1))}
            {node.children.map((child) => visit(child, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            {["空间", "租户", "本次账期", "距账期开始", "总收费", "状态"].map((label) => (
              <TableHead key={label} className={label === "总收费" ? "text-right" : undefined}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{nodes.map((node) => visit(node, 0))}</TableBody>
      </Table>
    </div>
  );
}

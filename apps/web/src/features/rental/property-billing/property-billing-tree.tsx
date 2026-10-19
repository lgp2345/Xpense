import type { RentalPropertyBillingCandidate } from "@xpense/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  onNavigateContract,
}: {
  nodes: PropertyBillingNode[];
  today: string;
  onNavigateContract: (contractId: string) => void;
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
          className="h-auto text-left py-2 whitespace-normal"
          style={{ marginLeft: `${depth * 20}px` }}
          aria-label={`查看合同 ${node.space.name} ${row.candidate.tenantNames.join("、")}`}
          onClick={() => onNavigateContract(row.candidate.contractId)}
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
      <TableCell className="text-xs whitespace-nowrap tabular-nums">
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
      <TableCell>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(row.bill)}
                focusableWhenDisabled
                aria-label={`生成账单 ${node.space.name} ${row.candidate.tenantNames.join("、")}`}
                onClick={(event) => onSelect(row.candidate, event.currentTarget)}
              >
                生成账单
              </Button>
            }
          />
          {row.bill ? (
            <TooltipContent sideOffset={4}>本轮已生成账单，请刷新列表后继续。</TooltipContent>
          ) : null}
        </Tooltip>
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
              {node.space.name}
            </Button>
          </TableCell>
          <TableCell colSpan={6} />
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
    <div className="border rounded-lg overflow-x-auto">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            {["空间", "租户", "本次账期", "距账期开始", "总收费", "状态", "操作"].map((label) => (
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

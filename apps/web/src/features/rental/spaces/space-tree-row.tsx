import type { RentalSpaceNode } from "@xpense/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RefCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";

export function SpaceTreeRow({
  depth,
  expanded,
  node,
  actions,
  onToggle,
  rowRef,
}: {
  depth: number;
  expanded: boolean;
  node: RentalSpaceNode;
  actions?: React.ReactNode;
  onToggle: () => void;
  rowRef?: RefCallback<HTMLTableRowElement>;
}) {
  const status = !node.isActive
    ? "自身停用"
    : !node.isEffectivelyActive
      ? "因上级停用而不可用"
      : "有效";
  return (
    <TableRow ref={rowRef} id={`space-row-${node.id}`} tabIndex={-1}>
      <TableCell>
        <div
          className="flex min-w-0 items-center gap-1"
          style={{ paddingInlineStart: `${depth * 1.25}rem` }}
        >
          {node.hasChildren ? (
            <Button
              aria-expanded={expanded}
              aria-label={`${expanded ? "折叠" : "展开"} ${node.name}`}
              className="size-7"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onToggle}
            >
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : (
            <span aria-hidden="true" className="inline-block size-7" />
          )}
          <span className="min-w-0 break-words font-medium">{node.name}</span>
          {node.code ? (
            <span className="break-all text-xs text-muted-foreground">{node.code}</span>
          ) : null}
          <MobileSpaceDetails node={node} />
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">{node.customTypeName ?? node.type}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <Badge variant={node.isEffectivelyActive ? "default" : "secondary"}>{status}</Badge>
          <Badge variant={node.leaseStatus === "vacant" ? "outline" : "secondary"}>
            {leaseStatusLabel(node.leaseStatus)}
          </Badge>
          {node.hasUpcomingContract ? <Badge variant="secondary">即将有合同</Badge> : null}
          {node.leaseBlockedReason ? (
            <Badge variant="destructive">{blockedReasonLabel(node.leaseBlockedReason)}</Badge>
          ) : null}
          {node.hasChildren ? <Badge variant="outline">包含子空间</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant={node.isRentable ? "outline" : "secondary"}>
          {node.isRentable ? "可出租" : "不可出租"}
        </Badge>
      </TableCell>
      {actions ? <TableCell>{actions}</TableCell> : null}
    </TableRow>
  );
}

function MobileSpaceDetails({ node }: { node: RentalSpaceNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="sm:hidden" size="sm" type="button" variant="outline">
          详情
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{node.name}</SheetTitle>
          <SheetDescription>空间详情</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4 text-sm">
          <p>类型：{node.customTypeName ?? node.type}</p>
          <p>状态：{node.isActive ? "自身启用" : "自身停用"}</p>
          <p>
            {!node.isActive
              ? "自身停用"
              : !node.isEffectivelyActive
                ? "因上级停用而不可用"
                : "当前可用"}
          </p>
          <p>租赁状态：{leaseStatusLabel(node.leaseStatus)}</p>
          <p>{node.hasUpcomingContract ? "有即将生效合同" : "无即将生效合同"}</p>
          {node.leaseBlockedReason ? (
            <p>
              阻塞原因：
              {node.leaseBlockedReason === "ancestor_contract"
                ? "上级空间已有合同"
                : "下级空间已有合同"}
            </p>
          ) : null}
          <p>{node.isRentable ? "可出租" : "不可出租"}</p>
          {node.note ? <p>备注：{node.note}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function leaseStatusLabel(status: RentalSpaceNode["leaseStatus"]): string {
  return { vacant: "空置", upcoming: "即将出租", active: "出租中", expiring_soon: "即将到期" }[
    status
  ];
}
function blockedReasonLabel(reason: NonNullable<RentalSpaceNode["leaseBlockedReason"]>): string {
  return reason === "ancestor_contract" ? "上级已有合同" : "下级已有合同";
}

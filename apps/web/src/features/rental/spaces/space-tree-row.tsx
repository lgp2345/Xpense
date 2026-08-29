import type { RentalSpaceNode } from "@xpense/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RefCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">{node.customTypeName ?? node.type}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <Badge variant={node.isEffectivelyActive ? "default" : "secondary"}>{status}</Badge>
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

import type { MenuConfigurationNode } from "@xpense/shared";
import { ChevronDown, ChevronRight, ExternalLink, FileKey2, FolderTree, Link2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MenuFilters } from "./menu-filters";
import { MenuRowActions, type MenuRowActionsProps } from "./menu-row-actions";
import { getMatchingMenuIds, type MenuSearch } from "./menu-search";

type MenuTreeTableProps = Omit<MenuRowActionsProps, "node" | "index" | "siblingCount"> & {
  nodes: readonly MenuConfigurationNode[];
  search?: MenuSearch;
  onSearchChange?: (search: MenuSearch) => void;
};
const EMPTY_SEARCH: MenuSearch = {};

type VisibilityContext = {
  hasHiddenAncestor: boolean;
  hasMenuAncestor: boolean;
};

export function MenuTreeTable({ search, onSearchChange, ...props }: MenuTreeTableProps) {
  const [localSearch, setLocalSearch] = useState(EMPTY_SEARCH);
  const activeSearch = search ?? localSearch;
  const searchKey = JSON.stringify([
    activeSearch.name,
    activeSearch.destination,
    activeSearch.permission,
  ]);
  const matchingIds = getMatchingMenuIds(props.nodes, activeSearch);

  return (
    <>
      <MenuFilters
        key={`filters-${searchKey}`}
        search={activeSearch}
        onApply={onSearchChange ?? setLocalSearch}
      />
      <MenuTreeContent key={`tree-${searchKey}`} {...props} matchingIds={matchingIds} />
    </>
  );
}

function MenuTreeContent({
  canCreate,
  canDelete,
  canUpdate,
  isMutating,
  nodes,
  matchingIds,
  onAddChild,
  onDelete,
  onEdit,
  onMove,
}: Omit<MenuTreeTableProps, "search" | "onSearchChange"> & {
  matchingIds: ReadonlySet<number> | null;
}) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(() => new Set());
  function toggleNode(id: number) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  if (nodes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">当前组织还没有菜单配置。</p>
    );
  }

  if (matchingIds?.size === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        没有符合筛选条件的菜单节点。
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead className="w-[22%]">路由或外链</TableHead>
              <TableHead>权限</TableHead>
              <TableHead className="w-[20%]">可见性</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderRows(nodes, {
              canCreate,
              canDelete,
              canUpdate,
              depth: 0,
              collapsedIds,
              matchingIds,
              toggleNode,
              isMutating,
              visibility: { hasHiddenAncestor: false, hasMenuAncestor: false },
              onAddChild,
              onDelete,
              onEdit,
              onMove,
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type RenderRowsOptions = Omit<MenuRowActionsProps, "node" | "index" | "siblingCount"> & {
  collapsedIds: ReadonlySet<number>;
  matchingIds: ReadonlySet<number> | null;
  toggleNode: (id: number) => void;
  depth: number;
  visibility: VisibilityContext;
};

function renderRows(
  nodes: readonly MenuConfigurationNode[],
  options: RenderRowsOptions,
): ReactNode[] {
  return nodes.flatMap((node, index) => {
    if (options.matchingIds && !options.matchingIds.has(node.id)) return [];
    const hasVisibleChildren = node.children.some(
      (child) => !options.matchingIds || options.matchingIds.has(child.id),
    );
    const isExpanded = !options.collapsedIds.has(node.id);
    const row = (
      <TableRow key={node.id}>
        <TableCell>
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: `${options.depth * 0.75}rem` }}
            />
            {hasVisibleChildren ? (
              <Button
                aria-label={`${isExpanded ? "收起" : "展开"} ${node.name}`}
                aria-expanded={isExpanded}
                className="size-7 shrink-0"
                size="icon"
                variant="ghost"
                onClick={() => options.toggleNode(node.id)}
              >
                {isExpanded ? (
                  <ChevronDown aria-hidden="true" />
                ) : (
                  <ChevronRight aria-hidden="true" />
                )}
              </Button>
            ) : (
              <span aria-hidden="true" className="size-7 shrink-0" />
            )}
            <NodeIcon node={node} />
            <span className="truncate font-medium" title={node.name}>
              {node.name}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{nodeTypeLabel(node)}</Badge>
        </TableCell>
        <TableCell>{renderDestination(node)}</TableCell>
        <TableCell>
          <span className="font-mono text-xs text-muted-foreground">
            {node.permissionCode ?? "-"}
          </span>
        </TableCell>
        <TableCell>
          <div className="grid gap-1">
            <span className="text-xs text-foreground">{selfVisibilityLabel(node)}</span>
            <span className="text-xs text-muted-foreground">
              {effectiveVisibilityLabel(node, options.visibility)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <MenuRowActions {...options} node={node} index={index} siblingCount={nodes.length} />
        </TableCell>
      </TableRow>
    );
    const nextVisibility = {
      hasHiddenAncestor:
        options.visibility.hasHiddenAncestor ||
        (node.type !== "button" && node.isVisible === false),
      hasMenuAncestor: options.visibility.hasMenuAncestor || node.type === "menu",
    };

    if (!isExpanded) return [row];
    return [
      row,
      ...renderRows(node.children, {
        ...options,
        depth: options.depth + 1,
        visibility: nextVisibility,
      }),
    ];
  });
}

function NodeIcon({ node }: { node: MenuConfigurationNode }) {
  if (node.type === "directory") {
    return <FolderTree aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (node.type === "button") {
    return <FileKey2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (node.isExternal) {
    return <Link2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
}

function nodeTypeLabel(node: MenuConfigurationNode): string {
  if (node.type === "directory") {
    return "目录";
  }
  if (node.type === "button") {
    return "按钮";
  }
  return node.isExternal ? "外链菜单" : "内部菜单";
}

function renderDestination(node: MenuConfigurationNode): ReactNode {
  if (node.type !== "menu") {
    return <span className="text-muted-foreground">-</span>;
  }
  if (node.isExternal) {
    return (
      <span className="block max-w-64 truncate text-xs text-muted-foreground" title={node.url}>
        {node.url}
      </span>
    );
  }
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-foreground">{node.path}</span>
      <span className="font-mono text-xs text-muted-foreground">{node.routeKey}</span>
    </div>
  );
}

function selfVisibilityLabel(node: MenuConfigurationNode): string {
  if (node.type === "button") {
    return "自身显隐不适用";
  }
  return node.isVisible ? "自身可见" : "自身隐藏";
}

function effectiveVisibilityLabel(node: MenuConfigurationNode, context: VisibilityContext): string {
  if (node.type === "button") {
    return "不进入导航";
  }
  if (!node.isVisible) {
    return "不会进入导航";
  }
  if (context.hasHiddenAncestor) {
    return "自身可见 · 受父级隐藏";
  }
  if (context.hasMenuAncestor) {
    return "不进入导航 · 位于菜单页面下";
  }
  return node.type === "directory" ? "目录层级可见" : "已进入导航";
}

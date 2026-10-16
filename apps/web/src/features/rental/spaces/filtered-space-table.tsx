import type { RentalSpaceNode, RentalSpaceSearchResult } from "@xpense/shared";
import type { ReactNode } from "react";
import { LoadMoreButton } from "@/components/load-more-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SpaceTreeRow } from "./space-tree-row";

/** 状态筛选返回完整房产范围中的命中空间，保留路径以区分同名节点。 */
export function FilteredSpaceTable({
  items,
  pending,
  error,
  total,
  hasMore,
  loadingMore,
  loadMoreError,
  canActions,
  renderActions,
  onViewContracts,
  onLoadMore,
  onRetry,
}: {
  items: RentalSpaceSearchResult[];
  pending: boolean;
  error: boolean;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  canActions: boolean;
  renderActions: (node: RentalSpaceNode, depth: number) => ReactNode;
  onViewContracts?: (node: RentalSpaceNode) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (pending)
    return (
      <div aria-busy="true" aria-live="polite">
        <Skeleton className="h-24 w-full" />
        <span className="sr-only">正在筛选空间...</span>
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        筛选空间失败，请重试。
        <Button variant="link" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  if (!items.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">没有匹配筛选条件的空间。</p>
    );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground tabular-nums">共 {total} 个匹配空间</p>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>空间路径</TableHead>
                <TableHead className="hidden sm:table-cell">类型</TableHead>
                <TableHead className="hidden sm:table-cell">有效状态</TableHead>
                <TableHead className="hidden sm:table-cell">租赁状态</TableHead>
                <TableHead className="hidden sm:table-cell">出租属性</TableHead>
                {canActions ? <TableHead className="text-right">操作</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <SpaceTreeRow
                  key={item.id}
                  depth={0}
                  expanded={false}
                  node={{
                    ...item,
                    hasChildren: false,
                    name: item.path.map((part) => part.name).join(" / "),
                  }}
                  actions={renderActions(item, item.path.length - 1)}
                  onToggle={() => {}}
                  onViewContracts={onViewContracts ? () => onViewContracts(item) : undefined}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {hasMore ? (
        <LoadMoreButton pending={loadingMore} pendingLabel="正在加载..." onClick={onLoadMore}>
          加载更多匹配空间
        </LoadMoreButton>
      ) : null}
      {loadMoreError ? (
        <div role="alert" className="text-sm text-destructive">
          加载更多空间失败。
          <Button variant="link" onClick={onLoadMore}>
            重试
          </Button>
        </div>
      ) : null}
    </div>
  );
}

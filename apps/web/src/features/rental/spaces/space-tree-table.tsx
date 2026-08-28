import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalSpaceSearchResult } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { SpaceSearchResults } from "./space-search-results";
import { SpaceTreeRow } from "./space-tree-row";
import {
  childPage,
  collapseSpace,
  createSpaceTreeState,
  expandSpace,
  hasMoreChildren,
  mergeChildPage,
  type SpaceTreeState,
  searchAncestorIds,
} from "./space-tree-state";

const CHILD_PAGE_SIZE = 50;

/** 根节点首屏读取、分支按需读取、搜索按路径定位的只读空间树。 */
export function SpaceTreeTable({
  api,
  organizationId,
  permissions,
  propertyId,
}: {
  api: Pick<RentalApi, "listChildren" | "searchSpaces">;
  organizationId: string;
  permissions: readonly PermissionKey[];
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [tree, setTree] = useState(createSpaceTreeState);
  const treeRef = useRef(tree);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [draftKeyword, setDraftKeyword] = useState("");
  const [keyword, setKeyword] = useState("");
  const rootQuery = useQuery({
    ...rentalQueryOptions.children(api as RentalApi, organizationId, {
      propertyId,
      parentId: null,
      page: 1,
      pageSize: CHILD_PAGE_SIZE,
    }),
    retry: false,
  });
  const searchQuery = useQuery({
    ...rentalQueryOptions.search(api as RentalApi, organizationId, {
      propertyId,
      keyword,
      page: 1,
      pageSize: 20,
    }),
    enabled: keyword.length > 0,
    retry: false,
  });

  const updateTree = useCallback((updater: (current: SpaceTreeState) => SpaceTreeState) => {
    const next = updater(treeRef.current);
    treeRef.current = next;
    setTree(next);
  }, []);

  useEffect(() => {
    if (rootQuery.data) updateTree((current) => mergeChildPage(current, null, rootQuery.data));
  }, [rootQuery.data, updateTree]);

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(draftKeyword.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [draftKeyword]);

  useEffect(() => {
    if (!focusId) return;
    rowRefs.current[focusId]?.focus();
    setFocusId(null);
  }, [focusId]);

  async function loadPage(parentId: string | null, page: number): Promise<boolean> {
    const parentKey = parentId ?? "root";
    try {
      const result = await queryClient.fetchQuery({
        ...rentalQueryOptions.children(api as RentalApi, organizationId, {
          propertyId,
          parentId,
          page,
          pageSize: CHILD_PAGE_SIZE,
        }),
        retry: false,
      });
      updateTree((current) => mergeChildPage(current, parentId, result));
      setErrors((current) => ({ ...current, [parentKey]: false }));
      return true;
    } catch {
      setErrors((current) => ({ ...current, [parentKey]: true }));
      return false;
    }
  }

  async function toggle(nodeId: string) {
    if (treeRef.current.expandedIds.includes(nodeId)) {
      updateTree((current) => collapseSpace(current, nodeId));
      return;
    }
    updateTree((current) => expandSpace(current, nodeId));
    if (!childPage(treeRef.current, nodeId)) await loadPage(nodeId, 1);
  }

  async function ensureVisible(parentId: string | null, id: string): Promise<void> {
    while (!childPage(treeRef.current, parentId)?.items.includes(id)) {
      const loaded = childPage(treeRef.current, parentId);
      const nextPage = loaded ? loaded.page + 1 : 1;
      if (loaded && loaded.items.length >= loaded.total) return;
      if (!(await loadPage(parentId, nextPage))) return;
    }
  }

  async function selectSearchResult(result: RentalSpaceSearchResult) {
    let parentId: string | null = null;
    for (const ancestorId of searchAncestorIds(result)) {
      await ensureVisible(parentId, ancestorId);
      updateTree((current) => expandSpace(current, ancestorId));
      parentId = ancestorId;
    }
    await ensureVisible(parentId, result.id);
    setFocusId(result.id);
  }

  const root = childPage(tree, null);
  const canCreate = permissions.includes("rental_spaces:create");
  return (
    <section aria-labelledby="space-tree-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="space-tree-heading" className="text-lg font-medium">
            空间管理
          </h2>
          <p className="text-sm text-muted-foreground">展开节点后才加载直属子空间。</p>
        </div>
        {canCreate ? (
          <span className="text-sm text-muted-foreground">已具备空间维护权限</span>
        ) : null}
      </div>
      <div className="space-y-2">
        <label className="sr-only" htmlFor="space-search">
          搜索空间
        </label>
        <Input
          id="space-search"
          placeholder="按名称或编码搜索空间"
          value={draftKeyword}
          onChange={(event) => setDraftKeyword(event.target.value)}
        />
        <SpaceSearchResults
          error={searchQuery.isError}
          isPending={searchQuery.isFetching}
          items={searchQuery.data?.items ?? []}
          keyword={keyword}
          onSelect={(result) => void selectSearchResult(result)}
        />
      </div>
      {rootQuery.isPending ? (
        <Card>
          <CardContent className="space-y-2 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载空间...</span>
          </CardContent>
        </Card>
      ) : rootQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          加载空间失败，请稍后重试。
          <Button
            className="ml-3"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void rootQuery.refetch()}
          >
            重试
          </Button>
        </div>
      ) : (root?.items.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">当前房产没有空间。</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>空间</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>有效状态</TableHead>
                  <TableHead>出租</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TreeRows
                  errors={errors}
                  onLoadMore={(parentId) => {
                    const page = childPage(treeRef.current, parentId);
                    if (page) void loadPage(parentId, page.page + 1);
                  }}
                  onRetry={(parentId) => void loadPage(parentId, 1)}
                  onToggle={(nodeId) => void toggle(nodeId)}
                  rowRefs={rowRefs}
                  state={tree}
                />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function TreeRows({
  errors,
  onLoadMore,
  onRetry,
  onToggle,
  rowRefs,
  state,
}: {
  errors: Record<string, boolean>;
  onLoadMore: (parentId: string) => void;
  onRetry: (parentId: string) => void;
  onToggle: (nodeId: string) => void;
  rowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  state: SpaceTreeState;
}) {
  function renderBranch(parentId: string | null, depth: number): React.ReactNode[] {
    const page = childPage(state, parentId);
    return (page?.items ?? []).flatMap((id) => {
      const node = state.nodesById[id];
      if (!node) return [];
      const expanded = state.expandedIds.includes(id);
      const children = expanded ? renderBranch(id, depth + 1) : [];
      const failure = errors[id]
        ? [
            <TableRow key={`${id}-error`}>
              <TableCell className="text-destructive" colSpan={4}>
                加载子空间失败
                <Button
                  aria-label={`重试加载 ${node.name} 的子空间`}
                  className="ml-2"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onRetry(id)}
                >
                  重试
                </Button>
              </TableCell>
            </TableRow>,
          ]
        : [];
      const more =
        expanded && hasMoreChildren(state, id)
          ? [
              <TableRow key={`${id}-more`}>
                <TableCell colSpan={4}>
                  <Button size="sm" type="button" variant="outline" onClick={() => onLoadMore(id)}>
                    加载更多
                  </Button>
                </TableCell>
              </TableRow>,
            ]
          : [];
      return [
        <SpaceTreeRow
          key={id}
          depth={depth}
          expanded={expanded}
          node={node}
          onToggle={() => onToggle(id)}
          rowRef={(element) => {
            rowRefs.current[id] = element;
          }}
        />,
        ...failure,
        ...children,
        ...more,
      ];
    });
  }
  return <>{renderBranch(null, 0)}</>;
}

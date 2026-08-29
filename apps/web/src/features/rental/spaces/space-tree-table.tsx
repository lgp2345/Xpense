import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BatchCreateRentalSpacesRequest,
  CreateRentalSpaceRequest,
  PermissionKey,
  RentalSpaceNode,
  RentalSpaceSearchResult,
  UpdateRentalSpaceRequest,
} from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { invalidateSpaceMutation, rentalQueryOptions } from "../../../services/rental-query";
import { SpaceActions } from "./space-actions";
import { SpaceBatchDialog } from "./space-batch-dialog";
import { SpaceFormDialog } from "./space-form-dialog";
import { SpaceSearchResults } from "./space-search-results";
import { SpaceTreeRow } from "./space-tree-row";
import {
  childPage,
  collapseSpace,
  createSpaceTreeState,
  expandSpace,
  hasMoreChildren,
  mergeChildPage,
  replaceChildPage,
  type SpaceTreeState,
  searchAncestorIds,
} from "./space-tree-state";

const CHILD_PAGE_SIZE = 50;

/** 根节点首屏读取、分支按需读取、搜索按路径定位的只读空间树。 */
export function SpaceTreeTable({
  api,
  organizationId,
  permissions,
  propertyActive,
  propertyId,
}: {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  propertyActive: boolean;
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
  const [searchItems, setSearchItems] = useState<RentalSpaceSearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [locationResult, setLocationResult] = useState<RentalSpaceSearchResult | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "failure">(
    "idle",
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
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
  useEffect(() => {
    if (!keyword || !searchQuery.data) {
      setSearchItems([]);
      setSearchPage(1);
      return;
    }
    setSearchItems(searchQuery.data.items);
    setSearchPage(searchQuery.data.page);
  }, [keyword, searchQuery.data]);

  async function loadMoreSearchResults() {
    if (!searchQuery.data || searchLoadingMore || searchItems.length >= searchQuery.data.total)
      return;
    setSearchLoadingMore(true);
    try {
      const nextPage = searchPage + 1;
      const page = await queryClient.fetchQuery({
        ...rentalQueryOptions.search(api, organizationId, {
          propertyId,
          keyword,
          page: nextPage,
          pageSize: 20,
        }),
        retry: false,
      });
      setSearchItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of page.items) byId.set(item.id, item);
        return [...byId.values()];
      });
      setSearchPage(nextPage);
    } finally {
      setSearchLoadingMore(false);
    }
  }
  const createMutation = useMutation({
    mutationFn: (input: CreateRentalSpaceRequest) => api.createSpace(input),
    onSuccess: (_, input) => invalidateSpaceMutation(queryClient, organizationId, input.propertyId),
  });
  const batchMutation = useMutation({
    mutationFn: (input: BatchCreateRentalSpacesRequest) => api.batchCreateSpaces(input),
    onSuccess: (_, input) => invalidateSpaceMutation(queryClient, organizationId, input.propertyId),
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpdateRentalSpaceRequest) => api.updateSpace(input),
    onSuccess: (_, { id }) => invalidateSpaceMutation(queryClient, organizationId, propertyId, id),
  });
  const moveMutation = useMutation({
    mutationFn: ({
      id,
      parentId,
      sortOrder,
    }: {
      id: string;
      parentId: string | null;
      sortOrder: number;
    }) => api.moveSpace(id, { parentId, sortOrder }),
    onSuccess: (_, { id }) => invalidateSpaceMutation(queryClient, organizationId, propertyId, id),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.setSpaceStatus(id, isActive),
    onSuccess: (_, { id }) => invalidateSpaceMutation(queryClient, organizationId, propertyId, id),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSpace(id),
    onSuccess: (_, id) => invalidateSpaceMutation(queryClient, organizationId, propertyId, id),
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

  async function ensureVisible(parentId: string | null, id: string): Promise<boolean> {
    while (!childPage(treeRef.current, parentId)?.items.includes(id)) {
      const loaded = childPage(treeRef.current, parentId);
      const nextPage = loaded ? loaded.page + 1 : 1;
      if (loaded && loaded.items.length >= loaded.total) return false;
      if (!(await loadPage(parentId, nextPage))) return false;
    }
    return true;
  }

  async function selectSearchResult(result: RentalSpaceSearchResult) {
    setLocationResult(result);
    setLocationStatus("loading");
    let parentId: string | null = null;
    for (const ancestorId of searchAncestorIds(result)) {
      if (!(await ensureVisible(parentId, ancestorId))) {
        setLocationStatus("failure");
        return;
      }
      updateTree((current) => expandSpace(current, ancestorId));
      parentId = ancestorId;
    }
    if (!(await ensureVisible(parentId, result.id))) {
      setLocationStatus("failure");
      return;
    }
    setFocusId(result.id);
    setLocationStatus("success");
  }

  const root = childPage(tree, null);
  const canCreate = propertyActive && permissions.includes("rental_spaces:create");
  const canActions = permissions.some((permission) =>
    ["rental_spaces:create", "rental_spaces:update", "rental_spaces:delete"].includes(permission),
  );
  const actionError = (error: unknown, action: string) => {
    const message =
      action === "删除" && error instanceof ApiError && error.status === 409
        ? "该空间仍有子空间或租赁关联，请先处理关联后再删除。"
        : `${action}空间失败，请稍后重试。`;
    setMutationError(message);
    return message;
  };
  async function handleCreate(input: CreateRentalSpaceRequest) {
    setMutationError(null);
    try {
      await createMutation.mutateAsync(input);
      await refreshAfterMutation("创建");
      toast.success("空间创建成功");
    } catch (error) {
      actionError(error, "创建");
      throw error;
    }
  }
  async function handleBatchCreate(input: BatchCreateRentalSpacesRequest) {
    setMutationError(null);
    try {
      await batchMutation.mutateAsync(input);
      await refreshAfterMutation("批量创建");
      toast.success(`已创建 ${input.items.length} 个空间`);
    } catch (error) {
      actionError(error, "批量创建");
      throw error;
    }
  }
  async function handleUpdate(input: UpdateRentalSpaceRequest) {
    setMutationError(null);
    try {
      await updateMutation.mutateAsync(input);
      await refreshAfterMutation("保存");
      toast.success("空间已更新");
    } catch (error) {
      actionError(error, "保存");
      throw error;
    }
  }
  async function handleMove(space: RentalSpaceNode, parentId: string | null, sortOrder: number) {
    setMutationError(null);
    try {
      await moveMutation.mutateAsync({ id: space.id, parentId, sortOrder });
      await refreshAfterMutation("移动");
      toast.success("空间已移动");
    } catch (error) {
      actionError(error, "移动");
      throw error;
    }
  }
  async function handleStatus(space: RentalSpaceNode, isActive: boolean) {
    setMutationError(null);
    try {
      await statusMutation.mutateAsync({ id: space.id, isActive });
      await refreshAfterMutation("更新状态");
      toast.success(isActive ? "空间已启用" : "空间已停用");
    } catch (error) {
      actionError(error, "更新状态");
    }
  }
  async function handleDelete(space: RentalSpaceNode) {
    setMutationError(null);
    try {
      await deleteMutation.mutateAsync(space.id);
      await refreshAfterMutation("删除");
      toast.success("空间已删除");
    } catch (error) {
      actionError(error, "删除");
    }
  }
  async function refreshAfterMutation(action: string): Promise<void> {
    try {
      await refreshLoadedTree();
    } catch {
      setMutationError(`${action}已成功，但树刷新失败，请稍后重试。`);
    }
  }
  async function refreshLoadedTree() {
    const rootPage = childPage(treeRef.current, null);
    if (!rootPage) return;
    await refreshBranch(null, rootPage.page);
    const loadedChildren = Object.entries(treeRef.current.byParent).filter(
      ([parentKey]) => parentKey !== "root",
    );
    await Promise.all(loadedChildren.map(([parentId, page]) => refreshBranch(parentId, page.page)));
  }
  async function refreshBranch(parentId: string | null, loadedThroughPage: number) {
    const pages = await Promise.all(
      Array.from({ length: loadedThroughPage }, (_, index) =>
        queryClient.fetchQuery({
          ...rentalQueryOptions.children(api, organizationId, {
            propertyId,
            parentId,
            page: index + 1,
            pageSize: CHILD_PAGE_SIZE,
          }),
          retry: false,
        }),
      ),
    );
    const first = pages[0];
    if (!first) return;
    updateTree((current) =>
      replaceChildPage(current, parentId, {
        items: pages.flatMap((page) => page.items),
        page: loadedThroughPage,
        pageSize: first.pageSize,
        total: first.total,
      }),
    );
  }
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
          <div className="flex flex-wrap gap-2">
            <SpaceFormDialog propertyId={propertyId} onCreate={handleCreate} />
            <SpaceBatchDialog propertyId={propertyId} onCreate={handleBatchCreate} />
          </div>
        ) : null}
      </div>
      {mutationError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {mutationError}
        </div>
      ) : null}
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
          hasMore={Boolean(searchQuery.data && searchItems.length < searchQuery.data.total)}
          isLoadingMore={searchLoadingMore}
          items={searchItems}
          keyword={keyword}
          onLoadMore={() => void loadMoreSearchResults()}
          onSelect={(result) => void selectSearchResult(result)}
        />
        {locationStatus !== "idle" && locationResult ? (
          <div aria-live="polite" className="text-sm text-muted-foreground" role="status">
            {locationStatus === "loading" ? `正在定位空间 ${locationResult.name}...` : null}
            {locationStatus === "success" ? `已定位到 ${locationResult.name}` : null}
            {locationStatus === "failure" ? (
              <>
                定位空间失败，请重试。
                <Button
                  aria-label={`重试定位 ${locationResult.name}`}
                  className="ml-2"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void selectSearchResult(locationResult)}
                >
                  重试
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
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
                  <TableHead className="hidden sm:table-cell">类型</TableHead>
                  <TableHead className="hidden sm:table-cell">有效状态</TableHead>
                  <TableHead className="hidden sm:table-cell">出租</TableHead>
                  {canActions ? <TableHead className="text-right">操作</TableHead> : null}
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
                  renderActions={(node, depth) => (
                    <SpaceActions
                      api={api}
                      deleting={deleteMutation.isPending}
                      organizationId={organizationId}
                      permissions={permissions}
                      propertyActive={propertyActive}
                      propertyId={propertyId}
                      space={node}
                      depth={depth}
                      onCreate={handleCreate}
                      onBatchCreate={handleBatchCreate}
                      onDelete={handleDelete}
                      onMove={handleMove}
                      onSetStatus={handleStatus}
                      onUpdate={handleUpdate}
                    />
                  )}
                  rowRefs={rowRefs}
                  state={tree}
                />
                {errors.root ? (
                  <TableRow>
                    <TableCell className="text-destructive" colSpan={5}>
                      加载更多根空间失败
                      <Button
                        aria-label="重试加载更多根空间"
                        className="ml-2"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const page = childPage(treeRef.current, null);
                          if (page) void loadPage(null, page.page + 1);
                        }}
                      >
                        重试
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : null}
                {hasMoreChildren(tree, null) ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Button
                        aria-label="加载更多根空间"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const page = childPage(treeRef.current, null);
                          if (page) void loadPage(null, page.page + 1);
                        }}
                      >
                        加载更多
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : null}
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
  renderActions,
  rowRefs,
  state,
}: {
  errors: Record<string, boolean>;
  onLoadMore: (parentId: string | null) => void;
  onRetry: (parentId: string) => void;
  onToggle: (nodeId: string) => void;
  renderActions: (node: RentalSpaceNode, depth: number) => React.ReactNode;
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
              <TableCell className="text-destructive" colSpan={5}>
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
                <TableCell colSpan={5}>
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
          actions={renderActions(node, depth)}
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

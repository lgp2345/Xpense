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
import { FilterPanel } from "@/components/filter-panel";
import { LoadMoreButton } from "@/components/load-more-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
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
import { toast } from "@/lib/toast";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import {
  invalidateSpaceMutation,
  rentalKeys,
  rentalQueryOptions,
} from "../../../services/rental-query";
import { FilteredSpaceTable } from "./filtered-space-table";
import { SpaceActions } from "./space-actions";
import { SpaceBatchDialog } from "./space-batch-dialog";
import { SpaceFilters, type SpaceFiltersValue } from "./space-filters";
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
  onNavigateContract,
  filters,
  onFiltersChange,
}: {
  filters?: SpaceFiltersValue;
  onFiltersChange?: (filters: SpaceFiltersValue) => void;
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  propertyActive: boolean;
  propertyId: string;
  onNavigateContract?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const contractNavigation = useMutation({
    mutationFn: (space: RentalSpaceNode) =>
      queryClient.fetchQuery({
        ...rentalQueryOptions.contracts(api, organizationId, {
          propertyId,
          spaceId: space.id,
          currentOnly: true,
          page: 1,
          pageSize: 1,
        }),
        retry: false,
      }),
    retry: false,
  });
  const openSpaceContract = (space: RentalSpaceNode) =>
    contractNavigation.mutate(space, {
      onSuccess: (page) => {
        const contract = page.items[0];
        if (contract) onNavigateContract?.(contract.id);
      },
    });
  const [tree, setTree] = useState(createSpaceTreeState);
  const treeRef = useRef(tree);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [draftKeyword, setDraftKeyword] = useState(filters?.keyword ?? "");
  const [localFilters, setLocalFilters] = useState<SpaceFiltersValue>({});
  const activeFilters = filters ?? localFilters;
  const effectiveStatus = activeFilters.effectiveStatus;
  const leaseStatus = activeFilters.leaseStatus;
  const hasStatusFilters = Boolean(effectiveStatus || leaseStatus);
  const changeFilters = useCallback(
    (next: SpaceFiltersValue) => {
      if (onFiltersChange) onFiltersChange(next);
      else setLocalFilters(next);
    },
    [onFiltersChange],
  );
  const externalKeyword = filters ? (filters.keyword ?? "") : undefined;
  const lastExternalKeyword = useRef(externalKeyword);
  useEffect(() => {
    if (lastExternalKeyword.current === externalKeyword) return;
    lastExternalKeyword.current = externalKeyword;
    if (externalKeyword !== undefined) {
      setDraftKeyword(externalKeyword);
      setKeyword(externalKeyword);
    }
  }, [externalKeyword]);
  const [keyword, setKeyword] = useState(filters?.keyword ?? "");
  const [searchItems, setSearchItems] = useState<RentalSpaceSearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchLoadMoreError, setSearchLoadMoreError] = useState(false);
  const [locationResult, setLocationResult] = useState<RentalSpaceSearchResult | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "failure">(
    "idle",
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const canRead = permissions.includes("rental_spaces:read");
  const rootQuery = useQuery({
    ...rentalQueryOptions.children(api as RentalApi, organizationId, {
      propertyId,
      parentId: null,
      page: 1,
      pageSize: CHILD_PAGE_SIZE,
    }),
    enabled: canRead && Boolean(organizationId && propertyId),
    retry: false,
  });
  const searchScope = JSON.stringify([keyword, effectiveStatus, leaseStatus]);
  const searchScopeRef = useRef(searchScope);
  searchScopeRef.current = searchScope;
  const searchQuery = useQuery({
    ...rentalQueryOptions.search(api as RentalApi, organizationId, {
      propertyId,
      keyword,
      ...(effectiveStatus ? { isEffectivelyActive: effectiveStatus === "active" } : {}),
      ...(leaseStatus ? { leaseStatus } : {}),
      page: 1,
      pageSize: 20,
    }),
    enabled: canRead && (keyword.length > 0 || hasStatusFilters),
    retry: false,
  });
  useEffect(() => {
    if (canRead) return;
    const emptyTree = createSpaceTreeState();
    treeRef.current = emptyTree;
    setTree(emptyTree);
    setErrors({});
    setSearchItems([]);
    setSearchPage(1);
    setSearchLoadMoreError(false);
    setLocationResult(null);
    setLocationStatus("idle");
    queryClient.removeQueries({
      queryKey: rentalKeys.childrenRoot(organizationId, propertyId),
    });
    queryClient.removeQueries({
      queryKey: rentalKeys.searchRoot(organizationId, propertyId),
    });
  }, [canRead, organizationId, propertyId, queryClient]);
  useEffect(() => {
    if (!canRead || (!keyword && !hasStatusFilters) || !searchQuery.data) {
      setSearchItems([]);
      setSearchPage(1);
      setSearchLoadMoreError(false);
      return;
    }
    setSearchItems(searchQuery.data.items);
    setSearchPage(searchQuery.data.page);
    setSearchLoadMoreError(false);
  }, [canRead, keyword, hasStatusFilters, searchQuery.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed search scope invalidates pagination indicators
  useEffect(() => {
    setSearchLoadingMore(false);
    setSearchLoadMoreError(false);
  }, [searchScope]);

  async function loadMoreSearchResults() {
    if (!searchQuery.data || searchLoadingMore || searchItems.length >= searchQuery.data.total)
      return;
    const requestScope = searchScope;
    setSearchLoadingMore(true);
    try {
      const nextPage = searchPage + 1;
      const page = await queryClient.fetchQuery({
        ...rentalQueryOptions.search(api, organizationId, {
          propertyId,
          keyword,
          ...(effectiveStatus ? { isEffectivelyActive: effectiveStatus === "active" } : {}),
          ...(leaseStatus ? { leaseStatus } : {}),
          page: nextPage,
          pageSize: 20,
        }),
        retry: false,
      });
      if (requestScope !== searchScopeRef.current) return;
      setSearchItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of page.items) byId.set(item.id, item);
        return [...byId.values()];
      });
      setSearchPage(nextPage);
      setSearchLoadMoreError(false);
    } catch {
      if (requestScope === searchScopeRef.current) setSearchLoadMoreError(true);
    } finally {
      if (requestScope === searchScopeRef.current) setSearchLoadingMore(false);
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
    if (canRead && rootQuery.data)
      updateTree((current) => mergeChildPage(current, null, rootQuery.data));
  }, [canRead, rootQuery.data, updateTree]);

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
  const canCreate = canRead && propertyActive && permissions.includes("rental_spaces:create");
  const canActions =
    canRead &&
    permissions.some((permission) =>
      ["rental_spaces:create", "rental_spaces:update", "rental_spaces:delete"].includes(permission),
    );
  const renderActions = (node: RentalSpaceNode, depth: number) => (
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
  if (!canRead) {
    return (
      <section aria-labelledby="space-tree-heading" className="space-y-3">
        <div>
          <h2 id="space-tree-heading" className="font-medium text-lg">
            空间管理
          </h2>
        </div>
        <div className="space-y-2">
          <FilterPanel>
            <FieldLabel className="sr-only" htmlFor="space-search">
              搜索空间
            </FieldLabel>
            <Input
              id="space-search"
              placeholder="按名称或编码搜索空间"
              value={draftKeyword}
              onChange={(event) => setDraftKeyword(event.target.value)}
            />
          </FilterPanel>
        </div>
        <p className="bg-muted border rounded-lg text-sm text-muted-foreground p-3">
          你没有查看空间的权限。
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="space-tree-heading" className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h2 id="space-tree-heading" className="font-medium text-lg">
            空间管理
          </h2>
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
          className="border rounded-lg bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
        >
          {mutationError}
        </div>
      ) : null}
      {contractNavigation.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在打开空间合同...
        </p>
      ) : contractNavigation.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {contractNavigation.error instanceof ApiError && contractNavigation.error.status === 403
            ? "你没有查看此空间合同的权限。"
            : "打开空间合同失败，请再次点击租赁状态重试。"}
        </p>
      ) : contractNavigation.isSuccess && !contractNavigation.data.items.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          此空间暂无当前生效合同，请刷新后重试。
        </p>
      ) : null}
      <div className="space-y-2">
        <SpaceFilters
          keyword={keyword}
          effectiveStatus={effectiveStatus}
          leaseStatus={leaseStatus}
          onChange={(next) => {
            setDraftKeyword(next.keyword ?? "");
            setKeyword(next.keyword?.trim() ?? "");
            changeFilters(next);
            setLocationStatus("idle");
          }}
        />
        {!hasStatusFilters ? (
          <SpaceSearchResults
            error={searchQuery.isError}
            loadMoreError={searchLoadMoreError}
            isPending={searchQuery.isFetching}
            hasMore={Boolean(searchQuery.data && searchItems.length < searchQuery.data.total)}
            isLoadingMore={searchLoadingMore}
            items={searchItems}
            keyword={keyword}
            onLoadMore={() => void loadMoreSearchResults()}
            onRetryLoadMore={() => void loadMoreSearchResults()}
            onSelect={(result) => void selectSearchResult(result)}
          />
        ) : null}
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
      {hasStatusFilters ? (
        <FilteredSpaceTable
          items={searchItems}
          total={searchQuery.data?.total ?? 0}
          pending={searchQuery.isFetching && !searchQuery.data}
          error={searchQuery.isError}
          hasMore={Boolean(searchQuery.data && searchItems.length < searchQuery.data.total)}
          loadingMore={searchLoadingMore}
          loadMoreError={searchLoadMoreError}
          canActions={canActions}
          renderActions={renderActions}
          onViewContracts={
            permissions.includes("rental_contracts:read") && onNavigateContract
              ? openSpaceContract
              : undefined
          }
          onLoadMore={() => void loadMoreSearchResults()}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : rootQuery.isPending ? (
        <Card>
          <CardContent className="space-y-2 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载空间...</span>
          </CardContent>
        </Card>
      ) : rootQuery.isError ? (
        <div
          role="alert"
          className="border rounded-lg bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
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
        <p className="text-center text-sm text-muted-foreground py-8">当前房产没有空间。</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>空间</TableHead>
                  <TableHead className="hidden sm:table-cell">类型</TableHead>
                  <TableHead className="hidden sm:table-cell">有效状态</TableHead>
                  <TableHead className="hidden sm:table-cell">租赁状态</TableHead>
                  <TableHead className="hidden sm:table-cell">出租属性</TableHead>
                  {canActions ? <TableHead className="text-right">操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TreeRows
                  columnCount={5 + Number(canActions)}
                  errors={errors}
                  onLoadMore={(parentId) => {
                    const page = childPage(treeRef.current, parentId);
                    if (page) void loadPage(parentId, page.page + 1);
                  }}
                  onRetry={(parentId) => void loadPage(parentId, 1)}
                  onToggle={(nodeId) => void toggle(nodeId)}
                  renderActions={renderActions}
                  onViewContracts={
                    permissions.includes("rental_contracts:read") && onNavigateContract
                      ? openSpaceContract
                      : undefined
                  }
                  rowRefs={rowRefs}
                  state={tree}
                />
                {errors.root ? (
                  <TableRow>
                    <TableCell className="text-destructive" colSpan={5 + Number(canActions)}>
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
                    <TableCell colSpan={5 + Number(canActions)}>
                      <LoadMoreButton
                        aria-label="加载更多根空间"
                        size="sm"
                        onClick={() => {
                          const page = childPage(treeRef.current, null);
                          if (page) void loadPage(null, page.page + 1);
                        }}
                      >
                        加载更多
                      </LoadMoreButton>
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
  columnCount,
  errors,
  onLoadMore,
  onRetry,
  onToggle,
  renderActions,
  onViewContracts,
  rowRefs,
  state,
}: {
  columnCount: number;
  errors: Record<string, boolean>;
  onLoadMore: (parentId: string | null) => void;
  onRetry: (parentId: string) => void;
  onToggle: (nodeId: string) => void;
  onViewContracts?: (node: RentalSpaceNode) => void;
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
              <TableCell className="text-destructive" colSpan={columnCount}>
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
                <TableCell colSpan={columnCount}>
                  <LoadMoreButton size="sm" onClick={() => onLoadMore(id)}>
                    加载更多
                  </LoadMoreButton>
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
          onViewContracts={onViewContracts ? () => onViewContracts(node) : undefined}
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

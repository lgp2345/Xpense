import { useQuery } from "@tanstack/react-query";
import type { RentalSpaceNode } from "@xpense/shared";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { LoadMoreButton } from "@/components/load-more-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RentalApi } from "../../../../services/rental-api";
import { rentalQueryOptions } from "../../../../services/rental-query";

export type SpaceWithPath = RentalSpaceNode & { path?: { id: string; name: string }[] };

const leaseLabels = {
  vacant: "空置",
  upcoming: "即将起租",
  active: "出租中",
  expiring_soon: "即将到期",
};

export function spaceLabel(space: SpaceWithPath): string {
  return [
    ...(space.path ?? []).filter((node) => node.id !== space.id).map((node) => node.name),
    space.name,
  ].join(" / ");
}

export type SpaceBranchCache = Map<
  string,
  {
    page: number;
    pages: Record<number, SpaceWithPath[]>;
  }
>;

type TreeProps = {
  branchCache: SpaceBranchCache;
  api: RentalApi;
  organizationId: string;
  propertyId: string;
  expanded: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onLoaded: (items: SpaceWithPath[]) => void;
  selected: ReadonlySet<string>;
  reasonFor: (space: SpaceWithPath) => string;
  onToggle: (space: SpaceWithPath) => void;
};

export function ContractSpaceList({
  items,
  search = false,
  ...props
}: TreeProps & {
  items: SpaceWithPath[];
  search?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      {items.map((space) => (
        <SpaceRow key={space.id} space={space} search={search} {...props} />
      ))}
    </div>
  );
}

function SpaceRow({
  space,
  search,
  ...props
}: TreeProps & { space: SpaceWithPath; search: boolean }) {
  const contentId = useId();
  const expanded = props.expanded.has(space.id);
  const selected = props.selected.has(space.id);
  const reason = selected ? "" : props.reasonFor(space);
  return (
    <div className="min-w-0">
      <div
        data-testid={`space-option-${space.id}`}
        className={`flex min-w-0 items-start justify-between gap-3 rounded-md px-3 py-3 ${selected ? "bg-accent" : "hover:bg-muted/50"}`}
      >
        <div className="min-w-0 flex-1">
          {!search && space.hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "收起" : "展开"} ${space.name}`}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => props.onExpand(space.id)}
              className="flex max-w-full items-start gap-2 rounded-sm text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                aria-hidden="true"
                className={`mt-0.5 size-4 shrink-0 ${expanded ? "rotate-90" : ""}`}
              />
              <span className="break-words">{space.name}</span>
            </button>
          ) : (
            <p className="break-words text-sm font-medium">
              {search ? spaceLabel(space) : space.name}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{leaseLabels[space.leaseStatus]}</Badge>
            {space.hasUpcomingContract ? <Badge variant="secondary">即将有合同</Badge> : null}
            {!search && space.hasChildren ? (
              <span className="text-xs text-muted-foreground">可展开查看子空间</span>
            ) : null}
          </div>
          {reason ? (
            <p id={`space-reason-${space.id}`} className="mt-1.5 text-xs text-muted-foreground">
              {reason}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant={selected ? "default" : "outline"}
          className="shrink-0"
          disabled={Boolean(reason)}
          aria-label={selected ? `移除 ${space.name}` : undefined}
          aria-describedby={reason ? `space-reason-${space.id}` : undefined}
          onClick={() => props.onToggle(space)}
        >
          {selected ? "移除" : "选择"}
        </Button>
      </div>
      {!search && space.hasChildren && expanded ? (
        <div id={contentId} className="ml-3 border-l pl-2 sm:ml-5 sm:pl-3">
          <SpaceChildren parent={space} {...props} />
        </div>
      ) : null}
    </div>
  );
}

function SpaceChildren({ parent, ...props }: TreeProps & { parent: SpaceWithPath }) {
  const [page, setPage] = useState(() => props.branchCache.get(parent.id)?.page ?? 1);
  const [pages, setPages] = useState<Record<number, SpaceWithPath[]>>(
    () => props.branchCache.get(parent.id)?.pages ?? {},
  );
  const query = useQuery({
    ...rentalQueryOptions.children(props.api, props.organizationId, {
      propertyId: props.propertyId,
      parentId: parent.id,
      page,
      pageSize: 50,
    }),
    retry: false,
  });
  const path = useMemo(
    () => [
      ...(parent.path ?? []).filter((node) => node.id !== parent.id),
      { id: parent.id, name: parent.name },
    ],
    [parent.path, parent.id, parent.name],
  );
  const loaded = useMemo(
    () =>
      query.data?.items.map((item) => ({
        ...item,
        path: [...path, { id: item.id, name: item.name }],
      })),
    [query.data, path],
  );
  const { onLoaded, branchCache } = props;
  useEffect(() => {
    if (!loaded) return;
    onLoaded(loaded);
    const next = { ...branchCache.get(parent.id)?.pages, [page]: loaded };
    branchCache.set(parent.id, { page, pages: next });
    setPages(next);
  }, [loaded, onLoaded, page, branchCache, parent.id]);
  const items = Object.values(pages).flat();
  return (
    <>
      <ContractSpaceList items={items} {...props} />
      {query.isLoading ? (
        <div role="status" className="space-y-2 p-3">
          <span className="sr-only">正在加载子空间</span>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}
      {query.isError ? (
        <div role="alert" className="p-3 text-sm">
          子空间加载失败，请重试。
          <Button type="button" variant="link" onClick={() => void query.refetch()}>
            重试子空间
          </Button>
        </div>
      ) : null}
      {query.isSuccess && !items.length ? (
        <p role="status" className="p-3 text-sm text-muted-foreground">
          暂无子空间。
        </p>
      ) : null}
      {query.data && query.data.page * query.data.pageSize < query.data.total ? (
        <LoadMoreButton pending={query.isFetching} onClick={() => setPage(page + 1)}>
          加载更多子空间
        </LoadMoreButton>
      ) : null}
    </>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { PermissionKey, RentalPropertySummary, RentalSpaceNode } from "@xpense/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RentalApi } from "../../../../services/rental-api";
import { rentalQueryOptions } from "../../../../services/rental-query";
import type { ContractFormValues } from "../contract-form-schema";

type SpaceWithPath = RentalSpaceNode & { path?: { id: string; name: string }[] };
const unresolvedSelectedSpaceMessage = "存在未解析的已选空间，请先搜索解析或移除后再新增";

export function ContractSpacesStep({
  api,
  organizationId,
  permissions,
  values,
  onChange,
  showPropertySelector = true,
  seedSpaceIds,
}: {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  values: ContractFormValues;
  onChange: (values: ContractFormValues) => void;
  showPropertySelector?: boolean;
  seedSpaceIds?: string[];
}) {
  const [keyword, setKeyword] = useState("");
  const [childrenPage, setChildrenPage] = useState(1);
  const [searchPage, setSearchPage] = useState(1);
  const [childrenItems, setChildrenItems] = useState<SpaceWithPath[]>([]);
  const [searchItems, setSearchItems] = useState<SpaceWithPath[]>([]);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const registry = useRef(new Map<string, SpaceWithPath>());
  const scopeRef = useRef(`${organizationId}:${values.propertyId}`);
  const seededRef = useRef(new Set<string>());
  const ignoredSeedRef = useRef(new Set<string>());

  const propertyList = useQuery({
    ...rentalQueryOptions.properties(api, organizationId, {
      isActive: true,
      page: 1,
      pageSize: 50,
    }),
    enabled: Boolean(
      showPropertySelector && permissions.includes("rental_properties:read") && api.listProperties,
    ),
    retry: false,
  });
  const propertyDetail = useQuery({
    ...rentalQueryOptions.property(api, organizationId, values.propertyId),
    enabled: Boolean(
      showPropertySelector &&
        values.propertyId &&
        permissions.includes("rental_properties:read") &&
        api.getProperty,
    ),
    retry: false,
  });
  const children = useQuery({
    ...rentalQueryOptions.children(api, organizationId, {
      propertyId: values.propertyId,
      parentId: null,
      page: childrenPage,
      pageSize: 50,
    }),
    enabled: Boolean(values.propertyId && permissions.includes("rental_spaces:read")),
    retry: false,
  });
  const search = useQuery({
    ...rentalQueryOptions.search(api, organizationId, {
      propertyId: values.propertyId,
      keyword,
      page: searchPage,
      pageSize: 20,
    }),
    enabled: Boolean(
      values.propertyId && keyword.trim() && permissions.includes("rental_spaces:read"),
    ),
    retry: false,
  });

  useEffect(() => {
    const scope = `${organizationId}:${values.propertyId}`;
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    registry.current.clear();
    seededRef.current.clear();
    ignoredSeedRef.current.clear();
    setChildrenItems([]);
    setSearchItems([]);
    setChildrenPage(1);
    setSearchPage(1);
    setSeedMessage(null);
  }, [organizationId, values.propertyId]);

  useEffect(() => {
    const pageItems = (children.data?.items ?? []) as SpaceWithPath[];
    if (!children.data) return;
    for (const item of pageItems) upsertSpace(registry.current, item);
    setChildrenItems((current) => mergeSpaces(childrenPage === 1 ? [] : current, pageItems));
  }, [children.data, childrenPage]);

  useEffect(() => {
    const pageItems = (search.data?.items ?? []) as SpaceWithPath[];
    if (!search.data) return;
    for (const item of pageItems) upsertSpace(registry.current, item);
    setSearchItems((current) => mergeSpaces(searchPage === 1 ? [] : current, pageItems));
  }, [search.data, searchPage]);

  useEffect(() => {
    if (!seedSpaceIds?.length || !children.data || childrenPage !== 1) return;
    const unresolved: string[] = [];
    const verified: SpaceWithPath[] = [];
    for (const id of seedSpaceIds) {
      if (seededRef.current.has(id) || ignoredSeedRef.current.has(id)) continue;
      const candidate = registry.current.get(id);
      if (!candidate) {
        unresolved.push(id);
        ignoredSeedRef.current.add(id);
        continue;
      }
      const conflict = values.spaces.some((selected) =>
        isSpaceConflict(candidate, registry.current.get(selected.spaceId)),
      );
      if (
        candidate.propertyId !== values.propertyId ||
        !candidate.isRentable ||
        !candidate.isEffectivelyActive ||
        restrictionReason(candidate) ||
        conflict
      ) {
        ignoredSeedRef.current.add(id);
        unresolved.push(id);
        continue;
      }
      seededRef.current.add(id);
      verified.push(candidate);
    }
    if (verified.length) {
      onChange({
        ...values,
        spaces: [
          ...values.spaces,
          ...verified
            .filter((item) => !values.spaces.some((selected) => selected.spaceId === item.id))
            .map((item) => ({ spaceId: item.id, rentAllocationText: "" })),
        ],
      });
    }
    if (unresolved.length)
      setSeedMessage("无法验证，已忽略部分空间；深层空间不会自动恢复，请手动搜索并选择。");
  }, [children.data, childrenPage, onChange, seedSpaceIds, values]);

  const selected = useMemo(
    () => new Set(values.spaces.map((item) => item.spaceId)),
    [values.spaces],
  );
  const hasUnresolvedSelectedSpace = values.spaces.some(
    (item) => !registry.current.has(item.spaceId),
  );
  const items = keyword.trim() ? searchItems : childrenItems;
  const activeQuery = keyword.trim() ? search : children;
  const activePage = keyword.trim() ? searchPage : childrenPage;
  const canLoadMore = Boolean(
    activeQuery.data && activeQuery.data.page * activeQuery.data.pageSize < activeQuery.data.total,
  );
  const propertyItems = (propertyList.data?.items ?? []) as RentalPropertySummary[];
  const propertyName =
    propertyDetail.data?.name ??
    propertyItems.find((property) => property.id === values.propertyId)?.name;
  const propertyInactive = Boolean(
    showPropertySelector && propertyDetail.data && !propertyDetail.data.isActive,
  );

  useEffect(() => {
    if (!propertyInactive || !values.propertyId) return;
    onChange({ ...values, propertyId: "", spaces: [] });
  }, [onChange, propertyInactive, values]);

  function toggle(space: SpaceWithPath) {
    if (selected.has(space.id)) {
      onChange({ ...values, spaces: values.spaces.filter((item) => item.spaceId !== space.id) });
      return;
    }
    if (hasUnresolvedSelectedSpace) return;
    const reason = restrictionReason(space);
    if (
      reason ||
      values.spaces.some((item) => isSpaceConflict(space, registry.current.get(item.spaceId)))
    )
      return;
    onChange({
      ...values,
      spaces: [...values.spaces, { spaceId: space.id, rentAllocationText: "" }],
    });
  }

  function retrySpaces() {
    ignoredSeedRef.current.clear();
    setSeedMessage(null);
    void activeQuery.refetch();
  }

  return (
    <section aria-labelledby="contract-spaces-title" className="space-y-4">
      <h2 id="contract-spaces-title" className="text-lg font-medium">
        选择房产与空间
      </h2>
      {showPropertySelector ? (
        <label className="grid gap-2 text-sm" htmlFor="contract-property">
          房产
          <select
            id="contract-property"
            aria-label="房产"
            className="h-9 rounded-md border bg-background px-3"
            value={values.propertyId}
            onChange={(event) =>
              onChange({ ...values, propertyId: event.target.value, spaces: [] })
            }
          >
            <option value="">请选择启用房产</option>
            {propertyItems
              .filter((property) => property.isActive)
              .map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {propertyInactive ? <p role="alert">该房产已停用，无法创建合同。</p> : null}
      {propertyDetail.isError ? <p role="alert">房产验证失败，请重试加载。</p> : null}
      {values.propertyId ? (
        <p className="text-sm text-muted-foreground">
          已选择房产：{propertyName ?? values.propertyId}
        </p>
      ) : null}
      {!permissions.includes("rental_properties:read") ? (
        <p className="text-sm text-muted-foreground">你没有查看房产的权限。</p>
      ) : null}
      {values.propertyId ? (
        <>
          <p className="text-sm text-muted-foreground">
            已选择 {values.spaces.length} 个空间；服务端会在保存与确认时再次校验归属和占用。
          </p>
          <label className="grid gap-2 text-sm" htmlFor="space-search">
            搜索空间
            <Input
              id="space-search"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setSearchPage(1);
                setSearchItems([]);
              }}
              placeholder="输入空间名称或编码"
            />
          </label>
          {seedMessage ? (
            <p role="status" aria-live="polite">
              {seedMessage}
            </p>
          ) : null}
          {activeQuery.isLoading ? (
            <p role="status" aria-live="polite">
              正在加载空间…
            </p>
          ) : null}
          {activeQuery.isError ? (
            <div role="alert">
              空间加载失败，请重试。{" "}
              <Button type="button" variant="link" onClick={retrySpaces}>
                重试
              </Button>
            </div>
          ) : null}
          {!permissions.includes("rental_spaces:read") ? (
            <p className="text-sm text-muted-foreground">你没有查看空间的权限。</p>
          ) : !activeQuery.isLoading && !activeQuery.isError && !items.length ? (
            <p role="status" aria-live="polite">
              未找到空间。
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((space) => {
                const selectedSpace = selected.has(space.id);
                const conflict =
                  !selectedSpace &&
                  values.spaces.some((item) =>
                    isSpaceConflict(space, registry.current.get(item.spaceId)),
                  );
                const reason = selectedSpace
                  ? ""
                  : hasUnresolvedSelectedSpace
                    ? unresolvedSelectedSpaceMessage
                    : restrictionReason(space) ||
                      (conflict ? "已选父级或子级空间，不能同时选择" : "");
                return (
                  <div
                    key={space.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`space-option-${space.id}`}
                  >
                    <div>
                      <p className="font-medium">{space.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">{space.leaseStatus}</Badge>
                        {space.hasUpcomingContract ? (
                          <Badge variant="secondary">即将有合同</Badge>
                        ) : null}
                      </div>
                      {reason ? (
                        <p
                          id={`space-reason-${space.id}`}
                          className="mt-1 text-xs text-muted-foreground"
                        >
                          {reason}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedSpace ? "default" : "outline"}
                      disabled={!selectedSpace && Boolean(reason)}
                      aria-describedby={reason ? `space-reason-${space.id}` : undefined}
                      onClick={() => toggle(space)}
                    >
                      {selectedSpace ? `移除 ${space.name}` : "选择"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {canLoadMore ? (
            <Button
              type="button"
              variant="outline"
              disabled={activeQuery.isFetching}
              onClick={() =>
                keyword.trim() ? setSearchPage(activePage + 1) : setChildrenPage(activePage + 1)
              }
            >
              加载更多空间
            </Button>
          ) : null}
          {values.spaces.length ? (
            <fieldset aria-label="已选空间" className="space-y-2">
              <legend className="text-sm font-medium">已选空间</legend>
              {values.spaces.map((item) => {
                const registered = registry.current.get(item.spaceId);
                const name = registered?.name ?? item.spaceId;
                return (
                  <div
                    key={item.spaceId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      {name}
                      {registered?.path?.length
                        ? `（${registered.path.map((node) => node.name).join(" / ")}）`
                        : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          ...values,
                          spaces: values.spaces.filter(
                            (current) => current.spaceId !== item.spaceId,
                          ),
                        })
                      }
                    >
                      移除
                    </Button>
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          {values.spaces.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">已选空间租金分摊（可选）</legend>
              {values.spaces.map((item) => {
                const registered = registry.current.get(item.spaceId);
                return (
                  <label
                    key={item.spaceId}
                    className="grid gap-1 text-sm"
                    htmlFor={`allocation-${item.spaceId}`}
                  >
                    <span>
                      空间 {item.spaceId}
                      {registered?.name ? ` · ${registered.name}` : ""}
                      {registered?.path?.length
                        ? `（${registered.path.map((node) => node.name).join(" / ")}）`
                        : ""}
                    </span>
                    <Input
                      id={`allocation-${item.spaceId}`}
                      aria-label={`空间 ${item.spaceId}`}
                      inputMode="decimal"
                      value={item.rentAllocationText}
                      onChange={(event) =>
                        onChange({
                          ...values,
                          spaces: values.spaces.map((current) =>
                            current.spaceId === item.spaceId
                              ? { ...current, rentAllocationText: event.target.value }
                              : current,
                          ),
                        })
                      }
                      placeholder="留空表示不分摊"
                    />
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function isSpaceConflict(
  candidate: SpaceWithPath,
  selected: SpaceWithPath | undefined,
): boolean {
  if (!selected || candidate.id === selected.id) return false;
  const candidateAncestors = new Set([
    candidate.parentId,
    ...(candidate.path ?? []).map((node) => node.id),
  ]);
  const selectedAncestors = new Set([
    selected.parentId,
    ...(selected.path ?? []).map((node) => node.id),
  ]);
  return candidateAncestors.has(selected.id) || selectedAncestors.has(candidate.id);
}

function mergeSpaces(current: SpaceWithPath[], next: SpaceWithPath[]): SpaceWithPath[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of next) {
    const previous = merged.get(item.id);
    merged.set(
      item.id,
      previous && !item.path?.length ? { ...previous, ...item, path: previous.path } : item,
    );
  }
  return [...merged.values()];
}

function upsertSpace(registry: Map<string, SpaceWithPath>, item: SpaceWithPath): void {
  const previous = registry.get(item.id);
  registry.set(
    item.id,
    previous && !item.path?.length ? { ...previous, ...item, path: previous.path } : item,
  );
}

function restrictionReason(space: RentalSpaceNode): string {
  if (!space.isRentable) return "该空间未标记为可出租";
  if (!space.isEffectivelyActive) return "该空间自身或上级已停用";
  if (space.leaseBlockedReason === "ancestor_contract") return "上级空间已有合同";
  if (space.leaseBlockedReason === "descendant_contract") return "下级空间已有合同";
  return "";
}

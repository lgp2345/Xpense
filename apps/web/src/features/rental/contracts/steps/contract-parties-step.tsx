import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalTenantSummary } from "@xpense/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../../services/api-client";
import type { RentalApi } from "../../../../services/rental-api";
import { invalidateTenantMutation, rentalQueryOptions } from "../../../../services/rental-query";
import type { ContractFormValues } from "../contract-form-schema";

const tenantServiceUnavailableMessage = "租户创建服务不可用";
const tenantAlreadyExistsMessage = "租户已存在";

class TenantServiceUnavailableError extends Error {
  constructor() {
    super(tenantServiceUnavailableMessage);
    this.name = "TenantServiceUnavailableError";
  }
}

export function ContractPartiesStep({
  api,
  organizationId,
  permissions,
  values,
  onChange,
}: {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  values: ContractFormValues;
  onChange: (values: ContractFormValues) => void;
}) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RentalTenantSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const registry = useRef(new Map<string, RentalTenantSummary>());
  const organizationRef = useRef(organizationId);
  const query = useQuery({
    ...rentalQueryOptions.tenants(api, organizationId, { keyword, page, pageSize: 20 }),
    enabled: permissions.includes("rental_tenants:read"),
    retry: false,
  });

  useEffect(() => {
    if (organizationRef.current === organizationId) return;
    organizationRef.current = organizationId;
    registry.current.clear();
    setItems([]);
    setPage(1);
  }, [organizationId]);
  useEffect(() => {
    if (!query.data) return;
    for (const tenant of query.data.items) registry.current.set(tenant.id, tenant);
    setItems((current) => mergeTenants(page === 1 ? [] : current, query.data.items));
  }, [page, query.data]);

  const selected = useMemo(
    () => new Set(values.parties.map((party) => party.tenantId)),
    [values.parties],
  );
  const selectedTenants = values.parties.map((party) => registry.current.get(party.tenantId));
  const canLoadMore = Boolean(
    query.data && query.data.page * query.data.pageSize < query.data.total,
  );
  const create = useMutation({
    mutationFn: () =>
      api.createTenant?.({ type: "individual", name: newName.trim() }) ??
      Promise.reject(new TenantServiceUnavailableError()),
    onSuccess: async (tenant) => {
      registry.current.set(tenant.id, tenant);
      await invalidateTenantMutation(queryClient, organizationId, tenant.id, "create");
      if (!values.parties.some((party) => party.tenantId === tenant.id))
        onChange({
          ...values,
          parties: [
            ...values.parties,
            { tenantId: tenant.id, isPrimaryPayer: values.parties.length === 0 },
          ],
        });
      setNewName("");
      setCreateError(null);
    },
    onError: (cause) => setCreateError(tenantCreateErrorMessage(cause)),
  });

  function toggle(tenant: RentalTenantSummary) {
    if (!tenant.isActive && !selected.has(tenant.id)) return;
    if (selected.has(tenant.id)) {
      removeParty(tenant.id);
      return;
    }
    onChange({
      ...values,
      parties: [
        ...values.parties,
        { tenantId: tenant.id, isPrimaryPayer: values.parties.length === 0 },
      ],
    });
  }

  function removeParty(tenantId: string) {
    const remaining = values.parties.filter((party) => party.tenantId !== tenantId);
    const first = remaining[0];
    if (first && !remaining.some((party) => party.isPrimaryPayer))
      remaining[0] = { ...first, isPrimaryPayer: true };
    onChange({ ...values, parties: remaining });
  }

  return (
    <section aria-labelledby="contract-parties-title" className="space-y-4">
      <h2 id="contract-parties-title" className="text-lg font-medium">
        选择承租方
      </h2>
      <label className="grid gap-2 text-sm" htmlFor="tenant-search">
        搜索租户
        <Input
          id="tenant-search"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
            setItems([]);
          }}
        />
      </label>
      {!permissions.includes("rental_tenants:read") ? (
        <p className="text-sm text-muted-foreground">你没有查看租户的权限。</p>
      ) : query.isLoading ? (
        <p role="status" aria-live="polite">
          正在加载租户…
        </p>
      ) : query.isError ? (
        <div role="alert">
          租户加载失败，请重试。{" "}
          <Button type="button" variant="link" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : !items.length ? (
        <p role="status" aria-live="polite">
          未找到租户。
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((tenant) => {
            const isSelected = selected.has(tenant.id);
            return (
              <div
                key={tenant.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tenant.type === "company" ? "企业" : "个人"}
                    {!tenant.isActive ? " · 已停用" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  disabled={!tenant.isActive && !isSelected}
                  onClick={() => toggle(tenant)}
                >
                  {isSelected ? "已选择" : tenant.isActive ? "选择" : "不可用"}
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
          disabled={query.isFetching}
          onClick={() => setPage((current) => current + 1)}
        >
          加载更多租户
        </Button>
      ) : null}
      {selectedTenants.length ? (
        <fieldset className="grid gap-2" aria-label="已选承租方">
          <legend className="text-sm font-medium">已选承租方</legend>
          {values.parties.map((party, index) => {
            const name = selectedTenants[index]?.name ?? party.tenantId;
            return (
              <div key={party.tenantId} className="flex items-center justify-between text-sm">
                <span>
                  {name}
                  {!selectedTenants[index]?.isActive ? " · 已停用" : ""}
                </span>
                <Button type="button" variant="ghost" onClick={() => removeParty(party.tenantId)}>
                  移除
                </Button>
              </div>
            );
          })}
        </fieldset>
      ) : null}
      {permissions.includes("rental_tenants:create") ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              aria-label="新租户名称"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="快速新增租户"
            />
            <Button
              type="button"
              disabled={!newName.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              新增租户
            </Button>
          </div>
          {createError ? (
            <p role="alert" className="text-sm text-destructive">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">主付款人</legend>
        {values.parties.map((party) => (
          <label
            key={party.tenantId}
            className="flex items-center gap-2 text-sm"
            htmlFor={`payer-${party.tenantId}`}
          >
            <input
              id={`payer-${party.tenantId}`}
              type="radio"
              name="primary-payer"
              checked={party.isPrimaryPayer}
              onChange={() =>
                onChange({
                  ...values,
                  parties: values.parties.map((current) => ({
                    ...current,
                    isPrimaryPayer: current.tenantId === party.tenantId,
                  })),
                })
              }
            />
            {tenantName(party.tenantId, registry.current)}
          </label>
        ))}
      </fieldset>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {values.parties.length} 位承租方，主付款人{" "}
        {values.parties.filter((party) => party.isPrimaryPayer).length} 位
      </p>
    </section>
  );
}

function mergeTenants(
  current: RentalTenantSummary[],
  next: RentalTenantSummary[],
): RentalTenantSummary[] {
  const merged = new Map(current.map((tenant) => [tenant.id, tenant]));
  for (const tenant of next) merged.set(tenant.id, tenant);
  return [...merged.values()];
}

function tenantName(id: string, registry: Map<string, RentalTenantSummary>): string {
  return registry.get(id)?.name ?? id;
}

function tenantCreateErrorMessage(cause: unknown): string {
  if (cause instanceof TenantServiceUnavailableError) return tenantServiceUnavailableMessage;
  if (cause instanceof ApiError && cause.status === 409) return tenantAlreadyExistsMessage;
  if (cause instanceof Error && cause.message === tenantAlreadyExistsMessage)
    return tenantAlreadyExistsMessage;
  return "租户创建失败，请重试。";
}

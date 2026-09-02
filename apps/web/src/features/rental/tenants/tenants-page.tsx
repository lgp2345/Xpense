import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRentalTenantRequest,
  PermissionKey,
  RentalTenantSummary,
  SetRentalTenantStatusRequest,
  UpdateRentalTenantRequest,
} from "@xpense/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ApiError } from "../../../services/api-client";
import type { ListRentalTenantsQuery, RentalApi } from "../../../services/rental-api";
import {
  invalidateDeletedTenantMutation,
  invalidateTenantMutation,
  normalizeRentalTenantsQuery,
  rentalQueryOptions,
} from "../../../services/rental-query";
import { TenantCards } from "./tenant-cards";
import { TenantFilters } from "./tenant-filters";
import { TenantFormDialog } from "./tenant-form-dialog";
import { TenantTable } from "./tenant-table";

export type TenantsPageProps = {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  search: ListRentalTenantsQuery;
  onSearchChange: (search: ListRentalTenantsQuery) => void;
  onNavigate: (tenantId: string) => void;
};

export function TenantsPage({
  api,
  organizationId,
  permissions,
  search,
  onSearchChange,
  onNavigate,
}: TenantsPageProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const canRead = permissions.includes("rental_tenants:read");
  const canCreate = permissions.includes("rental_tenants:create");
  const canUpdate = permissions.includes("rental_tenants:update");
  const canDelete = permissions.includes("rental_tenants:delete");
  const normalizedSearch = normalizeRentalTenantsQuery(search);
  const [editingTenant, setEditingTenant] = useState<RentalTenantSummary | null>(null);
  const tenantsQuery = useQuery({
    ...rentalQueryOptions.tenants(api, organizationId, normalizedSearch),
    enabled: canRead && Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
  const createMutation = useMutation({
    mutationFn: (input: CreateRentalTenantRequest) =>
      api.createTenant?.(input) ?? Promise.reject(new Error("租客创建不可用")),
    onSuccess: () => invalidateTenantMutation(queryClient, organizationId, "", "create"),
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpdateRentalTenantRequest) =>
      api.updateTenant?.(input) ?? Promise.reject(new Error("租客更新不可用")),
    onSuccess: (_, input) =>
      invalidateTenantMutation(queryClient, organizationId, input.id, "update"),
  });
  const statusMutation = useMutation({
    mutationFn: (input: SetRentalTenantStatusRequest) =>
      api.setTenantStatus?.(input) ?? Promise.reject(new Error("租客状态不可用")),
    onSuccess: (_, input) =>
      invalidateTenantMutation(queryClient, organizationId, input.id, "status"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.deleteTenant?.(id) ?? Promise.reject(new Error("租客删除不可用")),
    onSuccess: (_, id) => invalidateDeletedTenantMutation(queryClient, organizationId, id),
  });
  if (!canRead)
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <p className="rounded-lg border border-muted-foreground/20 bg-muted p-4 text-sm text-muted-foreground">
          你没有查看租客的权限。
        </p>
      </main>
    );
  const items = tenantsQuery.data?.items ?? [];
  const hasData = Boolean(tenantsQuery.data);
  const forbiddenError =
    tenantsQuery.isError &&
    tenantsQuery.error instanceof ApiError &&
    tenantsQuery.error.status === 403;
  const listError =
    tenantsQuery.isError && !forbiddenError ? safeQueryError(tenantsQuery.error) : null;
  const mutationError = mutationErrorMessage([
    createMutation.error,
    updateMutation.error,
    statusMutation.error,
    deleteMutation.error,
  ]);
  const errorMessage = listError ?? mutationError;
  const mutationsPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    statusMutation.isPending ||
    deleteMutation.isPending;
  async function handleCreate(input: CreateRentalTenantRequest) {
    if (!canCreate) return;
    await createMutation.mutateAsync(input);
  }
  async function handleUpdate(input: UpdateRentalTenantRequest) {
    if (!canUpdate) return;
    await updateMutation.mutateAsync(input);
  }
  async function handleStatus(tenant: RentalTenantSummary) {
    if (!canUpdate) return;
    await statusMutation.mutateAsync({ id: tenant.id, isActive: !tenant.isActive });
  }
  async function handleDelete(tenant: RentalTenantSummary) {
    if (!canDelete) return;
    await deleteMutation.mutateAsync(tenant.id);
  }
  const actions = {
    canDelete,
    canUpdate,
    deleting: deleteMutation.isPending,
    onEdit: setEditingTenant,
    onSetStatus: (tenant: RentalTenantSummary) => void handleStatus(tenant),
    onDelete: handleDelete,
  };
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">租客管理</h1>
          <p className="text-sm text-muted-foreground">维护租客资料、状态和脱敏身份摘要</p>
        </div>
        {canCreate ? <TenantFormDialog onCreate={handleCreate} /> : null}
      </header>
      <TenantFilters search={normalizedSearch} onApply={onSearchChange} />
      {forbiddenError ? (
        <p
          role="alert"
          className="rounded-lg border border-muted-foreground/20 bg-muted p-4 text-sm text-muted-foreground"
        >
          你没有查看租客的权限。
        </p>
      ) : errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorMessage}
          {listError ? (
            <Button
              variant="link"
              className="ml-2 px-0"
              onClick={() => void tenantsQuery.refetch()}
            >
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      {forbiddenError ? null : tenantsQuery.isPending && !hasData ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载租客...</span>
          </CardContent>
        </Card>
      ) : tenantsQuery.isError && !hasData ? null : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有匹配的租客。</p>
      ) : isMobile ? (
        <TenantCards items={items} onNavigate={onNavigate} {...actions} />
      ) : (
        <TenantTable items={items} onNavigate={onNavigate} {...actions} />
      )}
      {tenantsQuery.isFetching && hasData ? (
        <p className="text-right text-xs text-muted-foreground" aria-live="polite">
          正在更新列表...
        </p>
      ) : null}
      {!forbiddenError && tenantsQuery.data && (items.length > 0 || tenantsQuery.data.page > 1) ? (
        <Pagination
          page={tenantsQuery.data.page}
          pageSize={tenantsQuery.data.pageSize}
          total={tenantsQuery.data.total}
          pending={tenantsQuery.isFetching || mutationsPending}
          search={normalizedSearch}
          onChange={onSearchChange}
        />
      ) : null}
      {editingTenant ? (
        <TenantFormDialog
          key={editingTenant.id}
          mode="edit"
          hideTrigger
          open
          tenant={editingTenant}
          loadDetail={
            api.tenantDetail
              ? () =>
                  api.tenantDetail?.(editingTenant.id) as Promise<
                    import("@xpense/shared").RentalTenantDetail
                  >
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) setEditingTenant(null);
          }}
          onUpdate={async (input) => {
            await handleUpdate(input);
            setEditingTenant(null);
          }}
        />
      ) : null}
    </main>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  pending,
  search,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  search: ListRentalTenantsQuery;
  onChange: (search: ListRentalTenantsQuery) => void;
}) {
  const hasPrevious = page > 1;
  const hasNext = page * pageSize < total;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span>
        第 {page} 页，共 {total} 个租客
      </span>
      {pending ? <span aria-live="polite">加载中</span> : null}
      <Button
        variant="outline"
        disabled={!hasPrevious || pending}
        onClick={() => onChange({ ...search, page: page - 1, pageSize })}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={!hasNext || pending}
        onClick={() => onChange({ ...search, page: page + 1, pageSize })}
      >
        下一页
      </Button>
    </div>
  );
}

function safeQueryError(error: unknown): string {
  return error instanceof ApiError && error.status === 403
    ? "你没有查看租客的权限。"
    : "加载租客失败，请稍后重试。";
}
function mutationErrorMessage(errors: readonly unknown[]): string | null {
  for (const error of errors)
    if (error instanceof ApiError && error.status === 409)
      return "租客存在关联记录，请改为停用并保留历史。";
    else if (error) return "保存租客失败，请稍后重试。";
  return null;
}

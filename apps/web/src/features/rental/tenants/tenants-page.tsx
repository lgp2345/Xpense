import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRentalTenantRequest,
  PermissionKey,
  RentalTenantSummary,
  SetRentalTenantStatusRequest,
  UpdateRentalTenantRequest,
} from "@xpense/shared";
import { useState } from "react";
import { ListPageSkeleton, ListRefreshIndicator } from "@/components/list-loading-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
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
  const pageData = tenantsQuery.data;
  const items = pageData?.items ?? [];
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
        <ListPageSkeleton label="正在加载租客..." />
      ) : tenantsQuery.isError && !hasData ? null : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有匹配的租客。</p>
      ) : isMobile ? (
        <TenantCards items={items} onNavigate={onNavigate} {...actions} />
      ) : (
        <TenantTable items={items} onNavigate={onNavigate} {...actions} />
      )}
      <ListRefreshIndicator
        active={tenantsQuery.isFetching && hasData}
        label="正在更新租客列表..."
      />
      {!forbiddenError && pageData && (items.length > 0 || pageData.page > 1) ? (
        <Pagination
          page={pageData.page}
          pageSize={pageData.pageSize}
          total={pageData.total}
          pending={tenantsQuery.isFetching || mutationsPending}
          onPageSizeChange={(pageSize) =>
            onSearchChange({ ...normalizedSearch, page: 1, pageSize })
          }
          onPageChange={(page) =>
            onSearchChange({ ...normalizedSearch, page, pageSize: pageData.pageSize })
          }
          pendingLabel="加载中"
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

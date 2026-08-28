import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRentalPropertyRequest,
  PermissionKey,
  RentalPropertySummary,
  SetRentalPropertyStatusRequest,
  UpdateRentalPropertyRequest,
} from "@xpense/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ApiError } from "../../../services/api-client";
import type { ListRentalPropertiesQuery, RentalApi } from "../../../services/rental-api";
import {
  invalidatePropertyMutation,
  invalidatePropertyStatusMutation,
  normalizeRentalPropertiesQuery,
  rentalQueryOptions,
} from "../../../services/rental-query";
import { PropertyCards } from "./property-cards";
import { PropertyFilters } from "./property-filters";
import { PropertyFormDialog } from "./property-form-dialog";
import { PropertyTable } from "./property-table";

export type PropertiesPageProps = {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  search: ListRentalPropertiesQuery;
  onSearchChange: (search: ListRentalPropertiesQuery) => void;
  onNavigate: (propertyId: string) => void;
};

/** URL 作用域筛选、分页和权限驱动操作的房产管理页。 */
export function PropertiesPage({
  api,
  organizationId,
  permissions,
  search,
  onNavigate,
  onSearchChange,
}: PropertiesPageProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const normalizedSearch = normalizeRentalPropertiesQuery(search);
  const propertiesQuery = useQuery({
    ...rentalQueryOptions.properties(api, organizationId, normalizedSearch),
    placeholderData: keepPreviousData,
  });
  const createMutation = useMutation({
    mutationFn: (input: CreateRentalPropertyRequest) => api.createProperty(input),
    onSuccess: () => invalidatePropertyMutation(queryClient, organizationId),
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpdateRentalPropertyRequest) => api.updateProperty(input),
    onSuccess: (_, input) => invalidatePropertyMutation(queryClient, organizationId, input.id),
  });
  const statusMutation = useMutation({
    mutationFn: (input: SetRentalPropertyStatusRequest) => api.setPropertyStatus(input),
    onSuccess: (_, input) =>
      invalidatePropertyStatusMutation(queryClient, organizationId, input.id),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProperty(id),
    onSuccess: () => invalidatePropertyMutation(queryClient, organizationId),
  });
  const items = propertiesQuery.data?.items ?? [];
  const canCreate = permissions.includes("rental_properties:create");
  const canUpdate = permissions.includes("rental_properties:update");
  const canDelete = permissions.includes("rental_properties:delete");
  async function handleCreate(input: CreateRentalPropertyRequest) {
    await createMutation.mutateAsync(input);
    toast.success("房产创建成功");
  }
  async function handleUpdate(input: UpdateRentalPropertyRequest) {
    await updateMutation.mutateAsync(input);
    toast.success("房产已更新");
  }
  async function handleStatus(property: RentalPropertySummary, isActive: boolean) {
    try {
      await statusMutation.mutateAsync({ id: property.id, isActive });
      toast.success(isActive ? "房产已启用" : "房产已停用");
    } catch {
      toast.error("更新房产状态失败，请稍后重试。");
    }
  }
  async function handleDelete(property: RentalPropertySummary) {
    try {
      await deleteMutation.mutateAsync(property.id);
      toast.success("房产已删除");
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 409
          ? "该房产存在空间或账务关联，请改为停用"
          : "删除房产失败，请稍后重试。";
      toast.error(message);
    }
  }
  const errorMessage = propertiesQuery.isError
    ? "加载房产失败，请稍后重试。"
    : deleteMutation.isError
      ? deleteMutation.error instanceof ApiError && deleteMutation.error.status === 409
        ? "该房产存在空间或账务关联，请改为停用"
        : "删除房产失败，请稍后重试。"
      : null;
  const isLoading = propertiesQuery.isPending;
  const page = propertiesQuery.data;
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">房产管理</h1>
          <p className="text-sm text-muted-foreground">维护房产资料、状态和可出租空间汇总</p>
        </div>
        {canCreate ? <PropertyFormDialog onCreate={handleCreate} /> : null}
      </header>
      <PropertyFilters search={search} onApply={onSearchChange} />
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载房产...</span>
          </CardContent>
        </Card>
      ) : propertiesQuery.isError ? null : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有房产。</p>
      ) : isMobile ? (
        <PropertyCards
          canDelete={canDelete}
          canUpdate={canUpdate}
          deleting={deleteMutation.isPending}
          items={items}
          onDelete={handleDelete}
          onNavigate={onNavigate}
          onSetStatus={handleStatus}
          onUpdate={handleUpdate}
        />
      ) : (
        <PropertyTable
          canDelete={canDelete}
          canUpdate={canUpdate}
          deleting={deleteMutation.isPending}
          items={items}
          onDelete={handleDelete}
          onNavigate={onNavigate}
          onSetStatus={handleStatus}
          onUpdate={handleUpdate}
        />
      )}
      {page && items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span>
            第 {page.page} 页，共 {page.total} 个房产
          </span>
          <Button
            variant="outline"
            disabled={page.page <= 1}
            onClick={() =>
              onSearchChange({
                ...search,
                page: page.page - 1,
                pageSize: page.pageSize,
              })
            }
          >
            上一页
          </Button>
          <Button
            variant="outline"
            disabled={page.page * page.pageSize >= page.total}
            onClick={() =>
              onSearchChange({
                ...search,
                page: page.page + 1,
                pageSize: page.pageSize,
              })
            }
          >
            下一页
          </Button>
        </div>
      ) : null}
    </main>
  );
}

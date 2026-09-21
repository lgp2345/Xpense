import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRentalPropertyRequest,
  PermissionKey,
  RentalPropertySummary,
  SetRentalPropertyStatusRequest,
  UpdateRentalPropertyRequest,
} from "@xpense/shared";
import { ListPageSkeleton, ListRefreshIndicator } from "@/components/list-loading-state";
import { Pagination } from "@/components/pagination";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import { ApiError } from "../../../services/api-client";
import type { ListRentalPropertiesQuery, RentalApi } from "../../../services/rental-api";
import {
  invalidateDeletedPropertyMutation,
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
  onCreateContract?: (propertyId: string) => void;
};

/** URL 作用域筛选、分页和权限驱动操作的房产管理页。 */
export function PropertiesPage({
  api,
  organizationId,
  permissions,
  search,
  onNavigate,
  onCreateContract,
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
    onSuccess: (_, propertyId) =>
      invalidateDeletedPropertyMutation(queryClient, organizationId, propertyId),
  });
  const items = propertiesQuery.data?.items ?? [];
  const canCreate = permissions.includes("rental_properties:create");
  const canCreateContract =
    permissions.includes("rental_contracts:create") &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_contracts:update");
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
    } catch (error) {
      toast.error(error, "更新房产状态失败，请稍后重试。");
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
      toast.error(error, message);
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
      <ListRefreshIndicator
        active={propertiesQuery.isFetching && Boolean(propertiesQuery.data)}
        label="正在更新房产列表..."
      />
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}
      {isLoading ? (
        <ListPageSkeleton label="正在加载房产..." />
      ) : propertiesQuery.isError ? null : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有房产。</p>
      ) : isMobile ? (
        <PropertyCards
          canDelete={canDelete}
          canCreateContract={canCreateContract}
          canUpdate={canUpdate}
          deleting={deleteMutation.isPending}
          getProperty={api.getProperty}
          items={items}
          onDelete={handleDelete}
          onNavigate={onNavigate}
          onCreateContract={onCreateContract}
          onSetStatus={handleStatus}
          onUpdate={handleUpdate}
        />
      ) : (
        <PropertyTable
          canDelete={canDelete}
          canCreateContract={canCreateContract}
          canUpdate={canUpdate}
          deleting={deleteMutation.isPending}
          getProperty={api.getProperty}
          items={items}
          onDelete={handleDelete}
          onNavigate={onNavigate}
          onCreateContract={onCreateContract}
          onSetStatus={handleStatus}
          onUpdate={handleUpdate}
        />
      )}
      {page && items.length > 0 ? (
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          pending={propertiesQuery.isFetching}
          onPageSizeChange={(pageSize) => onSearchChange({ ...search, page: 1, pageSize })}
          onPageChange={(nextPage) =>
            onSearchChange({ ...search, page: nextPage, pageSize: page.pageSize })
          }
        />
      ) : null}
    </main>
  );
}

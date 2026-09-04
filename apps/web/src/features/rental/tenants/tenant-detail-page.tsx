import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, SetRentalTenantStatusRequest } from "@xpense/shared";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import {
  invalidateDeletedTenantMutation,
  invalidateTenantMutation,
  rentalQueryOptions,
} from "../../../services/rental-query";
import { TenantFormDialog } from "./tenant-form-dialog";
import { TenantSensitivePanel } from "./tenant-sensitive-panel";

export function TenantDetailPage({
  api,
  organizationId,
  tenantId,
  permissions,
}: {
  api: RentalApi;
  organizationId: string;
  tenantId: string;
  permissions: readonly PermissionKey[];
}) {
  const queryClient = useQueryClient();
  const canRead = permissions.includes("rental_tenants:read");
  const canUpdate = permissions.includes("rental_tenants:update");
  const canDelete = permissions.includes("rental_tenants:delete");
  const [historyPage, setHistoryPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const detailQuery = useQuery({
    ...rentalQueryOptions.tenant(api, organizationId, tenantId),
    enabled: canRead && Boolean(organizationId && tenantId),
  });
  const historyQuery = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, {
      tenantId,
      page: historyPage,
      pageSize: 20,
    }),
    enabled: canRead && Boolean(organizationId && tenantId),
  });
  const statusMutation = useMutation({
    mutationFn: (input: SetRentalTenantStatusRequest) =>
      api.setTenantStatus?.(input) ?? Promise.reject(new Error("状态操作不可用")),
    onSuccess: (_, input) =>
      invalidateTenantMutation(queryClient, organizationId, input.id, "status"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTenant?.(tenantId) ?? Promise.reject(new Error("删除操作不可用")),
    onSuccess: () => invalidateDeletedTenantMutation(queryClient, organizationId, tenantId),
  });
  if (!canRead)
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <p className="rounded-lg border border-muted-foreground/20 bg-muted p-4 text-sm text-muted-foreground">
          你没有查看租客的权限。
        </p>
      </main>
    );
  if (detailQuery.isPending) return <LoadingDetail />;
  if (detailQuery.isError)
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        {detailQuery.error instanceof ApiError && detailQuery.error.status === 403 ? (
          <p className="rounded-lg border border-muted-foreground/20 bg-muted p-4 text-sm text-muted-foreground">
            你没有查看租客的权限。
          </p>
        ) : detailQuery.error instanceof ApiError && detailQuery.error.status === 404 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">租客不存在或已删除。</p>
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            加载租客详情失败，请稍后重试。
          </p>
        )}
      </main>
    );
  const tenant = detailQuery.data;
  if (!tenant) return null;
  const historyError =
    historyQuery.error instanceof ApiError && historyQuery.error.status === 403
      ? "合同历史暂不可查看。"
      : "合同历史加载失败，请重试。";
  const actionError = actionErrorMessage(statusMutation.error ?? deleteMutation.error);
  async function handleUpdate(
    input: Parameters<NonNullable<React.ComponentProps<typeof TenantFormDialog>["onUpdate"]>>[0],
  ) {
    if (!canUpdate) return;
    await api.updateTenant?.(input);
    await invalidateTenantMutation(queryClient, organizationId, tenantId, "update");
  }
  async function handleDelete() {
    if (!canDelete) return;
    try {
      await deleteMutation.mutateAsync();
    } catch {
      return;
    }
  }
  async function handleStatus() {
    if (!canUpdate) return;
    try {
      await statusMutation.mutateAsync({ id: tenant.id, isActive: !tenant.isActive });
    } catch {
      return;
    }
  }
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-medium tracking-tight">{tenant.name}</h1>
            <Badge variant={tenant.isActive ? "default" : "secondary"}>
              {tenant.isActive ? "启用" : "停用"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {tenant.type === "individual" ? "个人租客" : "企业租客"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                编辑
              </Button>
              <Button
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => void handleStatus()}
              >
                {tenant.isActive ? "停用" : "启用"}
              </Button>
            </>
          ) : null}
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleteMutation.isPending}>
                  删除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除租客</AlertDialogTitle>
                  <AlertDialogDescription>
                    存在合同或空间关联时无法删除，请改为停用并保留历史。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDelete()}>
                    确认删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </header>
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <Info label="类型" value={tenant.type === "individual" ? "个人" : "企业"} />
          <Info label="电话" value={tenant.phone} />
          <Info label="邮箱" value={tenant.email} />
          <Info label="主要联系人" value={tenant.primaryContactName} />
          <Info label="联系人电话" value={tenant.primaryContactPhone} />
          <Info label="证件号" value={tenant.maskedDocumentNumber} />
          <Info label="更新时间" value={tenant.updatedAt.replace("T", " ").slice(0, 16)} />
          {tenant.note ? (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">备注</span>
              <p className="mt-1 whitespace-pre-wrap">{tenant.note}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <TenantSensitivePanel
        api={api}
        organizationId={organizationId}
        tenantId={tenantId}
        maskedDocumentNumber={tenant.maskedDocumentNumber}
        permissions={permissions}
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">合同历史</h2>
          {historyQuery.isFetching && historyQuery.data ? (
            <span className="text-xs text-muted-foreground">正在更新...</span>
          ) : null}
        </div>
        {historyQuery.isPending ? (
          <p className="text-sm text-muted-foreground">正在加载合同历史...</p>
        ) : historyQuery.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {historyError}
            <Button
              variant="link"
              className="ml-2 px-0"
              onClick={() => void historyQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : historyQuery.data?.items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无合同历史。
          </p>
        ) : (
          <>
            <div className="grid gap-2">
              {historyQuery.data?.items.map((contract) => (
                <Card key={contract.id}>
                  <CardContent className="grid gap-1 p-4 text-sm">
                    <p className="font-medium">{contract.contractNumber}</p>
                    <p className="text-muted-foreground">
                      {contract.propertyName} · {contract.spaceNames.join("、") || "未指定空间"}
                    </p>
                    <p>
                      {contract.startDate ?? "未开始"} 至 {contract.endDate ?? "未结束"}
                    </p>
                    <p>承租方：{contract.tenantNames.join("、") || tenant.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <HistoryPagination
              page={historyQuery.data?.page ?? historyPage}
              pageSize={historyQuery.data?.pageSize ?? 20}
              total={historyQuery.data?.total ?? 0}
              onChange={setHistoryPage}
            />
          </>
        )}
      </section>
      {editing ? (
        <TenantFormDialog
          mode="edit"
          hideTrigger
          open
          tenant={tenant}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          onUpdate={async (input) => {
            await handleUpdate(input);
            setEditing(false);
          }}
        />
      ) : null}
    </main>
  );
}

function LoadingDetail() {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="space-y-3 p-4" aria-live="polite">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-full" />
          <span className="sr-only">正在加载租客详情...</span>
        </CardContent>
      </Card>
    </main>
  );
}
function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="mt-1">{value ?? "未填写"}</p>
    </div>
  );
}
function HistoryPagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}

function actionErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 409) return error.message;
  if (error instanceof ApiError && error.status === 403) return "你没有执行该租客操作的权限。";
  return "租客操作失败，请稍后重试。";
}

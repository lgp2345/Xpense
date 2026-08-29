import { useQuery } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { propertyAddress, propertyTypeLabel } from "../properties/property-table";
import { SpaceTreeTable } from "./space-tree-table";

/** 可独立使用的房产详情页头部；空间树会在后续任务附加到此页面。 */
export function PropertyDetailPage({
  api,
  organizationId,
  permissions = [],
  propertyId,
}: {
  api: RentalApi;
  organizationId: string;
  permissions?: readonly PermissionKey[];
  propertyId: string;
}) {
  const query = useQuery(rentalQueryOptions.property(api as RentalApi, organizationId, propertyId));
  if (query.isPending)
    return (
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-full" />
            <span className="sr-only">正在加载房产详情...</span>
          </CardContent>
        </Card>
      </main>
    );
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        {missing ? (
          <p className="py-10 text-center text-sm text-muted-foreground">房产不存在或已被删除。</p>
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            加载房产详情失败，请稍后重试。
          </p>
        )}
      </main>
    );
  }
  const property = query.data;
  if (!property) return null;
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium tracking-tight">{property.name}</h1>
            <Badge variant={property.isActive ? "default" : "secondary"}>
              {property.isActive ? "启用" : "停用"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {propertyTypeLabel(property)} · {propertyAddress(property)}
          </p>
        </div>
      </header>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">空间总数</span>
            <p className="mt-1 font-medium">{property.spaceCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">可出租空间</span>
            <p className="mt-1 font-medium">{property.rentableSpaceCount}</p>
          </div>
          {property.note ? (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">备注</span>
              <p className="mt-1 whitespace-pre-wrap">{property.note}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {!property.isActive ? (
        <p className="rounded-lg border border-muted-foreground/20 bg-muted p-3 text-sm text-muted-foreground">
          此房产已停用，所属空间因上级停用而不可用。
        </p>
      ) : null}
      <SpaceTreeTable
        api={api}
        key={`${organizationId}:${propertyId}`}
        organizationId={organizationId}
        permissions={permissions}
        propertyActive={property.isActive}
        propertyId={propertyId}
      />
    </main>
  );
}

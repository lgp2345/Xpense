import type { RentalTenantSummary } from "@xpense/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DeleteTenantButton,
  formatTenantUpdatedAt,
  type TenantActions,
  tenantTypeLabel,
} from "./tenant-table";

export function TenantCards({
  items,
  onNavigate,
  ...actions
}: { items: RentalTenantSummary[]; onNavigate: (id: string) => void } & TenantActions) {
  return (
    <div className="grid gap-3 md:hidden" data-testid="tenant-cards">
      {items.map((tenant) => (
        <Card key={tenant.id}>
          <CardContent className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <a
                  href={`/rentals/tenants/${tenant.id}`}
                  className="break-words font-medium underline-offset-4 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(tenant.id);
                  }}
                >
                  {tenant.name}
                </a>
                <p className="text-sm text-muted-foreground">{tenantTypeLabel(tenant.type)}</p>
              </div>
              <Badge variant={tenant.isActive ? "default" : "secondary"}>
                {tenant.isActive ? "启用" : "停用"}
              </Badge>
            </div>
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">联系方式</dt>
                <dd className="max-w-[65%] break-words text-right">
                  {tenant.phone ?? tenant.email ?? "未填写"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">主要联系人</dt>
                <dd className="max-w-[65%] break-words text-right">
                  <div>{tenant.primaryContactName ?? "未填写"}</div>
                  {tenant.primaryContactPhone ? <div>{tenant.primaryContactPhone}</div> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">证件号</dt>
                <dd>{tenant.maskedDocumentNumber ?? "未填写"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">合同数</dt>
                <dd>{tenant.contractCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">更新时间</dt>
                <dd>{formatTenantUpdatedAt(tenant.updatedAt)}</dd>
              </div>
            </dl>
            {actions.canUpdate || actions.canDelete ? (
              <div className="flex flex-wrap gap-2">
                {actions.canUpdate ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => actions.onEdit(tenant)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => actions.onSetStatus(tenant)}>
                      {tenant.isActive ? "停用" : "启用"}
                    </Button>
                  </>
                ) : null}
                {actions.canDelete ? (
                  <DeleteTenantButton
                    disabled={actions.deleting}
                    tenant={tenant}
                    onDelete={actions.onDelete}
                  />
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

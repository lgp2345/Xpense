import type { RentalTenantSummary } from "@xpense/shared";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type TenantActions = {
  canDelete: boolean;
  canUpdate: boolean;
  deleting: boolean;
  onEdit: (tenant: RentalTenantSummary) => void;
  onSetStatus: (tenant: RentalTenantSummary) => void;
  onDelete: (tenant: RentalTenantSummary) => Promise<void>;
};

export function TenantTable({
  items,
  onNavigate,
  ...actions
}: { items: RentalTenantSummary[]; onNavigate: (id: string) => void } & TenantActions) {
  return (
    <Card className="hidden md:block">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>租客</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead>主要联系人</TableHead>
              <TableHead>证件号</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>合同数</TableHead>
              <TableHead>更新时间</TableHead>
              {actions.canUpdate || actions.canDelete ? (
                <TableHead className="text-right">操作</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <a
                    href={`/rentals/tenants/${tenant.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(tenant.id);
                    }}
                  >
                    {tenant.name}
                  </a>
                </TableCell>
                <TableCell>{tenantTypeLabel(tenant.type)}</TableCell>
                <TableCell className="max-w-48 truncate">
                  {tenant.phone ?? tenant.email ?? "未填写"}
                </TableCell>
                <TableCell>{tenant.primaryContactName ?? "未填写"}</TableCell>
                <TableCell>{tenant.maskedDocumentNumber ?? "未填写"}</TableCell>
                <TableCell>
                  <Badge variant={tenant.isActive ? "default" : "secondary"}>
                    {tenant.isActive ? "启用" : "停用"}
                  </Badge>
                </TableCell>
                <TableCell>{tenant.contractCount}</TableCell>
                <TableCell>{formatTenantUpdatedAt(tenant.updatedAt)}</TableCell>
                {actions.canUpdate || actions.canDelete ? (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {actions.canUpdate ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actions.onEdit(tenant)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actions.onSetStatus(tenant)}
                          >
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
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DeleteTenantButton({
  tenant,
  disabled,
  onDelete,
}: {
  tenant: RentalTenantSummary;
  disabled: boolean;
  onDelete: (tenant: RentalTenantSummary) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="destructive"
          disabled={disabled}
          aria-label={`删除 ${tenant.name}`}
        >
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除租客</AlertDialogTitle>
          <AlertDialogDescription>
            删除前请确认租客没有合同或空间关联；有历史关联时请改为停用。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(tenant)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function tenantTypeLabel(type: RentalTenantSummary["type"]): string {
  return type === "individual" ? "个人" : "企业";
}
export function formatTenantUpdatedAt(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

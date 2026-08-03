import type { PermissionKey } from "@xpense/shared";

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
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  IamPermission,
  IamRoleWithPermissions,
  UpdateRoleRequest,
} from "../../services/iam-api";
import { RoleEditorDialog, type RoleEditorInput } from "./role-editor-dialog";

type RoleTableProps = {
  isMutating: boolean;
  permissions: readonly PermissionKey[];
  permissionItems: IamPermission[];
  roles: IamRoleWithPermissions[];
  onDelete: (roleId: string) => Promise<boolean>;
  onUpdate: (roleId: string, input: UpdateRoleRequest) => Promise<boolean>;
};

export function RoleTable({
  isMutating,
  permissions,
  permissionItems,
  roles,
  onDelete,
  onUpdate,
}: RoleTableProps) {
  if (roles.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">当前没有角色。</p>;
  }

  const canUpdate = permissions.includes("roles.update");
  const canDelete = permissions.includes("roles.delete");
  const canUpdatePermissions =
    permissions.includes("permissions.read") && permissions.includes("roles.permissions.update");

  function getUpdateInput(input: RoleEditorInput): UpdateRoleRequest {
    const request: UpdateRoleRequest = {
      name: input.name,
      description: input.description,
    };

    if (canUpdatePermissions) {
      request.permissionKeys = input.permissionKeys;
    }

    return request;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>角色</TableHead>
              <TableHead>标识</TableHead>
              <TableHead>说明</TableHead>
              <TableHead>类型</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell>{role.key}</TableCell>
                <TableCell>{role.description || "暂无说明"}</TableCell>
                <TableCell>{role.isSystem ? "系统角色" : "自定义角色"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {role.isEditable && canUpdate ? (
                      <RoleEditorDialog
                        canUpdatePermissions={canUpdatePermissions}
                        key={getRoleEditorKey(role)}
                        permissions={permissionItems}
                        role={role}
                        triggerLabel={`编辑 ${role.name}`}
                        onSubmit={(input) => onUpdate(role.id, getUpdateInput(input))}
                      />
                    ) : null}
                    {role.isEditable && canDelete ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">删除 {role.name}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除角色</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后无法恢复。请确认该角色未分配给任何成员。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className={buttonVariants({ variant: "destructive" })}
                              disabled={isMutating}
                              onClick={() => void onDelete(role.id)}
                            >
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function getRoleEditorKey(role: IamRoleWithPermissions): string {
  return [role.id, role.name, role.description, role.permissionKeys.join(",")].join(":");
}

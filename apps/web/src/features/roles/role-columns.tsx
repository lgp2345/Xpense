import type { ColumnDef } from "@tanstack/react-table";
import type { PermissionKey } from "@xpense/shared";
import { DataTableColumnHeader } from "@/components/data-table";
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
import type {
  IamPermission,
  IamRoleWithPermissions,
  UpdateRoleRequest,
} from "../../services/iam-api";
import { RoleEditorDialog, type RoleEditorInput } from "./role-editor-dialog";

type RoleColumnsOptions = {
  isMutating: boolean;
  permissions: readonly PermissionKey[];
  permissionItems: IamPermission[];
  onDelete: (roleId: string) => Promise<boolean>;
  onUpdate: (roleId: string, input: UpdateRoleRequest) => Promise<boolean>;
};

// biome-ignore lint/suspicious/noExplicitAny: ColumnDef needs features type, using any for flexibility
type RoleColumnDef = ColumnDef<any, IamRoleWithPermissions>;

export function createRoleColumns({
  isMutating,
  permissions,
  permissionItems,
  onDelete,
  onUpdate,
}: RoleColumnsOptions): RoleColumnDef[] {
  const canUpdate = permissions.includes("roles:update");
  const canDelete = permissions.includes("roles:delete");
  const canUpdatePermissions =
    permissions.includes("permissions:read") && permissions.includes("roles:permissions:update");

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

  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="角色" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "key",
      header: ({ column }) => <DataTableColumnHeader column={column} title="标识" />,
    },
    {
      accessorKey: "description",
      header: () => <span>说明</span>,
      cell: ({ row }) => row.original.description || "暂无说明",
    },
    {
      accessorKey: "isSystem",
      header: ({ column }) => <DataTableColumnHeader column={column} title="类型" />,
      cell: ({ row }) => (row.original.isSystem ? "系统角色" : "自定义角色"),
      filterFn: (row, _columnId, filterValue: unknown) => {
        if (filterValue === undefined || filterValue === "") return true;
        return String(row.original.isSystem) === filterValue;
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {role.isEditable && canUpdate ? (
              <RoleEditorDialog
                canUpdatePermissions={canUpdatePermissions}
                key={getRoleEditorKey(role)}
                permissions={permissionItems}
                role={role}
                triggerLabel={`编辑 ${role.name}`}
                // biome-ignore lint/suspicious/noExplicitAny: type mismatch from existing component
                onSubmit={(input: any) => onUpdate(role.id, getUpdateInput(input))}
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
        );
      },
      enableSorting: false,
    },
  ];
}

function getRoleEditorKey(role: IamRoleWithPermissions): string {
  return [role.id, role.name, role.description, role.permissionKeys.join(",")].join(":");
}

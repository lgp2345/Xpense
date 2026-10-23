import type { PermissionKey } from "@xpense/shared";
import { format } from "date-fns";
import { DataTableColumnHeader } from "@/components/data-table";
import type { ClientColumnDef } from "@/components/data-table/use-client-table";
import type { IamMember, IamRole } from "../../services/iam-api";
import { MemberActions } from "./member-actions";

type MemberColumnsOptions = {
  isMutating: boolean;
  canManageOwners: boolean;
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onRoleChange: (memberId: string, roleId: string) => Promise<void>;
  onStatusChange: (memberId: string, status: "active" | "disabled") => Promise<void>;
};

type MemberColumnDef = ClientColumnDef<IamMember>;

export function createMemberColumns({
  isMutating,
  canManageOwners,
  permissions,
  roles,
  onRoleChange,
  onStatusChange,
}: MemberColumnsOptions): MemberColumnDef[] {
  return [
    {
      id: "email",
      accessorFn: (member) => member.email ?? member.phone ?? "未填写",
      header: ({ column }) => <DataTableColumnHeader column={column} title="账号" />,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.email ?? row.original.phone ?? "未填写"}</span>
      ),
      filterFn: (row, _columnId, filterValue: string) =>
        [row.original.email, row.original.phone].some((value) =>
          value?.toLowerCase().includes(filterValue.toLowerCase()),
        ),
    },
    {
      accessorKey: "roleName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="角色" />,
      cell: ({ row }) => row.original.roleName,
      filterFn: (row, _columnId, filterValue: unknown) => {
        if (!filterValue) return true;
        return row.getValue("roleName") === filterValue;
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
      cell: ({ row }) => (row.original.status === "active" ? "已启用" : "已禁用"),
      filterFn: (row, _columnId, filterValue: unknown) => {
        if (!filterValue) return true;
        return row.getValue("status") === filterValue;
      },
    },
    {
      accessorKey: "joinedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="加入时间" />,
      cell: ({ row }) => format(new Date(row.original.joinedAt), "yyyy-MM-dd HH:mm"),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <MemberActions
            isMutating={isMutating}
            canManageOwners={canManageOwners}
            member={row.original}
            permissions={permissions}
            roles={roles}
            onRoleChange={(roleId) => onRoleChange(row.original.id, roleId)}
            onStatusChange={(status) => onStatusChange(row.original.id, status)}
          />
        </div>
      ),
      enableSorting: false,
    },
  ];
}

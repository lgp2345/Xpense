import type { ColumnDef } from "@tanstack/react-table";
import type { PermissionKey } from "@xpense/shared";
import { DataTableColumnHeader } from "@/components/data-table";
import type { IamMember, IamRole } from "../../services/iam-api";
import { MemberActions } from "./member-actions";

type MemberColumnsOptions = {
  isMutating: boolean;
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onRoleChange: (memberId: string, roleId: string) => Promise<void>;
  onStatusChange: (memberId: string, status: "active" | "disabled") => Promise<void>;
};

// biome-ignore lint/suspicious/noExplicitAny: ColumnDef needs features type, using any for flexibility
type MemberColumnDef = ColumnDef<any, IamMember>;

export function createMemberColumns({
  isMutating,
  permissions,
  roles,
  onRoleChange,
  onStatusChange,
}: MemberColumnsOptions): MemberColumnDef[] {
  return [
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="邮箱" />,
      cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
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
      cell: ({ row }) => dateTimeFormatter.format(new Date(row.original.joinedAt)),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <MemberActions
            isMutating={isMutating}
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

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

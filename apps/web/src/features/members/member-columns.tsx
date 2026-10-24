import type { PermissionKey } from "@xpense/shared";
import { format } from "date-fns";
import { DataTableColumnHeader } from "@/components/data-table";
import type { ClientColumnDef } from "@/components/data-table/use-client-table";
import type { IamMember, IamRole } from "../../services/iam-api";
import { MemberActions } from "./member-actions";
import type { MemberFormValues } from "./member-form-schema";

type MemberColumnsOptions = {
  isMutating: boolean;
  canManageOwners: boolean;
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onEdit: (member: IamMember, input: MemberFormValues) => Promise<void>;
  onStatusChange: (memberId: string, status: "active" | "disabled") => Promise<void>;
};

type MemberColumnDef = ClientColumnDef<IamMember>;

function getAssignedRoles(member: IamMember) {
  return member.roles?.length
    ? member.roles
    : [{ id: member.roleId, key: member.roleKey, name: member.roleName }];
}

export function createMemberColumns({
  isMutating,
  canManageOwners,
  permissions,
  roles,
  onEdit,
  onStatusChange,
}: MemberColumnsOptions): MemberColumnDef[] {
  return [
    {
      id: "account",
      accessorFn: (member) => member.email ?? member.phone ?? member.username,
      header: ({ column }) => <DataTableColumnHeader column={column} title="账号" />,
      cell: ({ row }) => {
        const account = row.original.email ?? row.original.phone ?? "未填写";
        return (
          <div>
            <span className="font-medium">{account}</span>
            <span className="block text-xs text-muted-foreground">{row.original.username}</span>
          </div>
        );
      },
      filterFn: (row, _columnId, filterValue: string) =>
        [row.original.email, row.original.phone, row.original.username].some((value) =>
          value?.toLowerCase().includes(filterValue.toLowerCase()),
        ),
    },
    {
      id: "roleName",
      accessorFn: (member) =>
        getAssignedRoles(member)
          .map((role) => role.name)
          .join("、"),
      header: ({ column }) => <DataTableColumnHeader column={column} title="角色" />,
      cell: ({ row }) =>
        getAssignedRoles(row.original)
          .map((role) => role.name)
          .join("、"),
      filterFn: (row, _columnId, filterValue: string[] | undefined) => {
        if (!filterValue) return true;
        const assignedIds = new Set(getAssignedRoles(row.original).map((role) => role.id));
        return filterValue.some((roleId) => assignedIds.has(roleId));
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
            onEdit={(input) => onEdit(row.original, input)}
            onStatusChange={(status) => onStatusChange(row.original.id, status)}
          />
        </div>
      ),
      enableSorting: false,
    },
  ];
}

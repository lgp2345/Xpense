import type { PermissionKey } from "@xpense/shared";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IamMember, IamRole } from "../../services/iam-api";
import { MemberActions } from "./member-actions";

type MemberTableProps = {
  isMutating: boolean;
  members: IamMember[];
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onRoleChange: (memberId: string, roleId: string) => Promise<void>;
  onStatusChange: (memberId: string, status: "active" | "disabled") => Promise<void>;
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MemberTable({
  isMutating,
  members,
  permissions,
  roles,
  onRoleChange,
  onStatusChange,
}: MemberTableProps) {
  if (members.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">当前没有成员。</p>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.email}</TableCell>
                <TableCell>{item.roleName}</TableCell>
                <TableCell>{item.status === "active" ? "已启用" : "已禁用"}</TableCell>
                <TableCell>{dateTimeFormatter.format(new Date(item.joinedAt))}</TableCell>
                <TableCell className="text-right">
                  <MemberActions
                    isMutating={isMutating}
                    member={item}
                    permissions={permissions}
                    roles={roles}
                    onRoleChange={(roleId) => onRoleChange(item.id, roleId)}
                    onStatusChange={(status) => onStatusChange(item.id, status)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

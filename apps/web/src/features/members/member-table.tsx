import { Table } from "@heroui/react/table";
import type { PermissionKey } from "@xpense/shared";

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
    return (
      <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">当前没有成员。</p>
    );
  }

  return (
    <Table className="overflow-hidden rounded-[var(--xp-radius-card)] bg-[var(--color-surface-solid)]">
      <Table.ScrollContainer>
        <Table.Content aria-label="成员列表">
          <Table.Header>
            <Table.Column isRowHeader>邮箱</Table.Column>
            <Table.Column>角色</Table.Column>
            <Table.Column>状态</Table.Column>
            <Table.Column>加入时间</Table.Column>
            <Table.Column>操作</Table.Column>
          </Table.Header>
          <Table.Body items={members}>
            {(item) => (
              <Table.Row id={item.id}>
                <Table.Cell>{item.email}</Table.Cell>
                <Table.Cell>{item.roleName}</Table.Cell>
                <Table.Cell>{item.status === "active" ? "已启用" : "已禁用"}</Table.Cell>
                <Table.Cell>{dateTimeFormatter.format(new Date(item.joinedAt))}</Table.Cell>
                <Table.Cell>
                  <MemberActions
                    isMutating={isMutating}
                    member={item}
                    permissions={permissions}
                    roles={roles}
                    onRoleChange={(roleId) => onRoleChange(item.id, roleId)}
                    onStatusChange={(status) => onStatusChange(item.id, status)}
                  />
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

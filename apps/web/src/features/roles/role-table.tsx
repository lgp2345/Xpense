import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { Table } from "@heroui/react/table";
import type { PermissionKey } from "@xpense/shared";

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
    return (
      <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">当前没有角色。</p>
    );
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
    <Table className="overflow-hidden rounded-[var(--xp-radius-card)] bg-[var(--color-surface-solid)]">
      <Table.ScrollContainer>
        <Table.Content aria-label="角色列表">
          <Table.Header>
            <Table.Column isRowHeader>角色</Table.Column>
            <Table.Column>标识</Table.Column>
            <Table.Column>说明</Table.Column>
            <Table.Column>类型</Table.Column>
            <Table.Column>操作</Table.Column>
          </Table.Header>
          <Table.Body items={roles}>
            {(role) => (
              <Table.Row id={role.id}>
                <Table.Cell>{role.name}</Table.Cell>
                <Table.Cell>{role.key}</Table.Cell>
                <Table.Cell>{role.description || "暂无说明"}</Table.Cell>
                <Table.Cell>{role.isSystem ? "系统角色" : "自定义角色"}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {role.isEditable && canUpdate ? (
                      <RoleEditorDialog
                        canUpdatePermissions={canUpdatePermissions}
                        isSubmitting={isMutating}
                        key={getRoleEditorKey(role)}
                        permissions={permissionItems}
                        role={role}
                        triggerLabel={`编辑 ${role.name}`}
                        onSubmit={(input) => onUpdate(role.id, getUpdateInput(input))}
                      />
                    ) : null}
                    {role.isEditable && canDelete ? (
                      <AlertDialog>
                        <AlertDialog.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-control)] px-3 text-sm text-[var(--color-error)] outline outline-1 outline-[var(--color-line-strong)]">
                          删除 {role.name}
                        </AlertDialog.Trigger>
                        <AlertDialog.Backdrop>
                          <AlertDialog.Container size="sm">
                            <AlertDialog.Dialog>
                              <AlertDialog.Header>
                                <AlertDialog.Heading>确认删除角色</AlertDialog.Heading>
                              </AlertDialog.Header>
                              <AlertDialog.Body>
                                删除后无法恢复。请确认该角色未分配给任何成员。
                              </AlertDialog.Body>
                              <AlertDialog.Footer>
                                <Button slot="close" variant="secondary">
                                  取消
                                </Button>
                                <Button
                                  isDisabled={isMutating}
                                  slot="close"
                                  onPress={() => void onDelete(role.id)}
                                >
                                  确认删除
                                </Button>
                              </AlertDialog.Footer>
                            </AlertDialog.Dialog>
                          </AlertDialog.Container>
                        </AlertDialog.Backdrop>
                      </AlertDialog>
                    ) : null}
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function getRoleEditorKey(role: IamRoleWithPermissions): string {
  return [role.id, role.name, role.description, role.permissionKeys.join(",")].join(":");
}

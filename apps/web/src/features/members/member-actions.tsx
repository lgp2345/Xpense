import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Select } from "@heroui/react/select";
import type { PermissionKey } from "@xpense/shared";

import type { IamMember, IamRole } from "../../services/iam-api";

type MemberActionsProps = {
  isMutating: boolean;
  member: IamMember;
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onRoleChange: (roleId: string) => Promise<void>;
  onStatusChange: (status: "active" | "disabled") => Promise<void>;
};

export function MemberActions({
  isMutating,
  member,
  permissions,
  roles,
  onRoleChange,
  onStatusChange,
}: MemberActionsProps) {
  const canChangeRole = permissions.includes("members.update");
  const canDisable = permissions.includes("members.disable") && member.status === "active";
  const canEnable = permissions.includes("members.enable") && member.status === "disabled";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canChangeRole ? (
        <Select
          aria-label={`变更 ${member.email} 的角色`}
          isDisabled={isMutating}
          value={member.roleId}
          onChange={(roleId) => {
            if (roleId && roleId !== member.roleId) {
              void onRoleChange(String(roleId));
            }
          }}
        >
          <Label>变更 {member.email} 的角色</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {roles.map((role) => (
                <ListBox.Item id={role.id} key={role.id} textValue={role.name}>
                  {role.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : null}

      {canDisable ? (
        <AlertDialog>
          <AlertDialog.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-control)] px-3 text-sm text-[var(--color-error)] outline outline-1 outline-[var(--color-line-strong)]">
            禁用 {member.email}
          </AlertDialog.Trigger>
          <AlertDialog.Backdrop>
            <AlertDialog.Container size="sm">
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Heading>确认禁用成员</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>禁用后，该成员将无法继续访问当前账本。</AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="secondary">
                    取消
                  </Button>
                  <Button
                    isDisabled={isMutating}
                    slot="close"
                    onPress={() => void onStatusChange("disabled")}
                  >
                    确认禁用
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      ) : null}

      {canEnable ? (
        <Button
          isDisabled={isMutating}
          variant="secondary"
          onPress={() => void onStatusChange("active")}
        >
          启用 {member.email}
        </Button>
      ) : null}
    </div>
  );
}

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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
          value={member.roleId}
          disabled={isMutating}
          onValueChange={(roleId) => {
            if (roleId && roleId !== member.roleId) {
              void onRoleChange(roleId);
            }
          }}
        >
          <SelectTrigger aria-label={`变更 ${member.email} 的角色`} className="w-44">
            <SelectValue placeholder="选择角色" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {canDisable ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">禁用 {member.email}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认禁用成员</AlertDialogTitle>
              <AlertDialogDescription>
                禁用后，该成员将无法继续访问当前账本。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isMutating}
                onClick={() => void onStatusChange("disabled")}
              >
                确认禁用
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {canEnable ? (
        <Button
          disabled={isMutating}
          variant="outline"
          onClick={() => void onStatusChange("active")}
        >
          启用 {member.email}
        </Button>
      ) : null}
    </div>
  );
}

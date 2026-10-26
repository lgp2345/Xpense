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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IamMember, IamRole } from "../../services/iam-api";
import { MemberFormDialog } from "./member-form-dialog";
import type { MemberFormValues } from "./member-form-schema";

type MemberActionsProps = {
  isMutating: boolean;
  canManageOwners?: boolean;
  member: IamMember;
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onEdit: (input: MemberFormValues) => Promise<void>;
  onStatusChange: (status: "active" | "disabled") => Promise<void>;
};

export function MemberActions({
  isMutating,
  canManageOwners = false,
  member,
  permissions,
  roles,
  onEdit,
  onStatusChange,
}: MemberActionsProps) {
  const canUpdateRole = permissions.includes("members:update");
  const canDisable = permissions.includes("members:disable");
  const canEnable = permissions.includes("members:enable");
  const isActive = member.status === "active";

  const account = member.email ?? member.phone ?? "未填写";
  const protectedOwner = member.roleKey === "owner";
  const reason =
    protectedOwner && !canManageOwners
      ? "仅组织负责人或平台超级管理员可管理负责人"
      : protectedOwner &&
          member.status === "active" &&
          member.userStatus !== "disabled" &&
          (member.effectiveOwnerCount ?? 0) <= 1
        ? "至少保留一位有效组织负责人"
        : null;
  const disabledButton = (label: string, why: string, accessibleLabel: string) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" disabled focusableWhenDisabled aria-label={accessibleLabel}>
            {label}
          </Button>
        }
      />
      <TooltipContent>{why}</TooltipContent>
    </Tooltip>
  );
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canUpdateRole && reason ? (
        disabledButton("编辑", reason, `编辑 ${account}`)
      ) : canUpdateRole ? (
        <MemberFormDialog
          member={member}
          roles={roles.filter((role) => canManageOwners || role.key !== "owner")}
          permissions={permissions}
          disabled={isMutating}
          onSubmit={onEdit}
        />
      ) : null}

      {canDisable && reason ? (
        disabledButton("禁用", reason, `禁用 ${account}`)
      ) : canDisable ? (
        isActive ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" aria-label={`禁用 ${account}`}>
                  禁用
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认禁用成员</AlertDialogTitle>
                <AlertDialogDescription>
                  禁用后，该成员将无法继续访问当前组织。
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
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <span>
                  <Button variant="outline" disabled aria-label={`禁用 ${account}`}>
                    禁用
                  </Button>
                </span>
              }
            />
            <TooltipContent>该成员已被禁用</TooltipContent>
          </Tooltip>
        )
      ) : null}

      {canEnable && protectedOwner && !canManageOwners ? (
        disabledButton("启用", "仅组织负责人或平台超级管理员可管理负责人", `启用 ${account}`)
      ) : canEnable ? (
        isActive ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span>
                  <Button variant="outline" disabled aria-label={`启用 ${account}`}>
                    启用
                  </Button>
                </span>
              }
            />
            <TooltipContent>该成员已是活跃状态</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            disabled={isMutating}
            aria-label={`启用 ${account}`}
            variant="outline"
            onClick={() => void onStatusChange("active")}
          >
            启用
          </Button>
        )
      ) : null}
    </div>
  );
}

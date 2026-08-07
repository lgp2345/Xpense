import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { IamApi, IamMember, IamRole } from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { MemberFormDialog } from "./member-form-dialog";
import type { MemberFormValues } from "./member-form-schema";
import { MemberTable } from "./member-table";

type MembersApi = Pick<IamApi, "listMembers" | "createMember" | "updateMember" | "listRoles">;

type MembersPageProps = {
  api?: MembersApi;
  members?: IamMember[];
  permissions: PermissionKey[];
  roles?: IamRole[];
};

function loadMembersData(api: MembersApi, canReadRoles: boolean) {
  return Promise.all([
    api.listMembers(),
    canReadRoles ? api.listRoles() : Promise.resolve([] as IamRole[]),
  ]);
}

export function MembersPage({ api = webIamApi, members, permissions, roles }: MembersPageProps) {
  const canReadRoles = permissions.includes("roles:read");
  const hasInitialData = members !== undefined && (!canReadRoles || roles !== undefined);
  const [memberItems, setMemberItems] = useState(() => members ?? []);
  const [roleItems, setRoleItems] = useState(() => roles ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshMembers() {
    const [nextMembers, nextRoles] = await loadMembersData(api, canReadRoles);
    setMemberItems(nextMembers);
    setRoleItems(nextRoles);
  }

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let isActive = true;

    void loadMembersData(api, canReadRoles)
      .then(([nextMembers, nextRoles]) => {
        if (isActive) {
          setMemberItems(nextMembers);
          setRoleItems(nextRoles);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("加载成员列表失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [api, canReadRoles, hasInitialData]);

  async function runMutation(operation: () => Promise<unknown>, error: string): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      await operation();
      await refreshMembers();
      return true;
    } catch {
      setErrorMessage(error);
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCreate(input: MemberFormValues) {
    setErrorMessage(null);
    await api.createMember(input);
    toast.success("成员添加成功");

    try {
      await refreshMembers();
    } catch {
      setErrorMessage("加载成员列表失败，请稍后重试。");
    }
  }

  async function handleRoleChange(memberId: string, roleId: string) {
    const succeeded = await runMutation(
      () => api.updateMember(memberId, { roleId }),
      "更新成员角色失败，请稍后重试。",
    );

    if (succeeded) {
      toast.success("成员角色已更新");
    }
  }

  async function handleStatusChange(memberId: string, status: "active" | "disabled") {
    const succeeded = await runMutation(
      () => api.updateMember(memberId, { status }),
      "更新成员状态失败，请稍后重试。",
    );

    if (succeeded) {
      toast.success(status === "active" ? "成员已启用" : "成员已禁用");
    }
  }

  async function handleRetry() {
    setErrorMessage(null);

    try {
      await refreshMembers();
    } catch {
      setErrorMessage("加载成员列表失败，请稍后重试。");
    }
  }

  const canCreate = canReadRoles && permissions.includes("members:create");
  const memberActionPermissions = canReadRoles
    ? permissions
    : permissions.filter((permission) => permission !== "members:update");

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">成员管理</h1>
          <p className="text-sm text-muted-foreground">组织访问控制</p>
        </div>
        {canCreate ? <MemberFormDialog roles={roleItems} onSubmit={handleCreate} /> : null}
      </header>

      {errorMessage ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{errorMessage}</span>
          <Button size="sm" variant="outline" onClick={() => void handleRetry()}>
            重试
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载成员...</span>
          </CardContent>
        </Card>
      ) : (
        <MemberTable
          isMutating={isMutating}
          members={memberItems}
          permissions={memberActionPermissions}
          roles={roleItems}
          onRoleChange={handleRoleChange}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  );
}

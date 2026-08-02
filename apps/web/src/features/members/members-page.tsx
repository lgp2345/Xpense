import { Button } from "@heroui/react/button";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import type { IamApi, IamMember, IamRole } from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { MemberFormDialog } from "./member-form-dialog";
import { MemberTable } from "./member-table";

type MembersApi = Pick<IamApi, "listMembers" | "createMember" | "updateMember" | "listRoles">;

type MembersPageProps = {
  api?: MembersApi;
  members?: IamMember[];
  permissions: PermissionKey[];
  roles?: IamRole[];
};

function loadMembersData(api: MembersApi) {
  return Promise.all([api.listMembers(), api.listRoles()]);
}

export function MembersPage({ api = webIamApi, members, permissions, roles }: MembersPageProps) {
  const hasInitialData = members !== undefined && roles !== undefined;
  const [memberItems, setMemberItems] = useState(() => members ?? []);
  const [roleItems, setRoleItems] = useState(() => roles ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshMembers() {
    const [nextMembers, nextRoles] = await loadMembersData(api);
    setMemberItems(nextMembers);
    setRoleItems(nextRoles);
  }

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let isActive = true;

    void loadMembersData(api)
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
  }, [api, hasInitialData]);

  async function runMutation(operation: () => Promise<unknown>, error: string) {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      await operation();
      await refreshMembers();
    } catch {
      setErrorMessage(error);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCreate(input: { roleId: string; userId: string }) {
    await runMutation(() => api.createMember(input), "新增成员失败，请稍后重试。");
  }

  async function handleRoleChange(memberId: string, roleId: string) {
    await runMutation(
      () => api.updateMember(memberId, { roleId }),
      "更新成员角色失败，请稍后重试。",
    );
  }

  async function handleStatusChange(memberId: string, status: "active" | "disabled") {
    await runMutation(
      () => api.updateMember(memberId, { status }),
      "更新成员状态失败，请稍后重试。",
    );
  }

  async function handleRetry() {
    setErrorMessage(null);

    try {
      await refreshMembers();
    } catch {
      setErrorMessage("加载成员列表失败，请稍后重试。");
    }
  }

  const canCreate = permissions.includes("members.create");

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-4 text-[var(--color-ink)] sm:p-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-ink-muted)]">组织访问控制</p>
            <h1 className="mt-1 text-3xl font-normal">成员管理</h1>
          </div>
          {canCreate ? (
            <MemberFormDialog isSubmitting={isMutating} roles={roleItems} onSubmit={handleCreate} />
          ) : null}
        </header>

        {errorMessage ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3" role="alert">
            <span>{errorMessage}</span>
            <Button variant="secondary" onPress={() => void handleRetry()}>
              重试
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <p aria-live="polite" className="py-10 text-sm text-[var(--color-ink-muted)]">
            正在加载成员...
          </p>
        ) : (
          <MemberTable
            isMutating={isMutating}
            members={memberItems}
            permissions={permissions}
            roles={roleItems}
            onRoleChange={handleRoleChange}
            onStatusChange={handleStatusChange}
          />
        )}
      </section>
    </main>
  );
}

import { Button } from "@heroui/react/button";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import type {
  CreateRoleRequest,
  IamApi,
  IamPermission,
  IamRole,
  UpdateRoleRequest,
} from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { RoleEditorDialog, type RoleEditorInput } from "./role-editor-dialog";
import { RoleTable } from "./role-table";

type RolesApi = Pick<
  IamApi,
  "listRoles" | "createRole" | "updateRole" | "deleteRole" | "listPermissions"
>;

type RolesPageProps = {
  api?: RolesApi;
  permissionItems?: IamPermission[];
  permissions: PermissionKey[];
  roleItems?: IamRole[];
};

function loadRolesData(api: RolesApi) {
  return Promise.all([api.listRoles(), api.listPermissions()]);
}

export function RolesPage({
  api = webIamApi,
  permissionItems,
  permissions,
  roleItems,
}: RolesPageProps) {
  const hasInitialData = roleItems !== undefined && permissionItems !== undefined;
  const [roles, setRoles] = useState(() => roleItems ?? []);
  const [availablePermissions, setAvailablePermissions] = useState(() => permissionItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshRoles() {
    const [nextRoles, nextPermissions] = await loadRolesData(api);
    setRoles(nextRoles);
    setAvailablePermissions(nextPermissions);
  }

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let isActive = true;

    void loadRolesData(api)
      .then(([nextRoles, nextPermissions]) => {
        if (isActive) {
          setRoles(nextRoles);
          setAvailablePermissions(nextPermissions);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("加载角色和权限失败，请稍后重试。");
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
      await refreshRoles();
    } catch {
      setErrorMessage(error);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCreate(input: RoleEditorInput) {
    const request: CreateRoleRequest = input;
    await runMutation(() => api.createRole(request), "新增角色失败，请稍后重试。");
  }

  async function handleUpdate(roleId: string, input: UpdateRoleRequest) {
    await runMutation(() => api.updateRole(roleId, input), "更新角色失败，请稍后重试。");
  }

  async function handleDelete(roleId: string) {
    await runMutation(() => api.deleteRole(roleId), "删除角色失败，请稍后重试。");
  }

  async function handleRetry() {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await refreshRoles();
    } catch {
      setErrorMessage("加载角色和权限失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  const canCreate = permissions.includes("roles.create");
  const canUpdatePermissions = permissions.includes("roles.permissions.update");

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-4 text-[var(--color-ink)] sm:p-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-ink-muted)]">组织访问控制</p>
            <h1 className="mt-1 text-3xl font-normal">角色管理</h1>
          </div>
          {canCreate ? (
            <RoleEditorDialog
              canUpdatePermissions={canUpdatePermissions}
              isSubmitting={isMutating}
              permissions={availablePermissions}
              triggerLabel="新增角色"
              onSubmit={handleCreate}
            />
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
            正在加载角色和权限...
          </p>
        ) : (
          <RoleTable
            isMutating={isMutating}
            permissionItems={availablePermissions}
            permissions={permissions}
            roles={roles}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
          />
        )}
      </section>
    </main>
  );
}

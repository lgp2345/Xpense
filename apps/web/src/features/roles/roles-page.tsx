import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CreateRoleRequest,
  IamApi,
  IamPermission,
  IamRoleWithPermissions,
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
  roleItems?: IamRoleWithPermissions[];
};

function loadRolesData(api: RolesApi, canReadPermissions: boolean) {
  return Promise.all([
    api.listRoles(),
    canReadPermissions ? api.listPermissions() : Promise.resolve([] as IamPermission[]),
  ]);
}

export function RolesPage({
  api = webIamApi,
  permissionItems,
  permissions,
  roleItems,
}: RolesPageProps) {
  const canReadPermissions = permissions.includes("permissions.read");
  const hasInitialData =
    roleItems !== undefined && (!canReadPermissions || permissionItems !== undefined);
  const [roles, setRoles] = useState(() => roleItems ?? []);
  const [availablePermissions, setAvailablePermissions] = useState(() => permissionItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshRoles() {
    const [nextRoles, nextPermissions] = await loadRolesData(api, canReadPermissions);
    setRoles(nextRoles);
    setAvailablePermissions(nextPermissions);
  }

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let isActive = true;

    void loadRolesData(api, canReadPermissions)
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
  }, [api, canReadPermissions, hasInitialData]);

  async function handleCreate(input: RoleEditorInput): Promise<boolean> {
    const request: CreateRoleRequest = input;
    setErrorMessage(null);

    try {
      await api.createRole(request);
    } catch {
      return false;
    }

    try {
      await refreshRoles();
    } catch {
      setErrorMessage("角色已新增，但刷新列表失败，请稍后重试。");
    }

    return true;
  }

  async function handleUpdate(roleId: string, input: UpdateRoleRequest): Promise<boolean> {
    setErrorMessage(null);

    try {
      await api.updateRole(roleId, input);
    } catch {
      return false;
    }

    try {
      await refreshRoles();
    } catch {
      setErrorMessage("角色已更新，但刷新列表失败，请稍后重试。");
    }

    return true;
  }

  async function handleDelete(roleId: string): Promise<boolean> {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      await api.deleteRole(roleId);
    } catch {
      setErrorMessage("删除角色失败，请稍后重试。");
      return false;
    } finally {
      setIsMutating(false);
    }

    try {
      await refreshRoles();
    } catch {
      setErrorMessage("角色已删除，但刷新列表失败，请稍后重试。");
    }

    return true;
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
  const canUpdatePermissions =
    canReadPermissions && permissions.includes("roles.permissions.update");

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">角色管理</h1>
          <p className="text-sm text-muted-foreground">组织访问控制</p>
        </div>
        {canCreate ? (
          <RoleEditorDialog
            canUpdatePermissions={canUpdatePermissions}
            permissions={availablePermissions}
            triggerLabel="新增角色"
            onSubmit={handleCreate}
          />
        ) : null}
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
            <span className="sr-only">正在加载角色和权限...</span>
          </CardContent>
        </Card>
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
    </main>
  );
}

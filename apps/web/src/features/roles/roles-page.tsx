import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CreateRoleRequest,
  IamApi,
  IamRoleWithPermissions,
  UpdateRoleRequest,
} from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { RoleEditorDialog, type RoleEditorInput, RoleEditorSaveError } from "./role-editor-dialog";
import { RoleTable } from "./role-table";

type RolesApi = Pick<
  IamApi,
  | "listRoles"
  | "createRole"
  | "deleteRole"
  | "getPermissionTree"
  | "editRole"
  | "editRolePermissions"
>;

type RolesPageProps = {
  api?: RolesApi;
  permissionTreeItems?: PermissionTreeNode[];
  permissions: PermissionKey[];
  roleItems?: IamRoleWithPermissions[];
};

function loadRolesData(api: RolesApi, canUpdatePermissions: boolean) {
  return Promise.all([
    api.listRoles(),
    canUpdatePermissions ? api.getPermissionTree() : Promise.resolve([] as PermissionTreeNode[]),
  ]);
}

export function RolesPage({
  api = webIamApi,
  permissionTreeItems,
  permissions,
  roleItems,
}: RolesPageProps) {
  const canEditMetadata = permissions.includes("roles:update");
  const canUpdatePermissions = permissions.includes("roles:permissions:update");
  const hasInitialData =
    roleItems !== undefined && (!canUpdatePermissions || permissionTreeItems !== undefined);
  const [roles, setRoles] = useState(() => roleItems ?? []);
  const [availablePermissionTree, setAvailablePermissionTree] = useState(() =>
    canUpdatePermissions ? (permissionTreeItems ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshRoles() {
    const [nextRoles, nextPermissionTree] = await loadRolesData(api, canUpdatePermissions);
    setRoles(nextRoles);
    setAvailablePermissionTree(nextPermissionTree);
  }

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let isActive = true;

    void loadRolesData(api, canUpdatePermissions)
      .then(([nextRoles, nextPermissionTree]) => {
        if (isActive) {
          setRoles(nextRoles);
          setAvailablePermissionTree(nextPermissionTree);
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
  }, [api, canUpdatePermissions, hasInitialData]);

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

    if (canEditMetadata) {
      try {
        await api.editRole({
          roleId,
          name: input.name,
          description: input.description,
        });
      } catch {
        throw new RoleEditorSaveError("basic-info");
      }
    }

    if (canUpdatePermissions && input.permissionKeys !== undefined) {
      try {
        await api.editRolePermissions({ roleId, permissionKeys: input.permissionKeys });
      } catch {
        throw new RoleEditorSaveError("permissions");
      }
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

  const canCreate = permissions.includes("roles:create");

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
            permissionTree={availablePermissionTree}
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
          canUpdatePermissions={canUpdatePermissions}
          isMutating={isMutating}
          permissionTree={availablePermissionTree}
          permissions={permissions}
          roles={roles}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </main>
  );
}

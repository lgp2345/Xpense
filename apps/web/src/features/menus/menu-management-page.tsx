import type { MenuConfigurationNode, PermissionKey } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { IamApi } from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { MenuFormDialog } from "./menu-form-dialog";
import type { MenuFormValues, MenuRouteOption } from "./menu-form-schema";
import { MenuTreeTable } from "./menu-tree-table";

type MenusApi = Pick<
  IamApi,
  "addMenu" | "deleteMenu" | "editMenu" | "editMenuOrder" | "getMenuConfiguration"
>;

type MenuManagementPageProps = {
  api?: MenusApi;
  menuItems?: MenuConfigurationNode[];
  onAuthorizedMenusRefresh: () => Promise<void>;
  permissions: PermissionKey[];
  routeOptions: MenuRouteOption[];
};

type EditorState =
  | { kind: "create"; initialParentId: number | null }
  | { kind: "edit"; node: MenuConfigurationNode };

type ConfigurationRefreshResult = "applied" | "failed" | "stale";

const SYNCHRONIZATION_ERROR = "菜单操作已成功，但配置与导航同步未完成，请重试同步。";

export function MenuManagementPage({
  api = webIamApi,
  menuItems,
  onAuthorizedMenusRefresh,
  permissions,
  routeOptions,
}: MenuManagementPageProps) {
  const hasInitialItems = menuItems !== undefined;
  const [nodes, setNodes] = useState(() => menuItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialItems);
  const [isMutating, setIsMutating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [hasPendingSynchronization, setHasPendingSynchronization] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const configurationRequestGeneration = useRef(0);

  const refreshMenus = useCallback(async (): Promise<ConfigurationRefreshResult> => {
    const requestGeneration = configurationRequestGeneration.current + 1;
    configurationRequestGeneration.current = requestGeneration;

    try {
      const nextNodes = await api.getMenuConfiguration();

      if (requestGeneration !== configurationRequestGeneration.current) {
        return "stale";
      }

      setNodes(nextNodes);
      return "applied";
    } catch {
      return requestGeneration === configurationRequestGeneration.current ? "failed" : "stale";
    }
  }, [api]);

  useEffect(() => {
    if (hasInitialItems) {
      return;
    }

    setIsLoading(true);

    void refreshMenus().then((result) => {
      if (result === "failed") {
        setRequestError("加载菜单配置失败，请稍后重试。");
        setIsLoading(false);
      } else if (result === "applied") {
        setRequestError(null);
        setIsLoading(false);
      }
    });

    return () => {
      configurationRequestGeneration.current += 1;
    };
  }, [hasInitialItems, refreshMenus]);

  async function handleSave(input: MenuFormValues): Promise<boolean> {
    if (!editor || isLoading || isMutating) {
      return false;
    }

    setRequestError(null);
    setIsMutating(true);

    try {
      if (editor.kind === "edit") {
        await api.editMenu({ ...input, id: editor.node.id });
      } else {
        await api.addMenu(input);
      }
    } catch {
      setIsMutating(false);
      return false;
    }

    await refreshAfterMutation();

    return true;
  }

  async function handleMove(node: MenuConfigurationNode, direction: "up" | "down") {
    if (isLoading || isMutating) {
      return;
    }

    setRequestError(null);
    setIsMutating(true);

    try {
      await api.editMenuOrder(node.id, direction);
    } catch {
      setRequestError("调整菜单顺序失败，请稍后重试。");
      setIsMutating(false);
      return;
    }

    await refreshAfterMutation();
  }

  async function handleDelete(node: MenuConfigurationNode) {
    if (node.children.length > 0 || isLoading || isMutating) {
      return;
    }

    setRequestError(null);
    setIsMutating(true);

    try {
      await api.deleteMenu(node.id);
    } catch {
      setRequestError("删除菜单节点失败，请稍后重试。");
      setIsMutating(false);
      return;
    }

    await refreshAfterMutation();
  }

  async function refreshAfterMutation() {
    setHasPendingSynchronization(true);
    await synchronizeConfigurationAndAuthorizedMenus();
    setIsMutating(false);
  }

  async function handleRetry() {
    setRequestError(null);
    setIsLoading(true);

    const result = await refreshMenus();

    if (result === "failed") {
      setRequestError("加载菜单配置失败，请稍后重试。");
    }
    if (result !== "stale") {
      setIsLoading(false);
    }
  }

  async function handleSynchronizationRetry() {
    setIsMutating(true);
    await synchronizeConfigurationAndAuthorizedMenus();
    setIsMutating(false);
  }

  async function synchronizeConfigurationAndAuthorizedMenus() {
    const configurationResult = await refreshMenus();

    if (configurationResult !== "applied") {
      return;
    }

    setIsLoading(false);

    if (typeof onAuthorizedMenusRefresh !== "function") {
      setHasPendingSynchronization(true);
      return;
    }

    try {
      await onAuthorizedMenusRefresh();
      setHasPendingSynchronization(false);
    } catch {
      setHasPendingSynchronization(true);
    }
  }

  const canCreate = permissions.includes("menus:create");
  const canUpdate = permissions.includes("menus:update");
  const canDelete = permissions.includes("menus:delete");
  const editorKey =
    editor?.kind === "edit"
      ? `edit-${editor.node.id}`
      : `create-${editor?.initialParentId ?? "root"}`;

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">菜单管理</h1>
          <p className="text-sm text-muted-foreground">配置当前组织的导航、页面和按钮权限节点</p>
        </div>
        {canCreate ? (
          <Button
            disabled={isLoading || isMutating}
            onClick={() => setEditor({ kind: "create", initialParentId: null })}
          >
            新增根节点
          </Button>
        ) : null}
      </header>

      {hasPendingSynchronization ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          <span>{SYNCHRONIZATION_ERROR}</span>
          <Button
            disabled={isMutating}
            size="sm"
            variant="outline"
            onClick={() => void handleSynchronizationRetry()}
          >
            重试同步
          </Button>
        </div>
      ) : null}

      {requestError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{requestError}</span>
          <Button size="sm" variant="outline" onClick={() => void handleRetry()}>
            重试
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <span className="sr-only">正在加载菜单配置...</span>
          </CardContent>
        </Card>
      ) : (
        <MenuTreeTable
          canCreate={canCreate}
          canDelete={canDelete}
          canUpdate={canUpdate}
          isMutating={isMutating}
          nodes={nodes}
          onAddChild={(node) => setEditor({ kind: "create", initialParentId: node.id })}
          onDelete={handleDelete}
          onEdit={(node) => setEditor({ kind: "edit", node })}
          onMove={handleMove}
        />
      )}

      {editor ? (
        <MenuFormDialog
          busy={isLoading || isMutating}
          key={editorKey}
          initialParentId={editor.kind === "create" ? editor.initialParentId : undefined}
          node={editor.kind === "edit" ? editor.node : undefined}
          open
          routeOptions={routeOptions}
          tree={nodes}
          onOpenChange={(open) => {
            if (!open) {
              setEditor(null);
            }
          }}
          onSubmit={handleSave}
        />
      ) : null}
    </main>
  );
}

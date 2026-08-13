import type { MenuConfigurationNode, PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

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
  permissions: PermissionKey[];
  routeOptions: MenuRouteOption[];
};

type EditorState =
  | { kind: "create"; initialParentId: number | null }
  | { kind: "edit"; node: MenuConfigurationNode };

export function MenuManagementPage({
  api = webIamApi,
  menuItems,
  permissions,
  routeOptions,
}: MenuManagementPageProps) {
  const hasInitialItems = menuItems !== undefined;
  const [nodes, setNodes] = useState(() => menuItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialItems);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  async function refreshMenus() {
    const nextNodes = await api.getMenuConfiguration();
    setNodes(nextNodes);
  }

  useEffect(() => {
    if (hasInitialItems) {
      return;
    }

    let isActive = true;

    void api
      .getMenuConfiguration()
      .then((nextNodes) => {
        if (isActive) {
          setNodes(nextNodes);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("加载菜单配置失败，请稍后重试。");
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
  }, [api, hasInitialItems]);

  async function handleSave(input: MenuFormValues): Promise<boolean> {
    if (!editor) {
      return false;
    }

    setErrorMessage(null);
    setIsMutating(true);

    try {
      if (editor.kind === "edit") {
        await api.editMenu({ ...input, id: editor.node.id });
      } else {
        await api.addMenu(input);
      }
    } catch {
      return false;
    } finally {
      setIsMutating(false);
    }

    try {
      await refreshMenus();
    } catch {
      setErrorMessage("菜单节点已保存，但刷新配置失败，请稍后重试。");
    }

    return true;
  }

  async function handleMove(node: MenuConfigurationNode, direction: "up" | "down") {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      await api.editMenuOrder(node.id, direction);
    } catch {
      setErrorMessage("调整菜单顺序失败，请稍后重试。");
      return;
    } finally {
      setIsMutating(false);
    }

    try {
      await refreshMenus();
    } catch {
      setErrorMessage("菜单顺序已调整，但刷新配置失败，请稍后重试。");
    }
  }

  async function handleDelete(node: MenuConfigurationNode) {
    if (node.children.length > 0) {
      return;
    }

    setErrorMessage(null);
    setIsMutating(true);

    try {
      await api.deleteMenu(node.id);
    } catch {
      setErrorMessage("删除菜单节点失败，请稍后重试。");
      return;
    } finally {
      setIsMutating(false);
    }

    try {
      await refreshMenus();
    } catch {
      setErrorMessage("菜单节点已删除，但刷新配置失败，请稍后重试。");
    }
  }

  async function handleRetry() {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await refreshMenus();
    } catch {
      setErrorMessage("加载菜单配置失败，请稍后重试。");
    } finally {
      setIsLoading(false);
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
          <Button onClick={() => setEditor({ kind: "create", initialParentId: null })}>
            新增根节点
          </Button>
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

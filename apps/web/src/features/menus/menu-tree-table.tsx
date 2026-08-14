import type { MenuConfigurationNode } from "@xpense/shared";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileKey2,
  FolderTree,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MenuTreeTableProps = {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  isMutating: boolean;
  nodes: readonly MenuConfigurationNode[];
  onAddChild: (node: MenuConfigurationNode) => void;
  onDelete: (node: MenuConfigurationNode) => Promise<void>;
  onEdit: (node: MenuConfigurationNode) => void;
  onMove: (node: MenuConfigurationNode, direction: "up" | "down") => Promise<void>;
};

type VisibilityContext = {
  hasHiddenAncestor: boolean;
  hasMenuAncestor: boolean;
};

export function MenuTreeTable({
  canCreate,
  canDelete,
  canUpdate,
  isMutating,
  nodes,
  onAddChild,
  onDelete,
  onEdit,
  onMove,
}: MenuTreeTableProps) {
  if (nodes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">当前组织还没有菜单配置。</p>
    );
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead className="w-[22%]">路由或外链</TableHead>
              <TableHead>权限</TableHead>
              <TableHead className="w-[20%]">可见性</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderRows(nodes, {
              canCreate,
              canDelete,
              canUpdate,
              depth: 0,
              isMutating,
              visibility: { hasHiddenAncestor: false, hasMenuAncestor: false },
              onAddChild,
              onDelete,
              onEdit,
              onMove,
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type RenderRowsOptions = Omit<MenuTreeTableProps, "nodes"> & {
  depth: number;
  visibility: VisibilityContext;
};

function renderRows(
  nodes: readonly MenuConfigurationNode[],
  options: RenderRowsOptions,
): ReactNode[] {
  return nodes.flatMap((node, index) => {
    const hasChildren = node.children.length > 0;
    const canHaveChildren =
      node.type === "directory" || (node.type === "menu" && node.isExternal === false);
    const row = (
      <TableRow key={node.id}>
        <TableCell>
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: `${options.depth * 0.75}rem` }}
            />
            <NodeIcon node={node} />
            <span className="truncate font-medium" title={node.name}>
              {node.name}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{nodeTypeLabel(node)}</Badge>
        </TableCell>
        <TableCell>{renderDestination(node)}</TableCell>
        <TableCell>
          <span className="font-mono text-xs text-muted-foreground">
            {node.permissionCode ?? "-"}
          </span>
        </TableCell>
        <TableCell>
          <div className="grid gap-1">
            <span className="text-xs text-foreground">{selfVisibilityLabel(node)}</span>
            <span className="text-xs text-muted-foreground">
              {effectiveVisibilityLabel(node, options.visibility)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            {options.canCreate && canHaveChildren ? (
              <Button
                aria-label={`新增子节点 ${node.name}`}
                disabled={options.isMutating}
                size="icon"
                title="新增子节点"
                variant="ghost"
                onClick={() => options.onAddChild(node)}
              >
                <Plus />
              </Button>
            ) : null}
            {options.canUpdate ? (
              <>
                <Button
                  aria-label={`上移 ${node.name}`}
                  disabled={options.isMutating || index === 0}
                  size="icon"
                  title={index === 0 ? "已经是同级第一项" : "上移"}
                  variant="ghost"
                  onClick={() => void options.onMove(node, "up")}
                >
                  <ArrowUp />
                </Button>
                <Button
                  aria-label={`下移 ${node.name}`}
                  disabled={options.isMutating || index === nodes.length - 1}
                  size="icon"
                  title={index === nodes.length - 1 ? "已经是同级最后一项" : "下移"}
                  variant="ghost"
                  onClick={() => void options.onMove(node, "down")}
                >
                  <ArrowDown />
                </Button>
                <Button
                  aria-label={`编辑 ${node.name}`}
                  disabled={options.isMutating}
                  size="icon"
                  title="编辑"
                  variant="ghost"
                  onClick={() => options.onEdit(node)}
                >
                  <Pencil />
                </Button>
              </>
            ) : null}
            {options.canDelete ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    aria-label={`删除 ${node.name}`}
                    disabled={options.isMutating || hasChildren}
                    size="icon"
                    title={hasChildren ? "包含子节点，不能删除" : "删除"}
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除菜单节点</AlertDialogTitle>
                    <AlertDialogDescription>
                      确认删除“{node.name}”？此操作会立即修改当前组织的菜单配置。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      disabled={options.isMutating}
                      onClick={() => void options.onDelete(node)}
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    );
    const nextVisibility = {
      hasHiddenAncestor:
        options.visibility.hasHiddenAncestor ||
        (node.type !== "button" && node.isVisible === false),
      hasMenuAncestor: options.visibility.hasMenuAncestor || node.type === "menu",
    };

    return [
      row,
      ...renderRows(node.children, {
        ...options,
        depth: options.depth + 1,
        visibility: nextVisibility,
      }),
    ];
  });
}

function NodeIcon({ node }: { node: MenuConfigurationNode }) {
  if (node.type === "directory") {
    return <FolderTree aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (node.type === "button") {
    return <FileKey2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (node.isExternal) {
    return <Link2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
}

function nodeTypeLabel(node: MenuConfigurationNode): string {
  if (node.type === "directory") {
    return "目录";
  }
  if (node.type === "button") {
    return "按钮";
  }
  return node.isExternal ? "外链菜单" : "内部菜单";
}

function renderDestination(node: MenuConfigurationNode): ReactNode {
  if (node.type !== "menu") {
    return <span className="text-muted-foreground">-</span>;
  }
  if (node.isExternal) {
    return (
      <span className="block max-w-64 truncate text-xs text-muted-foreground" title={node.url}>
        {node.url}
      </span>
    );
  }
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-foreground">{node.path}</span>
      <span className="font-mono text-xs text-muted-foreground">{node.routeKey}</span>
    </div>
  );
}

function selfVisibilityLabel(node: MenuConfigurationNode): string {
  if (node.type === "button") {
    return "自身显隐不适用";
  }
  return node.isVisible ? "自身可见" : "自身隐藏";
}

function effectiveVisibilityLabel(node: MenuConfigurationNode, context: VisibilityContext): string {
  if (node.type === "button") {
    return "不进入导航";
  }
  if (!node.isVisible) {
    return "不会进入导航";
  }
  if (context.hasHiddenAncestor) {
    return "自身可见 · 受父级隐藏";
  }
  if (context.hasMenuAncestor) {
    return "不进入导航 · 位于菜单页面下";
  }
  return node.type === "directory" ? "目录层级可见" : "已进入导航";
}

import type { MenuConfigurationNode } from "@xpense/shared";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
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

export type MenuRowActionsProps = {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  isMutating: boolean;
  node: MenuConfigurationNode;
  index: number;
  siblingCount: number;
  onAddChild: (node: MenuConfigurationNode) => void;
  onDelete: (node: MenuConfigurationNode) => Promise<void>;
  onEdit: (node: MenuConfigurationNode) => void;
  onMove: (node: MenuConfigurationNode, direction: "up" | "down") => Promise<void>;
};

export function MenuRowActions({
  canCreate,
  canDelete,
  canUpdate,
  isMutating,
  node,
  index,
  siblingCount,
  onAddChild,
  onDelete,
  onEdit,
  onMove,
}: MenuRowActionsProps) {
  const hasChildren = node.children.length > 0;
  const canHaveChildren =
    node.type === "directory" || (node.type === "menu" && node.isExternal === false);
  return (
    <div className="flex justify-end gap-1">
      {canCreate && canHaveChildren ? (
        <Button
          aria-label={`新增子节点 ${node.name}`}
          disabled={isMutating}
          size="icon"
          title="新增子节点"
          variant="ghost"
          onClick={() => onAddChild(node)}
        >
          <Plus />
        </Button>
      ) : null}
      {canUpdate ? (
        <>
          <Button
            aria-label={`上移 ${node.name}`}
            disabled={isMutating || index === 0}
            size="icon"
            title={index === 0 ? "已经是同级第一项" : "上移"}
            variant="ghost"
            onClick={() => void onMove(node, "up")}
          >
            <ArrowUp />
          </Button>
          <Button
            aria-label={`下移 ${node.name}`}
            disabled={isMutating || index === siblingCount - 1}
            size="icon"
            title={index === siblingCount - 1 ? "已经是同级最后一项" : "下移"}
            variant="ghost"
            onClick={() => void onMove(node, "down")}
          >
            <ArrowDown />
          </Button>
          <Button
            aria-label={`编辑 ${node.name}`}
            disabled={isMutating}
            size="icon"
            title="编辑"
            variant="ghost"
            onClick={() => onEdit(node)}
          >
            <Pencil />
          </Button>
        </>
      ) : null}
      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                aria-label={`删除 ${node.name}`}
                disabled={isMutating || hasChildren}
                size="icon"
                title={hasChildren ? "包含子节点，不能删除" : "删除"}
                variant="ghost"
              >
                <Trash2 />
              </Button>
            }
          />
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
                disabled={isMutating}
                onClick={() => void onDelete(node)}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

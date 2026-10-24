import type { AuthorizedMenuNode } from "@xpense/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { IamRole } from "../../services/iam-api";

type RoleMenusDialogProps = {
  role: IamRole;
  loadMenus: (roleId: string) => Promise<AuthorizedMenuNode[]>;
};

export function RoleMenusDialog({ role, loadMenus }: RoleMenusDialogProps) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" aria-label={`查看 ${role.name} 的菜单`}>
            查看菜单
          </Button>
        }
      />
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words">{role.name}的菜单</DialogTitle>
          <DialogDescription>该角色在当前组织下可见的导航菜单，仅供查看。</DialogDescription>
        </DialogHeader>
        {open ? (
          <RoleMenusContent
            key={`${role.id}:${attempt}`}
            roleId={role.id}
            loadMenus={loadMenus}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline">关闭</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleMenusContent({
  roleId,
  loadMenus,
  onRetry,
}: Pick<RoleMenusDialogProps, "loadMenus"> & { roleId: string; onRetry: () => void }) {
  const [menus, setMenus] = useState<AuthorizedMenuNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasError(false);
    void loadMenus(roleId)
      .then((nextMenus) => {
        if (active) setMenus(nextMenus);
      })
      .catch(() => {
        if (active) setHasError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roleId, loadMenus]);

  if (isLoading) {
    return (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        正在加载菜单...
      </p>
    );
  }
  if (hasError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          加载角色菜单失败，请稍后重试。
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }
  if (menus.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">该角色暂无可见菜单。</p>;
  }
  return (
    <ul aria-label="角色菜单" className="divide-y rounded-lg border">
      {menus.map((node) => (
        <RoleMenuItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

function RoleMenuItem({ node }: { node: AuthorizedMenuNode }) {
  return (
    <li>
      <div className="min-w-0 px-3 py-2">
        <p className="break-words text-sm font-medium">{node.name}</p>
        {node.type === "menu" ? (
          <p className="break-all text-xs text-muted-foreground">
            {node.isExternal ? node.url : node.path}
          </p>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul aria-label={`${node.name}的子菜单`} className="mb-2 ml-4 border-l pl-2">
          {node.children.map((child) => (
            <RoleMenuItem key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

import { useQueryClient } from "@tanstack/react-query";
import type { RentalSpaceNode } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";

type SpaceMoveDialogProps = {
  api: Pick<RentalApi, "listChildren">;
  organizationId: string;
  propertyId: string;
  space: RentalSpaceNode;
  onMove: (parentId: string | null, sortOrder: number) => Promise<void>;
};
type MoveTarget = { depth: number; id: string; label: string };
type IndexedNode = RentalSpaceNode & { depth: number; label: string };

/** 按需读取所有分页分支，允许选择任意合法上级并在客户端提前排除环与超深移动。 */
export function SpaceMoveDialog({
  api,
  organizationId,
  propertyId,
  space,
  onMove,
}: SpaceMoveDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(space.parentId ?? "root");
  const [sortOrder, setSortOrder] = useState(space.sortOrder);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [targets, setTargets] = useState<MoveTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetError, setTargetError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setParentId(space.parentId ?? "root");
    setSortOrder(space.sortOrder);
    setLoadingTargets(true);
    setTargetError(false);
    void loadMoveTargets(queryClient, api, organizationId, propertyId, space)
      .then((nextTargets) => {
        if (!cancelled) setTargets(nextTargets);
      })
      .catch(() => {
        if (!cancelled) setTargetError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingTargets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, open, organizationId, propertyId, queryClient, space]);

  async function submit() {
    setSubmitError(null);
    try {
      await onMove(parentId === "root" ? null : parentId, sortOrder);
      setOpen(false);
    } catch {
      setSubmitError("移动空间失败，请检查目标层级后重试。");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSubmitError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button aria-label={`移动 ${space.name}`} size="sm" variant="outline">
          移动
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>移动空间</DialogTitle>
          <DialogDescription>
            加载当前房产的可用层级后，选择新的上级空间和同级排序。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {loadingTargets ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              正在加载可移动目标...
            </p>
          ) : null}
          {targetError ? (
            <p role="alert" className="text-sm text-destructive">
              加载移动目标失败，请关闭后重试。
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label>上级空间</Label>
            <Select
              disabled={loadingTargets || targetError}
              value={parentId}
              onValueChange={setParentId}
            >
              <SelectTrigger aria-label="移动目标">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">房产根目录</SelectItem>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="move-sort-order">排序</Label>
            <Input
              id="move-sort-order"
              inputMode="numeric"
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(Number(event.target.value))}
            />
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button disabled={loadingTargets || targetError} onClick={() => void submit()}>
              确认移动
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function loadMoveTargets(
  queryClient: ReturnType<typeof useQueryClient>,
  api: Pick<RentalApi, "listChildren">,
  organizationId: string,
  propertyId: string,
  source: RentalSpaceNode,
): Promise<MoveTarget[]> {
  const allNodes: IndexedNode[] = [];
  async function visit(parentId: string | null, depth: number, trail: string[]): Promise<void> {
    const items = await loadAllChildPages(queryClient, api, organizationId, propertyId, parentId);
    const indexed = items.map<IndexedNode>((item) => ({
      ...item,
      depth,
      label: [...trail, item.name].join(" / "),
    }));
    allNodes.push(...indexed);
    await Promise.all(
      indexed
        .filter((item) => item.hasChildren)
        .map((item) => visit(item.id, depth + 1, [...trail, item.name])),
    );
  }
  await visit(null, 1, []);
  const byParent = new Map<string | null, IndexedNode[]>();
  for (const node of allNodes)
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  const descendantIds = collectDescendants(byParent, source.id);
  const subtreeHeight = maxSubtreeHeight(byParent, source.id);
  return allNodes
    .filter(
      (node) =>
        node.isEffectivelyActive && !descendantIds.has(node.id) && node.depth + subtreeHeight <= 4,
    )
    .map((node) => ({ depth: node.depth, id: node.id, label: node.label }));
}

async function loadAllChildPages(
  queryClient: ReturnType<typeof useQueryClient>,
  api: Pick<RentalApi, "listChildren">,
  organizationId: string,
  propertyId: string,
  parentId: string | null,
): Promise<RentalSpaceNode[]> {
  const query = (page: number) =>
    rentalQueryOptions.children(api as RentalApi, organizationId, {
      propertyId,
      parentId,
      page,
      pageSize: 50,
    });
  const first = await queryClient.fetchQuery(query(1));
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(first.total / first.pageSize) - 1 }, (_, index) =>
      queryClient.fetchQuery(query(index + 2)),
    ),
  );
  return [first, ...pages].flatMap((page) => page.items);
}

function collectDescendants(
  byParent: ReadonlyMap<string | null, IndexedNode[]>,
  sourceId: string,
): Set<string> {
  const descendants = new Set<string>([sourceId]);
  const pending = [sourceId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    if (!parentId) continue;
    for (const child of byParent.get(parentId) ?? [])
      if (!descendants.has(child.id)) {
        descendants.add(child.id);
        pending.push(child.id);
      }
  }
  return descendants;
}

function maxSubtreeHeight(
  byParent: ReadonlyMap<string | null, IndexedNode[]>,
  sourceId: string,
): number {
  const children = byParent.get(sourceId) ?? [];
  return children.length === 0
    ? 0
    : 1 + Math.max(...children.map((child) => maxSubtreeHeight(byParent, child.id)));
}

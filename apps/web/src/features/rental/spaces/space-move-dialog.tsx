import { useQueryClient } from "@tanstack/react-query";
import type { RentalSpaceNode } from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";

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
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import {
  childPage,
  collapseSpace,
  createSpaceTreeState,
  expandSpace,
  hasMoreChildren,
  mergeChildPage,
  type SpaceTreeState,
} from "./space-tree-state";

const ROOT_TARGET = "root";
const SELECT_TARGET = "select-target";
const CHILD_PAGE_SIZE = 50;

type SpaceMoveDialogProps = {
  api: Pick<RentalApi, "listChildren">;
  organizationId: string;
  propertyId: string;
  space: RentalSpaceNode;
  onMove: (parentId: string | null, sortOrder: number) => Promise<void>;
};

/** 以渐进树选择移动目标；展开一个候选时才读取它的直属子空间。 */
export function SpaceMoveDialog({
  api,
  organizationId,
  propertyId,
  space,
  onMove,
}: SpaceMoveDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(space.parentId === null ? ROOT_TARGET : SELECT_TARGET);
  const [sortOrder, setSortOrder] = useState(space.sortOrder);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [candidateTree, setCandidateTree] = useState(createSpaceTreeState);
  const candidateTreeRef = useRef(candidateTree);
  const activeLoadsRef = useRef(new Set<string>());
  const [loadingParents, setLoadingParents] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const updateCandidateTree = useCallback(
    (updater: (current: SpaceTreeState) => SpaceTreeState) => {
      const next = updater(candidateTreeRef.current);
      candidateTreeRef.current = next;
      setCandidateTree(next);
    },
    [],
  );

  const loadCandidatePage = useCallback(
    async (candidateParentId: string | null, page: number): Promise<boolean> => {
      const key = candidateParentId ?? ROOT_TARGET;
      if (activeLoadsRef.current.has(key)) return false;
      activeLoadsRef.current.add(key);
      setLoadingParents((current) => [...current, key]);
      try {
        const result = await queryClient.fetchQuery({
          ...rentalQueryOptions.children(api as RentalApi, organizationId, {
            propertyId,
            parentId: candidateParentId,
            page,
            pageSize: CHILD_PAGE_SIZE,
          }),
          retry: false,
        });
        updateCandidateTree((current) => mergeChildPage(current, candidateParentId, result));
        setErrors((current) => ({ ...current, [key]: false }));
        return true;
      } catch {
        setErrors((current) => ({ ...current, [key]: true }));
        return false;
      } finally {
        activeLoadsRef.current.delete(key);
        setLoadingParents((current) => current.filter((item) => item !== key));
      }
    },
    [api, organizationId, propertyId, queryClient, updateCandidateTree],
  );

  useEffect(() => {
    if (!open) return;
    const emptyTree = createSpaceTreeState();
    candidateTreeRef.current = emptyTree;
    setCandidateTree(emptyTree);
    setParentId(space.parentId === null ? ROOT_TARGET : SELECT_TARGET);
    setSortOrder(space.sortOrder);
    setSubmitError(null);
    setErrors({});
    void loadCandidatePage(null, 1);
  }, [loadCandidatePage, open, space.parentId, space.sortOrder]);

  async function toggleCandidate(nodeId: string) {
    if (candidateTreeRef.current.expandedIds.includes(nodeId)) {
      updateCandidateTree((current) => collapseSpace(current, nodeId));
      return;
    }
    updateCandidateTree((current) => expandSpace(current, nodeId));
    if (!childPage(candidateTreeRef.current, nodeId)) await loadCandidatePage(nodeId, 1);
  }

  async function submit() {
    if (parentId === SELECT_TARGET) return;
    setSubmitError(null);
    try {
      await onMove(parentId === ROOT_TARGET ? null : parentId, sortOrder);
      setOpen(false);
    } catch {
      setSubmitError("移动空间失败，请检查目标层级后重试。");
    }
  }

  const rootPage = childPage(candidateTree, null);
  const sourceSubtreeRelativeDepth = space.hasChildren ? 3 : 0;
  const rootIsLoading = loadingParents.includes(ROOT_TARGET);
  const canSubmit = parentId !== SELECT_TARGET && !rootIsLoading;

  function renderCandidates(candidateParentId: string | null, targetParentLevel: number) {
    const page = childPage(candidateTree, candidateParentId);
    if (!page) return null;
    return (
      <div className="grid gap-2" style={{ marginLeft: `${targetParentLevel * 12}px` }}>
        {page.items.map((id) => {
          const node = candidateTree.nodesById[id];
          if (!node) return null;
          const isSource = node.id === space.id;
          const depthAllowed = targetParentLevel + 1 + sourceSubtreeRelativeDepth <= 4;
          const canSelect = !isSource && node.isEffectivelyActive && depthAllowed;
          const isExpanded = candidateTree.expandedIds.includes(node.id);
          const loading = loadingParents.includes(node.id);
          return (
            <div key={node.id} className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {canSelect ? (
                  <Button
                    aria-pressed={parentId === node.id}
                    onClick={() => setParentId(node.id)}
                    size="sm"
                    type="button"
                    variant={parentId === node.id ? "default" : "outline"}
                  >
                    选择 {node.name}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {node.name}
                    {isSource ? "（当前空间，不可作为目标）" : null}
                    {!isSource && !node.isEffectivelyActive ? "（不可用）" : null}
                    {!isSource && node.isEffectivelyActive && !depthAllowed ? "（层级超限）" : null}
                  </span>
                )}
                {node.hasChildren && !isSource && canSelect ? (
                  <Button
                    aria-label={`${isExpanded ? "折叠" : "展开"}候选 ${node.name}`}
                    disabled={loading}
                    onClick={() => void toggleCandidate(node.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {isExpanded ? "折叠" : "展开"}
                  </Button>
                ) : null}
              </div>
              {isExpanded ? renderCandidates(node.id, targetParentLevel + 1) : null}
              {isExpanded && hasMoreChildren(candidateTree, node.id) ? (
                <Button
                  disabled={loading}
                  onClick={() => {
                    const nextPage = (childPage(candidateTree, node.id)?.page ?? 0) + 1;
                    void loadCandidatePage(node.id, nextPage);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  加载更多 {node.name} 的候选
                </Button>
              ) : null}
              {errors[node.id] ? (
                <Button
                  onClick={() => void loadCandidatePage(node.id, 1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  重试加载 {node.name} 的候选
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
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
            展开候选空间后才加载其直属子空间；请选择新的上级空间和同级排序。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>上级空间</Label>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {parentId === SELECT_TARGET
                ? "请选择目标父级"
                : parentId === ROOT_TARGET
                  ? "已选择：房产根目录"
                  : `已选择：${candidateTree.nodesById[parentId]?.name ?? "目标空间"}`}
            </p>
            <div
              aria-label="移动目标"
              className="max-h-64 overflow-y-auto rounded-md border p-3"
              role="tree"
            >
              <Button
                aria-pressed={parentId === ROOT_TARGET}
                onClick={() => setParentId(ROOT_TARGET)}
                size="sm"
                type="button"
                variant={parentId === ROOT_TARGET ? "default" : "outline"}
              >
                选择房产根目录
              </Button>
              {rootIsLoading && !rootPage ? (
                <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                  正在加载可移动目标...
                </p>
              ) : null}
              <div className="mt-2">{renderCandidates(null, 1)}</div>
              {hasMoreChildren(candidateTree, null) ? (
                <Button
                  disabled={rootIsLoading}
                  onClick={() => {
                    const nextPage = (childPage(candidateTree, null)?.page ?? 0) + 1;
                    void loadCandidatePage(null, nextPage);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  加载更多可移动根空间
                </Button>
              ) : null}
              {errors[ROOT_TARGET] ? (
                <Button
                  onClick={() => void loadCandidatePage(null, 1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  重试加载可移动目标
                </Button>
              ) : null}
            </div>
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
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              确认移动
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

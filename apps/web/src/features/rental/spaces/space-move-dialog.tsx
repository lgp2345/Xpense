import { useQuery } from "@tanstack/react-query";
import type { RentalSpaceNode } from "@xpense/shared";
import { useState } from "react";

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

/** 加载当前房产根空间供选择；房产停用时由调用者不渲染入口。 */
export function SpaceMoveDialog({
  api,
  organizationId,
  propertyId,
  space,
  onMove,
}: SpaceMoveDialogProps) {
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(space.parentId ?? "root");
  const [sortOrder, setSortOrder] = useState(space.sortOrder);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const targetsQuery = useQuery({
    ...rentalQueryOptions.children(api as RentalApi, organizationId, {
      propertyId,
      parentId: null,
      page: 1,
      pageSize: 50,
    }),
    enabled: open,
  });
  const targets = (targetsQuery.data?.items ?? []).filter((item) => item.id !== space.id);

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
            选择新的上级空间和同级排序。目标列表只加载当前房产根空间。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {targetsQuery.isPending ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              正在加载可移动目标...
            </p>
          ) : null}
          {targetsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              加载移动目标失败，请关闭后重试。
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label>上级空间</Label>
            <Select
              disabled={targetsQuery.isPending || targetsQuery.isError}
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
                    {target.name}
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
            <Button
              disabled={targetsQuery.isPending || targetsQuery.isError}
              onClick={() => void submit()}
            >
              确认移动
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

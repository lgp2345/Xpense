import type { BatchCreateRentalSpacesRequest, RentalSpaceType } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { parseSpaceBatch } from "./space-batch-parser";
import { spaceTypeOptions } from "./space-form-schema";

type SpaceBatchDialogProps = {
  propertyId: string;
  parentId?: string;
  onCreate: (input: BatchCreateRentalSpacesRequest) => Promise<void>;
};

/** 预览逐行批量创建内容；服务端失败时保留原始文本与解析结果。 */
export function SpaceBatchDialog({ propertyId, parentId, onCreate }: SpaceBatchDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<RentalSpaceType>("room");
  const [customTypeName, setCustomTypeName] = useState("");
  const [isRentable, setIsRentable] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const parsed = parseSpaceBatch(text);
  const validType = type !== "other" || customTypeName.trim().length > 0;

  async function submit() {
    if (parsed.items.length === 0 || parsed.errors.length > 0 || !validType) return;
    setSubmitError(null);
    try {
      await onCreate({
        propertyId,
        ...(parentId ? { parentId } : {}),
        type,
        ...(type === "other" ? { customTypeName: customTypeName.trim() } : {}),
        isRentable,
        items: parsed.items,
      });
      setOpen(false);
      setText("");
      setCustomTypeName("");
    } catch {
      setSubmitError("批量创建失败，未创建任何空间。请保留并修正当前输入后重试。");
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
        <Button variant="outline">批量新增</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>批量新增空间</DialogTitle>
          <DialogDescription>
            每行填写“名称”或“编号,名称”，最多 500 个；提交会原子创建。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="space-batch-lines">空间列表</Label>
            <textarea
              aria-label="空间列表"
              className="min-h-36 rounded-md border bg-background p-2 text-sm"
              id="space-batch-lines"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>空间类型</Label>
            <Select value={type} onValueChange={(value) => setType(value as RentalSpaceType)}>
              <SelectTrigger aria-label="批量空间类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaceTypeOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "other" ? (
            <div className="grid gap-2">
              <Label htmlFor="batch-custom-type">自定义类型</Label>
              <Input
                id="batch-custom-type"
                value={customTypeName}
                onChange={(event) => setCustomTypeName(event.target.value)}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox
              id="batch-rentable"
              checked={isRentable}
              onCheckedChange={(checked) => setIsRentable(checked === true)}
            />
            <Label htmlFor="batch-rentable">可出租</Label>
          </div>
          <div className="rounded-md border p-3 text-sm" aria-live="polite">
            <p>有效空间：{parsed.items.length} 个</p>
            {parsed.errors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {parsed.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    第 {error.line} 行：{error.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {!validType ? (
            <p role="alert" className="text-sm text-destructive">
              请输入自定义类型
            </p>
          ) : null}
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
              disabled={parsed.items.length === 0 || parsed.errors.length > 0 || !validType}
              onClick={() => void submit()}
            >
              原子创建 {parsed.items.length} 个空间
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

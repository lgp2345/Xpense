import { useForm, useStore } from "@tanstack/react-form";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const form = useForm({
    defaultValues: {
      text: "",
      type: "room" as RentalSpaceType,
      customTypeName: "",
      isRentable: true,
      note: "",
    },
  });
  const { text, type, customTypeName, isRentable, note } = useStore(
    form.store,
    (state) => state.values,
  );
  const setText = (value: typeof text) => form.setFieldValue("text", value);
  const setType = (value: typeof type) => form.setFieldValue("type", value);
  const setCustomTypeName = (value: typeof customTypeName) =>
    form.setFieldValue("customTypeName", value);
  const setIsRentable = (value: typeof isRentable) => form.setFieldValue("isRentable", value);
  const setNote = (value: typeof note) => form.setFieldValue("note", value);
  const [open, setOpen] = useState(false);
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
        ...(note.trim() ? { note: note.trim() } : {}),
        items: parsed.items,
      });
      setOpen(false);
      setText("");
      setCustomTypeName("");
      setNote("");
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
        <FieldGroup className="grid gap-4">
          <Field data-invalid={parsed.errors.length > 0}>
            <FieldLabel htmlFor="space-batch-lines">空间列表</FieldLabel>
            <textarea
              aria-label="空间列表"
              className="min-h-36 rounded-md border bg-background p-2 text-sm"
              id="space-batch-lines"
              aria-invalid={parsed.errors.length > 0}
              aria-describedby={parsed.errors.length ? "space-batch-errors" : undefined}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <FieldError id="space-batch-errors">
              {parsed.errors.length
                ? parsed.errors.map((error) => `第 ${error.line} 行：${error.message}`).join("；")
                : undefined}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel>空间类型</FieldLabel>
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
          </Field>
          {type === "other" ? (
            <Field data-invalid={!validType}>
              <FieldLabel htmlFor="batch-custom-type">自定义类型</FieldLabel>
              <Input
                id="batch-custom-type"
                aria-invalid={!validType}
                aria-describedby={!validType ? "batch-custom-type-error" : undefined}
                value={customTypeName}
                onChange={(event) => setCustomTypeName(event.target.value)}
              />
              <FieldError id="batch-custom-type-error">
                {!validType ? "请输入自定义类型" : undefined}
              </FieldError>
            </Field>
          ) : null}
          <Field orientation="horizontal">
            <Checkbox
              id="batch-rentable"
              checked={isRentable}
              onCheckedChange={(checked) => setIsRentable(checked === true)}
            />
            <FieldLabel htmlFor="batch-rentable">可出租</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="batch-note">备注</FieldLabel>
            <Input id="batch-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="rounded-md border p-3 text-sm" aria-live="polite">
            <p>有效空间：{parsed.items.length} 个</p>
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
              disabled={parsed.items.length === 0 || parsed.errors.length > 0 || !validType}
              onClick={() => void submit()}
            >
              原子创建 {parsed.items.length} 个空间
            </Button>
          </DialogFooter>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

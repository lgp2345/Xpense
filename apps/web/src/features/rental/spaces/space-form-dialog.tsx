import { useForm } from "@tanstack/react-form";
import type { CreateRentalSpaceRequest, RentalSpaceNode } from "@xpense/shared";
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
import type { UpdateRentalSpaceInput } from "../../../services/rental-api";
import {
  type SpaceFormValues,
  spaceFormDefaults,
  spaceFormSchema,
  spaceTypeOptions,
  toCreateSpaceRequest,
  toUpdateSpaceRequest,
} from "./space-form-schema";

type SpaceFormDialogProps = {
  parentId?: string;
  propertyId: string;
  space?: RentalSpaceNode;
  trigger?: React.ReactNode;
  onCreate?: (input: CreateRentalSpaceRequest) => Promise<void>;
  onUpdate?: (id: string, input: UpdateRentalSpaceInput) => Promise<void>;
};

/** 创建或编辑第一阶段空间资料；失败时保留当前录入内容。 */
export function SpaceFormDialog({
  parentId,
  propertyId,
  space,
  trigger,
  onCreate,
  onUpdate,
}: SpaceFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = space !== undefined;
  const initialValues = spaceFormDefaults(space);
  const form = useSpaceForm({
    initialValues,
    onCreate,
    onUpdate,
    parentId,
    propertyId,
    setOpen,
    setSubmitError,
    space,
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSubmitError(null);
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            aria-label={isEditing ? `编辑 ${space.name}` : undefined}
            size={isEditing ? "sm" : "default"}
          >
            {isEditing ? "编辑" : "新增空间"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑空间" : "新增空间"}</DialogTitle>
          <DialogDescription>
            仅维护空间层级和可出租属性，不包含面积或租赁计费信息。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <TextField form={form} label="名称" name="name" />
          <TextField form={form} label="编号" name="code" />
          <form.Field name="type">
            {(field) => (
              <div className="grid gap-2">
                <Label>空间类型</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as SpaceFormValues["type"])}
                >
                  <SelectTrigger aria-label="空间类型">
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
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.type === "other"}>
            {(isCustom) =>
              isCustom ? <TextField form={form} label="自定义类型" name="customTypeName" /> : null
            }
          </form.Subscribe>
          <form.Field name="isRentable">
            {(field) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRentable"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <Label htmlFor="isRentable">可出租</Label>
              </div>
            )}
          </form.Field>
          <form.Field name="sortOrder">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">排序</Label>
                <Input
                  id="sortOrder"
                  inputMode="numeric"
                  type="number"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(Number(event.target.value))}
                />
              </div>
            )}
          </form.Field>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button disabled={submitting} type="submit">
                  {submitting ? "正在保存..." : isEditing ? "保存空间" : "创建空间"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useSpaceForm({
  initialValues,
  onCreate,
  onUpdate,
  parentId,
  propertyId,
  setOpen,
  setSubmitError,
  space,
}: Omit<SpaceFormDialogProps, "trigger"> & {
  initialValues: SpaceFormValues;
  setOpen: (open: boolean) => void;
  setSubmitError: (error: string | null) => void;
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: { onChange: spaceFormSchema, onSubmit: spaceFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = spaceFormSchema.safeParse(value);
      if (!parsed.success) return;
      setSubmitError(null);
      try {
        if (space && onUpdate) {
          const input = toUpdateSpaceRequest(initialValues, parsed.data);
          if (input) await onUpdate(space.id, input);
        } else if (onCreate) {
          await onCreate(toCreateSpaceRequest(propertyId, parentId, parsed.data));
        }
        setOpen(false);
        form.reset();
      } catch {
        setSubmitError("保存空间失败，请检查输入后重试。");
      }
    },
  });
  return form;
}

type FormApi = ReturnType<typeof useSpaceForm>;
function TextField({
  form,
  label,
  name,
}: {
  form: FormApi;
  label: string;
  name: "name" | "code" | "customTypeName";
}) {
  return (
    <form.Field name={name}>
      {(field) => {
        const error = validationMessage(field.state.meta.errors[0]);
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            <Input
              aria-invalid={Boolean(error)}
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        );
      }}
    </form.Field>
  );
}

function validationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    const issue = error.issues[0];
    if (
      issue &&
      typeof issue === "object" &&
      "message" in issue &&
      typeof issue.message === "string"
    )
      return issue.message;
  }
  return undefined;
}

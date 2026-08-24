import { useForm } from "@tanstack/react-form";
import type { CategoryNode, CategoryType } from "@xpense/shared";
import { useState } from "react";
import { toast } from "sonner";

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
import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../../services/bookkeeping-api";
import {
  type CategoryFormValues,
  categoryFormSchema,
  toCreateCategoryRequest,
  toUpdateCategoryRequest,
} from "./category-form-schema";

type CategoryFormDialogProps = {
  category?: CategoryNode;
  initialParent?: CategoryNode;
  ledgerId: string;
  rootCategories: readonly CategoryNode[];
  type: CategoryType;
  onCreate?: (input: CreateCategoryRequest) => Promise<void>;
  onUpdate?: (id: string, input: UpdateCategoryRequest) => Promise<void>;
};

/** 创建或编辑分类的弹窗；上级选项只包含一级分类。 */
export function CategoryFormDialog({
  category,
  initialParent,
  ledgerId,
  rootCategories,
  type,
  onCreate,
  onUpdate,
}: CategoryFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = category !== undefined;
  const isFixedChild = initialParent !== undefined;
  const form = useCategoryDialogForm({
    category,
    initialParent,
    ledgerId,
    rootCategories,
    type,
    onCreate,
    onUpdate,
    setOpen,
    setSubmitError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSubmitError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size={isEditing || isFixedChild ? "sm" : "default"}
          variant={isEditing || isFixedChild ? "outline" : "default"}
          aria-label={
            isEditing
              ? `编辑 ${category.name}`
              : isFixedChild
                ? `在 ${initialParent.name} 下新增子分类`
                : undefined
          }
        >
          {isEditing ? "编辑" : isFixedChild ? "新增子分类" : "新增分类"}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑分类" : "新增分类"}</DialogTitle>
          <DialogDescription>
            {type === "expense" ? "支出分类" : "收入分类"}最多支持两级。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField form={form} label="分类名称" name="name" />
          <form.Field name="parentId">
            {(field) => (
              <div className="grid gap-2">
                <Label>上级分类</Label>
                <Select
                  disabled={isFixedChild}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                >
                  <SelectTrigger aria-label="上级分类" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无（一级分类）</SelectItem>
                    {rootCategories
                      .filter((root) => root.id !== category?.id)
                      .map((root) => (
                        <SelectItem key={root.id} value={root.id}>
                          {root.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-4">
            <TextField form={form} label="图标" name="icon" placeholder="utensils" />
            <TextField form={form} label="颜色" name="color" placeholder="#F97316" />
          </div>
          <TextField form={form} label="排序" name="sortOrder" placeholder="0" />
          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "正在保存..." : isEditing ? "保存分类" : "创建分类"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FormApi = ReturnType<typeof useCategoryDialogForm>;

/** 渲染分类表单字符串字段。 */
function TextField({
  form,
  label,
  name,
  placeholder,
}: {
  form: FormApi;
  label: string;
  name: "name" | "icon" | "color" | "sortOrder";
  placeholder?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => {
        const error = field.state.meta.isTouched
          ? getValidationMessage(field.state.meta.errors[0])
          : undefined;
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            <Input
              id={field.name}
              placeholder={placeholder}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      }}
    </form.Field>
  );
}

/** 构造分类表单初值。 */
function getDefaultValues(
  category?: CategoryNode,
  initialParent?: CategoryNode,
): CategoryFormValues {
  return {
    name: category?.name ?? "",
    parentId: initialParent?.id ?? category?.parentId ?? "none",
    icon: category?.icon ?? "",
    color: category?.color ?? "",
    sortOrder: (category?.sortOrder ?? 0).toString(),
  };
}

/** 创建保持精确表单值类型的分类表单实例。 */
function useCategoryDialogForm({
  category,
  initialParent,
  ledgerId,
  type,
  onCreate,
  onUpdate,
  setOpen,
  setSubmitError,
}: CategoryFormDialogProps & {
  setOpen: (open: boolean) => void;
  setSubmitError: (message: string | null) => void;
}) {
  const form = useForm({
    defaultValues: getDefaultValues(category, initialParent),
    validators: { onChange: categoryFormSchema, onSubmit: categoryFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const parsed = categoryFormSchema.safeParse(value);
      if (!parsed.success) return;
      try {
        if (category && onUpdate) {
          await onUpdate(category.id, toUpdateCategoryRequest(parsed.data));
        } else if (onCreate) {
          await onCreate(toCreateCategoryRequest(parsed.data, { ledgerId, type }));
        }
        setOpen(false);
        form.reset();
      } catch {
        toast.error("保存分类失败，请检查名称和层级后重试。");
        setSubmitError("保存分类失败，请检查名称和层级后重试。");
      }
    },
  });

  return form;
}

/** 从 TanStack Form/Zod 错误中提取用户消息。 */
function getValidationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return undefined;
  if ("message" in error && typeof error.message === "string") return error.message;
  if ("issues" in error && Array.isArray(error.issues)) {
    const issue = error.issues[0];
    if (
      issue &&
      typeof issue === "object" &&
      "message" in issue &&
      typeof issue.message === "string"
    ) {
      return issue.message;
    }
  }
  return undefined;
}

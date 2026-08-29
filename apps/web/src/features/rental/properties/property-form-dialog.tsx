import { useForm } from "@tanstack/react-form";
import type {
  CreateRentalPropertyRequest,
  RentalPropertyDetail,
  RentalPropertySummary,
  UpdateRentalPropertyRequest,
} from "@xpense/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type PropertyFormValues,
  propertyFormDefaults,
  propertyFormSchema,
  toCreatePropertyRequest,
  toUpdatePropertyRequest,
} from "./property-form-schema";

const propertyTypeOptions = [
  ["residential_unit", "住宅"],
  ["detached_house", "独栋住宅"],
  ["apartment_building", "公寓楼"],
  ["commercial_building", "商业楼"],
  ["complex", "园区"],
  ["shop", "商铺"],
  ["office", "办公"],
  ["warehouse", "仓储"],
  ["other", "其他"],
] as const;

type PropertyFormDialogProps = {
  property?: RentalPropertySummary | RentalPropertyDetail;
  loadDetail?: () => Promise<RentalPropertyDetail>;
  onCreate?: (input: CreateRentalPropertyRequest) => Promise<void>;
  onUpdate?: (input: UpdateRentalPropertyRequest) => Promise<void>;
};

/** 创建或编辑房产；提交成功后关闭，失败时保留用户输入。 */
export function PropertyFormDialog({
  property,
  loadDetail,
  onCreate,
  onUpdate,
}: PropertyFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadedProperty, setLoadedProperty] = useState<RentalPropertyDetail | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const detailRequestId = useRef(0);
  const isEditing = property !== undefined;
  const editingProperty = loadedProperty ?? property;
  const clearDetailState = useCallback(() => {
    detailRequestId.current += 1;
    setLoadedProperty(null);
    setSubmitError(null);
  }, []);
  const form = usePropertyForm({
    property: editingProperty,
    onCreate,
    onUpdate,
    setOpen,
    setSubmitError,
    clearDetailState,
  });

  useEffect(() => {
    if (!open || !property || !loadDetail) return;
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    void Promise.resolve(loadDetail())
      .then((detail) => {
        if (detailRequestId.current === requestId && detail) setLoadedProperty(detail);
      })
      .catch(() => {
        if (detailRequestId.current === requestId) setSubmitError("加载房产详情失败，请重试。");
      });
    return () => {
      if (detailRequestId.current === requestId) detailRequestId.current += 1;
    };
  }, [loadDetail, open, property]);

  useEffect(() => {
    if (!loadedProperty) return;
    const values = propertyFormDefaults(loadedProperty);
    for (const [name, value] of Object.entries(values) as [
      keyof PropertyFormValues,
      string | boolean,
    ][]) {
      form.setFieldValue(name, value as never);
    }
  }, [form, loadedProperty]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          clearDetailState();
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={isEditing ? `编辑 ${property.name}` : undefined}
          size={isEditing ? "sm" : "default"}
          variant={isEditing ? "outline" : "default"}
        >
          {isEditing ? "编辑" : "新增房产"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑房产" : "新增房产"}</DialogTitle>
          <DialogDescription>每个房产会维护独立账务，但此处不会显示账本标识。</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <TextField form={form} name="name" label="房产名称" />
          <form.Field name="type">
            {(field) => (
              <div className="grid gap-2">
                <Label>房产类型</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as PropertyFormValues["type"])}
                >
                  <SelectTrigger aria-label="房产类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyTypeOptions.map(([value, label]) => (
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
              isCustom ? <TextField form={form} name="customTypeName" label="自定义类型" /> : null
            }
          </form.Subscribe>
          <div className="grid grid-cols-2 gap-4">
            <TextField form={form} name="countryCode" label="国家代码" />
            <TextField form={form} name="province" label="省份" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField form={form} name="city" label="城市" />
            <TextField form={form} name="district" label="区县" />
          </div>
          <TextField form={form} name="addressLine" label="详细地址" />
          <TextField form={form} name="note" label="备注" />
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
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  {submitting ? "正在保存..." : isEditing ? "保存房产" : "创建房产"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FormApi = ReturnType<typeof usePropertyForm>;
function TextField({
  form,
  label,
  name,
}: {
  form: FormApi;
  label: string;
  name: keyof PropertyFormValues;
}) {
  return (
    <form.Field name={name}>
      {(field) => {
        const error = validationMessage(field.state.meta.errors[0]);
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        );
      }}
    </form.Field>
  );
}

function usePropertyForm({
  property,
  onCreate,
  onUpdate,
  setOpen,
  setSubmitError,
  clearDetailState,
}: PropertyFormDialogProps & {
  setOpen: (open: boolean) => void;
  setSubmitError: (message: string | null) => void;
  clearDetailState: () => void;
}) {
  const form = useForm({
    defaultValues: propertyFormDefaults(property),
    validators: { onChange: propertyFormSchema, onSubmit: propertyFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = propertyFormSchema.safeParse(value);
      if (!parsed.success) return;
      setSubmitError(null);
      try {
        if (property && onUpdate) {
          const input = toUpdatePropertyRequest(
            property.id,
            parsed.data,
            propertyFormDefaults(property),
          );
          if (input) await onUpdate(input);
        } else if (onCreate) await onCreate(toCreatePropertyRequest(parsed.data));
        clearDetailState();
        setOpen(false);
        form.reset();
      } catch {
        setSubmitError("保存房产失败，请检查输入后重试。");
      }
    },
  });
  return form;
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

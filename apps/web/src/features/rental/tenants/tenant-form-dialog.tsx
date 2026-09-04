/* biome-ignore-all lint/suspicious/noExplicitAny: TanStack Form exposes validator slots with wide generic parameters. */
import { type ReactFormExtendedApi, useForm } from "@tanstack/react-form";
import type {
  CreateRentalTenantRequest,
  RentalTenantDetail,
  RentalTenantSummary,
  UpdateRentalTenantRequest,
} from "@xpense/shared";
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
import {
  clearTenantTypeSpecificValues,
  defaultTenantFormValues,
  type TenantFormValues,
  tenantFormSchema,
  toCreateTenantRequest,
  toUpdateTenantRequest,
} from "./tenant-form-schema";

const typeOptions = [
  ["individual", "个人"],
  ["company", "企业"],
] as const;
const documentOptions = [
  ["national_id", "居民身份证"],
  ["passport", "护照"],
  ["residence_permit", "居住证"],
  ["business_registration", "营业执照"],
  ["other", "其他"],
] as const;
const genderOptions = [
  ["male", "男"],
  ["female", "女"],
  ["unspecified", "未说明"],
] as const;

export type TenantFormDialogProps = {
  mode?: "create" | "edit";
  tenant?: RentalTenantSummary | RentalTenantDetail;
  open?: boolean;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
  loadDetail?: () => Promise<RentalTenantDetail>;
  onCreate?: (input: CreateRentalTenantRequest) => Promise<void>;
  onUpdate?: (input: UpdateRentalTenantRequest) => Promise<void>;
};

export function TenantFormDialog({
  mode = "create",
  tenant,
  open: controlledOpen,
  hideTrigger = false,
  onOpenChange,
  loadDetail,
  onCreate,
  onUpdate,
}: TenantFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [loadedTenant, setLoadedTenant] = useState<RentalTenantDetail | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currentTenant = loadedTenant ?? tenant;
  const tenantId = tenant?.id;
  const isEditing = mode === "edit";
  const form = useForm({
    defaultValues: defaultTenantFormValues(tenant),
    validators: { onChange: tenantFormSchema, onSubmit: tenantFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = tenantFormSchema.safeParse(value);
      if (!parsed.success) return;
      setSubmitError(null);
      try {
        if (isEditing && currentTenant && onUpdate) {
          const initial = defaultTenantFormValues(currentTenant);
          const input = toUpdateTenantRequest(currentTenant.id, parsed.data, initial);
          if (input) await onUpdate(input);
        } else if (!isEditing && onCreate) {
          await onCreate(toCreateTenantRequest(parsed.data));
        }
        closeDialog();
      } catch {
        setSubmitError("保存租客失败，请检查输入后重试。");
      }
    },
  }) as TenantFormApi;

  useEffect(() => {
    if (!open || !isEditing || !tenantId || !loadDetail) return;
    let active = true;
    void loadDetail()
      .then((detail) => {
        if (!active) return;
        setLoadedTenant(detail);
        setFormValues(form, defaultTenantFormValues(detail));
      })
      .catch(() => {
        if (active) setSubmitError("加载租客详情失败，请重试。");
      });
    return () => {
      active = false;
    };
  }, [form, isEditing, loadDetail, open, tenantId]);

  function changeType(nextType: TenantFormValues["type"]) {
    const next = clearTenantTypeSpecificValues({ ...form.state.values, type: nextType }, nextType);
    setFormValues(form, next);
  }

  function setDialogOpen(next: boolean) {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  function clearFormState() {
    setLoadedTenant(null);
    setSubmitError(null);
    form.reset();
  }

  function closeDialog() {
    setDialogOpen(false);
    clearFormState();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setDialogOpen(next);
        if (!next) {
          clearFormState();
        }
      }}
    >
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button
            aria-label={isEditing && tenant ? `编辑 ${tenant.name}` : undefined}
            variant={isEditing ? "outline" : "default"}
          >
            {isEditing ? "编辑" : "新增租客"}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑租客" : "新增租客"}</DialogTitle>
          <DialogDescription>证件号码等敏感信息不会从掩码值自动回填。</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Field form={form} name="name" label="租客名称" />
          <form.Field name="type">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="tenant-type">租客类型</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => changeType(value as TenantFormValues["type"])}
                >
                  <SelectTrigger id="tenant-type" aria-label="租客类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field form={form} name="phone" label="电话" />
            <Field form={form} name="email" label="邮箱" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field form={form} name="primaryContactName" label="主要联系人" />
            <Field form={form} name="primaryContactPhone" label="联系人电话" />
          </div>
          <form.Subscribe selector={(state) => state.values.type === "individual"}>
            {(isIndividual) =>
              isIndividual ? (
                <IdentityFields
                  form={form}
                  maskedDocumentNumber={currentTenant?.maskedDocumentNumber ?? null}
                />
              ) : null
            }
          </form.Subscribe>
          <Field form={form} name="note" label="备注" multiline />
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  {submitting ? "正在保存..." : isEditing ? "保存租客" : "创建租客"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IdentityFields({
  form,
  maskedDocumentNumber,
}: {
  form: TenantFormApi;
  maskedDocumentNumber: string | null;
}) {
  return (
    <fieldset className="grid gap-4 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">身份信息（可选）</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field form={form} name="documentCountryCode" label="证件国家/地区" />
        <form.Field name="documentType">
          {(field) => (
            <SelectField
              label="证件类型"
              value={field.state.value || "none"}
              options={[["none", "未填写"], ...documentOptions]}
              onChange={(value) =>
                field.handleChange(
                  value === "none" ? "" : (value as TenantFormValues["documentType"]),
                )
              }
            />
          )}
        </form.Field>
      </div>
      <form.Subscribe selector={(state) => state.values.documentType === "other"}>
        {(isOther) =>
          isOther ? <Field form={form} name="documentTypeOtherName" label="自定义证件类型" /> : null
        }
      </form.Subscribe>
      {maskedDocumentNumber ? (
        <p className="text-sm text-muted-foreground">已有证件号：{maskedDocumentNumber}</p>
      ) : null}
      <Field
        form={form}
        name="documentNumber"
        label="证件号码"
        description="编辑已有租客时，请明确重新输入才会修改。"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field form={form} name="birthDate" label="出生日期" type="date" />
        <form.Field name="gender">
          {(field) => (
            <SelectField
              label="性别"
              value={field.state.value || "none"}
              options={[["none", "未填写"], ...genderOptions]}
              onChange={(value) =>
                field.handleChange(value === "none" ? "" : (value as TenantFormValues["gender"]))
              }
            />
          )}
        </form.Field>
      </div>
      <Field form={form} name="ethnicity" label="民族" />
      <Field form={form} name="documentAddress" label="证件地址" />
    </fieldset>
  );
}

type TenantFormApi = ReactFormExtendedApi<
  TenantFormValues,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

function Field({
  form,
  name,
  label,
  description,
  type = "text",
  multiline = false,
}: {
  form: TenantFormApi;
  name: keyof TenantFormValues;
  label: string;
  description?: string;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <form.Field name={name}>
      {(field) => {
        const error = field.state.meta.errors[0];
        const message = errorMessage(error);
        const describedBy =
          [description ? `${field.name}-description` : "", message ? `${field.name}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            {multiline ? (
              <textarea
                id={field.name}
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(message)}
                aria-describedby={describedBy}
              />
            ) : (
              <Input
                id={field.name}
                type={type}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(message)}
                aria-describedby={describedBy}
              />
            )}
            {description ? (
              <p id={`${field.name}-description`} className="text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
            {message ? (
              <p id={`${field.name}-error`} className="text-sm text-destructive">
                {message}
              </p>
            ) : null}
          </div>
        );
      }}
    </form.Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={`tenant-select-${label}`}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={`tenant-select-${label}`} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function setFormValues(form: TenantFormApi, values: TenantFormValues) {
  for (const [name, value] of Object.entries(values) as [
    keyof TenantFormValues,
    TenantFormValues[keyof TenantFormValues],
  ][])
    form.setFieldValue(name, value as never);
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return undefined;
}

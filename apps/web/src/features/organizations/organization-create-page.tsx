import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, chinaPhoneSchema } from "@xpense/shared";
import { useState } from "react";
import { SecondaryPageLayout } from "@/components/layout/secondary-page-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/services/api-client";
import { organizationsKeys } from "@/services/organizations-query";
import type { WebSessionDependency } from "@/services/web-session";
import {
  newOwnerDraft,
  type OrganizationCreateValues,
  organizationCreateSchema,
  toOrganizationCreateInput,
} from "./organization-create-schema";
import { OrganizationOwnerFields } from "./organization-owner-fields";

export function OrganizationCreatePage({
  session,
  onBack,
  onCreated,
}: {
  session: WebSessionDependency;
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const [attempted, setAttempted] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [defaults] = useState<OrganizationCreateValues>(() => ({
    name: "",
    baseCurrency: "CNY",
    timezone: "Asia/Shanghai",
    contactName: "",
    contactPhone: "",
    address: "",
    owners: [newOwnerDraft()],
  }));
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: organizationCreateSchema },
    onSubmit: () => {
      setSubmitError(null);
      setConfirm(true);
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const parsed = attempted ? organizationCreateSchema.safeParse(values) : null;
  const errors: Record<string, string> = {};
  if (parsed && !parsed.success)
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
  async function lookup(id: string) {
    const owner = form.getFieldValue("owners").find((item) => item.id === id);
    if (!owner) return;
    const phone = chinaPhoneSchema.parse(owner.phone);
    const epoch = owner.epoch;
    const candidate = await session.organizationsApi.resolveOwner(phone);
    const current = form.getFieldValue("owners");
    if (
      !current.some((item) => item.id === id && item.phone === owner.phone && item.epoch === epoch)
    )
      return;
    form.setFieldValue(
      "owners",
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              checkedPhone: phone,
              candidate,
              confirmed: false,
              initialPassword: candidate ? "" : item.initialPassword,
            }
          : item,
      ),
    );
  }
  async function create() {
    if (busy) return;
    const input = toOrganizationCreateInput(form.state.values);
    setBusy(true);
    let id: string;
    try {
      id = (await session.organizationsApi.create(input)).id;
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.status === 409
          ? error.message
          : "创建组织失败，请稍后重试。",
      );
      form.setFieldValue(
        "owners",
        form.getFieldValue("owners").map((owner) => ({ ...owner, initialPassword: "" })),
      );
      setAttempted(true);
      return;
    } finally {
      setBusy(false);
      setConfirm(false);
    }
    form.reset();
    void queryClient.invalidateQueries({
      queryKey: [...organizationsKeys.root, session.authStore.getState().currentUser?.id],
    });
    onCreated(id);
  }
  return (
    <SecondaryPageLayout
      title="创建组织"
      onBack={onBack}
      description="确定组织基础信息，并开通或关联一位或多位负责人。"
      breadcrumbs={[
        { key: "platform", label: "平台管理" },
        { key: "organizations", label: "组织管理" },
        { key: "new", label: "创建组织" },
      ]}
    >
      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          void form.handleSubmit();
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-4 text-base font-semibold">基础信息</legend>
          <Field>
            <FieldLabel htmlFor="organization-name">组织名称</FieldLabel>
            <Input
              id="organization-name"
              value={values.name}
              onChange={(event) => form.setFieldValue("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field>
            <FieldLabel>基础币种</FieldLabel>
            <Select
              value={values.baseCurrency}
              onValueChange={(value) => {
                if (value === "CNY" || value === "USD") form.setFieldValue("baseCurrency", value);
              }}
            >
              <SelectTrigger aria-label="基础币种" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.name} · {currency.code} · {currency.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">名称、基础币种和时区创建后不可修改。</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="organization-timezone">时区</FieldLabel>
            <Input
              id="organization-timezone"
              value={values.timezone}
              onChange={(event) => form.setFieldValue("timezone", event.target.value)}
            />
            <FieldError>{errors.timezone}</FieldError>
          </Field>
        </fieldset>
        <OrganizationOwnerFields
          owners={values.owners}
          onChange={(owners) => form.setFieldValue("owners", owners)}
          onLookup={lookup}
          errors={errors}
          disabled={busy}
        />
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-4 text-base font-semibold">联系资料（选填）</legend>
          {[
            { name: "contactName", label: "联系人" },
            { name: "contactPhone", label: "联系电话" },
            { name: "address", label: "地址" },
          ].map(({ name, label }) => (
            <Field key={name}>
              <FieldLabel htmlFor={`organization-${name}`}>{label}</FieldLabel>
              <Input
                id={`organization-${name}`}
                value={values[name as "contactName" | "contactPhone" | "address"]}
                onChange={(event) =>
                  form.setFieldValue(
                    name as "contactName" | "contactPhone" | "address",
                    event.target.value,
                  )
                }
              />
            </Field>
          ))}
        </fieldset>
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError} 为安全起见已清空初始密码，请重新填写。
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" aria-busy={busy}>
            创建组织
          </Button>
          <Button variant="outline" onClick={onBack}>
            取消
          </Button>
        </div>
      </form>
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认创建组织</AlertDialogTitle>
            <AlertDialogDescription>
              “{values.name.trim()}”将使用 {values.baseCurrency}、{values.timezone}
              。名称、基础币种和时区创建后永久不可修改。将为 {values.owners.length}{" "}
              位负责人开通或关联账号。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回检查</AlertDialogCancel>
            <AlertDialogAction onClick={() => void create()}>确认创建</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecondaryPageLayout>
  );
}

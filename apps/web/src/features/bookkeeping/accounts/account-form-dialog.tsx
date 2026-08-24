import { useForm } from "@tanstack/react-form";
import type { AccountSummary } from "@xpense/shared";
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
import type { CreateAccountRequest, UpdateAccountRequest } from "../../../services/bookkeeping-api";
import {
  type AccountFormValues,
  accountFormSchema,
  toCreateAccountRequest,
  toUpdateAccountRequest,
} from "./account-form-schema";

const accountTypeOptions = [
  ["cash", "现金"],
  ["bank", "银行卡"],
  ["e_wallet", "电子钱包"],
  ["credit_card", "信用卡"],
  ["other", "其他"],
] as const;

type AccountFormDialogProps = {
  account?: AccountSummary;
  onCreate?: (input: CreateAccountRequest) => Promise<void>;
  onUpdate?: (id: string, input: UpdateAccountRequest) => Promise<void>;
};

/** 创建或编辑账户的受控弹窗。 */
export function AccountFormDialog({ account, onCreate, onUpdate }: AccountFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = account !== undefined;
  const form = useAccountDialogForm({ account, onCreate, onUpdate, setOpen, setSubmitError });

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
          size={isEditing ? "sm" : "default"}
          variant={isEditing ? "outline" : "default"}
          aria-label={isEditing ? `编辑 ${account.name}` : undefined}
        >
          {isEditing ? "编辑" : "新增账户"}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑账户" : "新增账户"}</DialogTitle>
          <DialogDescription>账户余额由交易流水实时计算。</DialogDescription>
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
          <TextField form={form} label="账户名称" name="name" />
          <form.Field name="type">
            {(field) => (
              <div className="grid gap-2">
                <Label>账户类型</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as AccountFormValues["type"])}
                >
                  <SelectTrigger aria-label="账户类型" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypeOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          {!isEditing ? (
            <TextField form={form} label="期初余额" name="initialBalance" placeholder="0.00" />
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <TextField form={form} label="图标" name="icon" placeholder="wallet" />
            <TextField form={form} label="颜色" name="color" placeholder="#2563EB" />
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
                  {isSubmitting ? "正在保存..." : isEditing ? "保存账户" : "创建账户"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FormApi = ReturnType<typeof useAccountDialogForm>;

/** 渲染账户表单字符串字段及首个校验错误。 */
function TextField({
  form,
  label,
  name,
  placeholder,
}: {
  form: FormApi;
  label: string;
  name: "name" | "initialBalance" | "icon" | "color" | "sortOrder";
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
              inputMode={name === "initialBalance" ? "decimal" : undefined}
              placeholder={placeholder}
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

/** 构造创建或编辑的默认表单值。 */
function getDefaultValues(account?: AccountSummary): AccountFormValues {
  return {
    name: account?.name ?? "",
    type: account?.type ?? "cash",
    icon: account?.icon ?? "",
    color: account?.color ?? "",
    sortOrder: account ? account.sortOrder.toString() : "",
    initialBalance: "",
  };
}

/** 创建保持精确表单值类型的账户表单实例。 */
function useAccountDialogForm({
  account,
  onCreate,
  onUpdate,
  setOpen,
  setSubmitError,
}: AccountFormDialogProps & {
  setOpen: (open: boolean) => void;
  setSubmitError: (message: string | null) => void;
}) {
  const form = useForm({
    defaultValues: getDefaultValues(account),
    validators: { onChange: accountFormSchema, onSubmit: accountFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const parsed = accountFormSchema.safeParse(value);
      if (!parsed.success) return;

      try {
        if (account && onUpdate) {
          await onUpdate(account.id, toUpdateAccountRequest(parsed.data));
        } else if (onCreate) {
          await onCreate(toCreateAccountRequest(parsed.data));
        }
        setOpen(false);
        form.reset();
      } catch {
        toast.error("保存账户失败，请检查输入后重试。");
        setSubmitError("保存账户失败，请检查输入后重试。");
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

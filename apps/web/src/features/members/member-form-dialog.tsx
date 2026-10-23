import { useForm } from "@tanstack/react-form";
import { chinaPhoneSchema } from "@xpense/shared";
import { useRef, useState } from "react";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import MultipleSelector from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IamMemberAccount, IamRole } from "../../services/iam-api";
import {
  type MemberAccountLookupState,
  MemberPhoneField,
  MemberUsernameField,
} from "./member-account-fields";
import { type MemberFormValues, memberFormSchema } from "./member-form-schema";

type MemberFormDialogProps = {
  roles: IamRole[];
  onLookupAccount: (phone: string) => Promise<IamMemberAccount | null>;
  onSubmit: (input: MemberFormValues) => Promise<void>;
};

function getValidationMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  if ("issues" in error && Array.isArray(error.issues)) {
    const firstIssue = error.issues[0];

    if (
      firstIssue &&
      typeof firstIssue === "object" &&
      "message" in firstIssue &&
      typeof firstIssue.message === "string"
    ) {
      return firstIssue.message;
    }
  }

  return undefined;
}

export function MemberFormDialog({ roles, onLookupAccount, onSubmit }: MemberFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<MemberAccountLookupState>(null);
  const lookupStateRef = useRef<MemberAccountLookupState>(null);
  const lookupRequestId = useRef(0);
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  function setAccountLookup(next: MemberAccountLookupState) {
    lookupStateRef.current = next;
    setLookupState(next);
  }

  const form = useForm({
    defaultValues: {
      phone: "",
      username: "",
      roleIds: [] as string[],
      status: "active" as MemberFormValues["status"],
    },
    validators: {
      onChange: memberFormSchema,
      onBlur: memberFormSchema,
      onSubmit: memberFormSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const phone = chinaPhoneSchema.parse(value.phone);
      const accountLookup = lookupStateRef.current;

      if (
        !accountLookup ||
        accountLookup.phone !== phone ||
        accountLookup.status === "loading" ||
        accountLookup.status === "error"
      ) {
        setPhoneError("请先验证手机号。");
        return;
      }

      if (accountLookup.status === "found" && accountLookup.account.status === "disabled") {
        setSubmitError("该账号已禁用，无法添加成员。");
        return;
      }

      setPhoneError(null);

      try {
        await onSubmit({ ...value, phone, username: value.username.trim() });
        handleOpenChange(false);
      } catch {
        setSubmitError("添加成员失败，请稍后重试。");
      }
    },
  });

  async function lookupAccount(phone: string) {
    const requestId = ++lookupRequestId.current;
    setPhoneError(null);
    setAccountLookup({ phone, status: "loading" });

    try {
      const account = await onLookupAccount(phone);

      if (requestId !== lookupRequestId.current || form.getFieldValue("phone").trim() !== phone) {
        return;
      }

      setPhoneError(null);
      if (account) {
        form.setFieldValue("username", account.username);
        setAccountLookup({ phone, status: "found", account });
      } else {
        setAccountLookup({ phone, status: "not-found" });
      }
    } catch {
      if (requestId === lookupRequestId.current && form.getFieldValue("phone").trim() === phone) {
        setPhoneError(null);
        setAccountLookup({ phone, status: "error" });
      }
    }
  }

  function resetForm() {
    lookupRequestId.current += 1;
    form.reset();
    setAccountLookup(null);
    setPhoneError(null);
    setSubmitError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>新增成员</Button>} />
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onMouseDownCapture={(event) => {
          // 关闭时保持当前焦点，避免失焦校验改变弹框高度、移走点击目标。
          if (
            event.target instanceof Element &&
            event.target.closest('[data-slot="dialog-close"]')
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>新增成员</DialogTitle>
          <DialogDescription>输入手机号查询账号，再设置用户名、角色和状态。</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-col gap-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup className="grid gap-4">
            <form.Field name="phone">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? getValidationMessage(field.state.meta.errors[0])
                  : undefined;
                return (
                  <MemberPhoneField
                    phone={field.state.value}
                    phoneError={phoneError}
                    lookupState={lookupState}
                    phoneFieldError={fieldError}
                    onPhoneBlur={() => {
                      field.handleBlur();
                      const parsedPhone = chinaPhoneSchema.safeParse(field.state.value);
                      if (!parsedPhone.success) return;

                      const latest = lookupStateRef.current;
                      if (latest?.phone === parsedPhone.data && latest.status !== "error") {
                        return;
                      }

                      void lookupAccount(parsedPhone.data);
                    }}
                    onPhoneChange={(value) => {
                      lookupRequestId.current += 1;
                      setAccountLookup(null);
                      setPhoneError(null);
                      setSubmitError(null);
                      form.setFieldValue("username", "");
                      field.handleChange(value);
                    }}
                    onRetryLookup={() => {
                      const currentLookup = lookupStateRef.current;
                      if (currentLookup?.status === "error")
                        void lookupAccount(currentLookup.phone);
                    }}
                  />
                );
              }}
            </form.Field>

            <form.Field name="username">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? getValidationMessage(field.state.meta.errors[0])
                  : undefined;

                return (
                  <MemberUsernameField
                    username={field.state.value}
                    lookupState={lookupState}
                    currentPhone={form.getFieldValue("phone")}
                    fieldError={fieldError}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                  />
                );
              }}
            </form.Field>

            <form.Field name="roleIds">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? getValidationMessage(field.state.meta.errors[0])
                  : undefined;

                return (
                  <Field data-invalid={Boolean(fieldError)}>
                    <FieldLabel htmlFor="roleIds">角色</FieldLabel>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <MultipleSelector
                          className="flex min-h-9 items-center bg-transparent shadow-xs dark:bg-input/30 [&>div]:w-full"
                          badgeClassName="h-6 max-w-full [&>button]:size-6"
                          commandProps={{
                            label: "角色",
                            className: "[&_[data-state=open]]:static [&_[data-state=open]]:mt-2",
                            "aria-invalid": Boolean(fieldError),
                          }}
                          emptyIndicator={<span>没有匹配的角色</span>}
                          inputProps={{
                            className: "min-w-24 py-0 text-base md:text-sm",
                            id: "roleIds",
                            "aria-label": "角色",
                            "aria-invalid": Boolean(fieldError),
                            "aria-describedby": fieldError ? "roleIds-error" : undefined,
                            onBlur: field.handleBlur,
                          }}
                          options={roleOptions}
                          placeholder="选择一个或多个角色"
                          disabled={isSubmitting}
                          value={field.state.value.flatMap((roleId) => {
                            const role = rolesById.get(roleId);
                            return role ? [{ value: roleId, label: role.name }] : [];
                          })}
                          onChange={(selected) => {
                            field.handleChange(selected.map((option) => option.value));
                            void form.validate("blur");
                          }}
                        />
                      )}
                    </form.Subscribe>
                    <FieldError id="roleIds-error">{fieldError}</FieldError>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="member-status">状态</FieldLabel>
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as MemberFormValues["status"])
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger
                          id="member-status"
                          className="w-full"
                          onBlur={field.handleBlur}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">已启用</SelectItem>
                          <SelectItem value="disabled">已禁用</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </form.Subscribe>
                </Field>
              )}
            </form.Field>

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  disabled={isSubmitting}
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
              )}
            </form.Subscribe>
            <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
              {({ isSubmitting }) => (
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "正在添加..." : "添加成员"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

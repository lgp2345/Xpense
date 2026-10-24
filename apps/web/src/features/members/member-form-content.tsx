import { useForm } from "@tanstack/react-form";
import { chinaPhoneSchema } from "@xpense/shared";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import {
  type MemberAccountLookupState,
  MemberPhoneField,
  MemberUsernameField,
} from "./member-account-fields";
import type { MemberFormDialogProps } from "./member-form-dialog";
import {
  type MemberFormValues,
  memberEditFormSchema,
  memberFormSchema,
} from "./member-form-schema";
import { MemberRoleField, MemberStatusField } from "./member-role-status-fields";

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

export function MemberFormContent({
  roles,
  member,
  permissions,
  onClose,
  onLookupAccount,
  onSubmit,
}: MemberFormDialogProps & { onClose: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<MemberAccountLookupState>(null);
  const lookupStateRef = useRef<MemberAccountLookupState>(null);
  const lookupRequestId = useRef(0);

  function setAccountLookup(next: MemberAccountLookupState) {
    lookupStateRef.current = next;
    setLookupState(next);
  }

  const initialValues: MemberFormValues = {
    phone: member?.phone ?? "",
    username: member?.username ?? "",
    roleIds: member ? (member.roles?.map((role) => role.id) ?? [member.roleId]) : [],
    status: member?.status ?? "active",
  };
  const schema = member ? memberEditFormSchema : memberFormSchema;
  const canChangeStatus =
    !member ||
    permissions?.includes(member.status === "active" ? "members:disable" : "members:enable");
  const form = useForm({
    defaultValues: initialValues,
    validators: { onChange: schema, onBlur: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const phone = member ? value.phone : chinaPhoneSchema.parse(value.phone);
      if (!member) {
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
      }

      setPhoneError(null);

      try {
        await onSubmit({ ...value, phone, username: value.username.trim() });
        onClose();
      } catch {
        setSubmitError(member ? "保存成员失败，请稍后重试。" : "添加成员失败，请稍后重试。");
      }
    },
  });

  async function lookupAccount(phone: string) {
    if (member) return;
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

  return (
    <DialogContent
      className="max-h-[90dvh] overflow-y-auto"
      onMouseDownCapture={(event) => {
        // 关闭时保持当前焦点，避免失焦校验改变弹框高度、移走点击目标。
        if (event.target instanceof Element && event.target.closest('[data-slot="dialog-close"]')) {
          event.preventDefault();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{member ? "编辑成员" : "新增成员"}</DialogTitle>
        <DialogDescription>
          {member
            ? "账号资料只读，可调整成员角色和状态。"
            : "输入手机号查询账号，再设置用户名、角色和状态。"}
        </DialogDescription>
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
                  readOnly={Boolean(member)}
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
                    if (currentLookup?.status === "error") void lookupAccount(currentLookup.phone);
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
                  readOnly={Boolean(member)}
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
            {(field) => (
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <MemberRoleField
                    roles={roles}
                    value={field.state.value}
                    error={
                      field.state.meta.isTouched
                        ? getValidationMessage(field.state.meta.errors[0])
                        : undefined
                    }
                    disabled={isSubmitting}
                    onBlur={field.handleBlur}
                    onChange={(roleIds) => {
                      field.handleChange(roleIds);
                      void form.validate("blur");
                    }}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
          <form.Field name="status">
            {(field) => (
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <MemberStatusField
                    value={field.state.value}
                    disabled={isSubmitting || !canChangeStatus}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                  />
                )}
              </form.Subscribe>
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
              <Button disabled={isSubmitting} type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
            )}
          </form.Subscribe>
          <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
            {({ isSubmitting }) => (
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? member
                    ? "正在保存..."
                    : "正在添加..."
                  : member
                    ? "保存修改"
                    : "添加成员"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

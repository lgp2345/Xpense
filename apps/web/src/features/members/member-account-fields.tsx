import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { IamMemberAccount } from "../../services/iam-api";

export type MemberAccountLookupState =
  | { phone: string; status: "loading" | "error" | "not-found" }
  | { phone: string; status: "found"; account: IamMemberAccount }
  | null;

type MemberPhoneFieldProps = {
  phone: string;
  phoneError: string | null;
  lookupState: MemberAccountLookupState;
  phoneFieldError?: string;
  onPhoneBlur: () => void;
  onPhoneChange: (value: string) => void;
  onRetryLookup: () => void;
};

export function MemberPhoneField({
  phone,
  phoneError,
  lookupState,
  phoneFieldError,
  onPhoneBlur,
  onPhoneChange,
  onRetryLookup,
}: MemberPhoneFieldProps) {
  const currentLookup = lookupState?.phone === phone.trim() ? lookupState : null;
  const lookupError = currentLookup?.status === "error" ? "手机号查询失败，请重试。" : null;
  const lookupMessage =
    phoneError ??
    lookupError ??
    (currentLookup?.status === "loading"
      ? "正在查询手机号账号…"
      : currentLookup?.status === "not-found"
        ? "未找到现有账号，可以设置新用户名。"
        : currentLookup?.status === "found"
          ? currentLookup.account.status === "disabled"
            ? "该账号已禁用，无法添加成员。"
            : `已找到账号 ${currentLookup.account.username}，将沿用此用户名。`
          : undefined);
  const phoneInvalid = Boolean(phoneFieldError || phoneError || lookupError);

  return (
    <Field data-invalid={phoneInvalid}>
      <FieldLabel htmlFor="phone">手机号</FieldLabel>
      <Input
        autoComplete="tel"
        id="phone"
        inputMode="tel"
        placeholder="输入中国大陆手机号"
        type="tel"
        value={phone}
        onBlur={onPhoneBlur}
        onChange={(event) => onPhoneChange(event.target.value)}
        aria-invalid={phoneInvalid}
        aria-describedby={
          [phoneFieldError ? "phone-error" : undefined, lookupMessage ? "phone-message" : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {lookupMessage ? (
        <p
          className={
            phoneError || lookupError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
          id="phone-message"
          role={phoneError || lookupError ? "alert" : "status"}
        >
          {lookupMessage}
        </p>
      ) : null}
      {currentLookup?.status === "error" ? (
        <Button className="w-fit" type="button" variant="outline" onClick={onRetryLookup}>
          重试验证手机号
        </Button>
      ) : null}
      <FieldError id="phone-error">{phoneFieldError}</FieldError>
    </Field>
  );
}

type MemberUsernameFieldProps = {
  username: string;
  lookupState: MemberAccountLookupState;
  currentPhone: string;
  fieldError?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
};

export function MemberUsernameField({
  username,
  lookupState,
  currentPhone,
  fieldError,
  onBlur,
  onChange,
}: MemberUsernameFieldProps) {
  const currentLookup = lookupState?.phone === currentPhone.trim() ? lookupState : null;
  const locked = currentLookup?.status === "found";

  return (
    <Field data-invalid={Boolean(fieldError)}>
      <FieldLabel htmlFor="username">用户名</FieldLabel>
      <Input
        autoComplete="username"
        disabled={locked}
        id="username"
        maxLength={100}
        placeholder={locked ? "使用已存在账号的用户名" : "设置用户名"}
        value={username}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? "username-error" : undefined}
      />
      <FieldError id="username-error">{fieldError}</FieldError>
    </Field>
  );
}

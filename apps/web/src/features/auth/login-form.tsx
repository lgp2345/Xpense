import { useForm } from "@tanstack/react-form";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { getSafeRedirectPath } from "../../routes/-shared/safe-redirect";
import {
  loginWebSession,
  WebLoginError,
  type WebSessionDependency,
} from "../../services/web-session";
import { CaptchaField } from "./captcha-field";
import { loginSchema } from "./login-schema";
import { useCaptcha } from "./use-captcha";

type LoginFormProps = {
  onAuthenticated: (path: string) => void | Promise<void>;
  redirectPath: string;
  session: WebSessionDependency;
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

function resolveSubmitError(error: unknown): string {
  if (!(error instanceof WebLoginError)) {
    return "服务暂时不可用，请稍后重试";
  }

  if (error.kind === "invalid_credentials") {
    return "手机号、密码或验证码不正确，请重试";
  }

  if (error.kind === "rate_limited") {
    return "尝试过于频繁，请稍后重试";
  }

  return "服务暂时不可用，请稍后重试";
}

export function LoginForm({ onAuthenticated, redirectPath, session }: LoginFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { authApi, authStore } = session;
  const {
    captchaId,
    svg,
    loading: captchaLoading,
    error: captchaError,
    refresh: refreshCaptcha,
  } = useCaptcha({ getCaptcha: authApi.getCaptcha });
  const form = useForm({
    defaultValues: {
      phone: "",
      password: "",
      captchaText: "",
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);

      if (!captchaId) {
        setSubmitError("验证码未加载，请刷新后重试");
        await refreshCaptcha();
        return;
      }

      try {
        await loginWebSession(authApi, authStore, {
          phone: value.phone.trim(),
          password: value.password,
          captchaId,
          captchaText: value.captchaText.trim(),
        });
        await onAuthenticated(getSafeRedirectPath(redirectPath));
      } catch (error) {
        setSubmitError(resolveSubmitError(error));
        form.setFieldValue("captchaText", "");
        await refreshCaptcha();
      }
    },
  });

  return (
    <div className="mt-8">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-5">
          <form.Field name="phone">
            {(field) => {
              const error = field.state.meta.isTouched
                ? getValidationMessage(field.state.meta.errors[0])
                : undefined;

              return (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="login-phone">手机号</FieldLabel>
                  <Input
                    aria-describedby={error ? "login-phone-error" : undefined}
                    aria-invalid={Boolean(error)}
                    autoComplete="username"
                    id="login-phone"
                    inputMode="numeric"
                    maxLength={11}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value.replace(/\D/g, "").slice(0, 11))
                    }
                    type="text"
                    value={field.state.value}
                  />
                  <FieldError id="login-phone-error">{error}</FieldError>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const error = field.state.meta.isTouched
                ? getValidationMessage(field.state.meta.errors[0])
                : undefined;

              return (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="login-password">密码</FieldLabel>
                  <Input
                    aria-describedby={error ? "login-password-error" : undefined}
                    aria-invalid={Boolean(error)}
                    autoComplete="current-password"
                    id="login-password"
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    type="password"
                    value={field.state.value}
                  />
                  <FieldError id="login-password-error">{error}</FieldError>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="captchaText">
            {(field) => {
              const error = field.state.meta.isTouched
                ? getValidationMessage(field.state.meta.errors[0])
                : undefined;

              return (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="login-captcha">验证码</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-describedby={error || captchaError ? "login-captcha-error" : undefined}
                      aria-invalid={Boolean(error)}
                      autoCapitalize="off"
                      autoComplete="off"
                      className="flex-1"
                      id="login-captcha"
                      maxLength={4}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      spellCheck={false}
                      type="text"
                      value={field.state.value}
                    />
                    <CaptchaField
                      error={captchaError}
                      loading={captchaLoading}
                      onRefresh={() => void refreshCaptcha()}
                      svg={svg}
                    />
                  </div>
                  <FieldError id="login-captcha-error">{error ?? captchaError}</FieldError>
                </Field>
              );
            }}
          </form.Field>

          {submitError ? (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {submitError}
            </p>
          ) : null}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    登录中...
                  </>
                ) : (
                  "登录"
                )}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-4" />
        刷新凭证仅保存在安全 Cookie 中
      </p>
    </div>
  );
}

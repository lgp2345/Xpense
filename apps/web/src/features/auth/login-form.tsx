import { useForm } from "@tanstack/react-form";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { getSafeRedirectPath } from "../../routes/safe-redirect";
import {
  loginWebSession,
  WebLoginError,
  type WebSessionDependency,
} from "../../services/web-session";
import { loginSchema } from "./login-schema";

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

export function LoginForm({ onAuthenticated, redirectPath, session }: LoginFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { authApi, authStore } = session;
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);

      try {
        await loginWebSession(authApi, authStore, {
          email: value.email.trim(),
          password: value.password,
        });
        await onAuthenticated(getSafeRedirectPath(redirectPath));
      } catch (error) {
        setSubmitError(
          error instanceof WebLoginError && error.kind === "invalid_credentials"
            ? "邮箱或密码不正确，请重试"
            : "服务暂时不可用，请稍后重试",
        );
      }
    },
  });

  return (
    <div className="mt-8">
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => {
            const error = field.state.meta.isTouched
              ? getValidationMessage(field.state.meta.errors[0])
              : undefined;

            return (
              <div className="grid gap-2">
                <Label htmlFor="login-email">邮箱</Label>
                <Input
                  aria-describedby={error ? "login-email-error" : undefined}
                  aria-invalid={Boolean(error)}
                  autoComplete="email"
                  id="login-email"
                  inputMode="email"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="email"
                  value={field.state.value}
                />
                {error ? (
                  <p className="text-sm text-destructive" id="login-email-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const error = field.state.meta.isTouched
              ? getValidationMessage(field.state.meta.errors[0])
              : undefined;

            return (
              <div className="grid gap-2">
                <Label htmlFor="login-password">密码</Label>
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
                {error ? (
                  <p className="text-sm text-destructive" id="login-password-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
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
      </form>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-4" />
        刷新凭证仅保存在安全 Cookie 中
      </p>
    </div>
  );
}

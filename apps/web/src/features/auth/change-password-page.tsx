import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { changeOwnPassword, type WebSessionDependency } from "@/services/web-session";
import { changePasswordSchema } from "./change-password-schema";
export function ChangePasswordPage({ session }: { session: WebSessionDependency }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: async ({ value }) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        const parsed = changePasswordSchema.parse(value);
        await changeOwnPassword(session, {
          currentPassword: parsed.currentPassword,
          newPassword: parsed.newPassword,
        });
        form.reset();
        if (session.authStore.getState().status === "authenticated")
          toast.success("密码已修改，其他登录会话已退出");
      } catch {
        setError("修改密码失败，请检查当前密码并稍后重试。");
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">修改密码</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          修改后保留当前登录，其他设备需要重新登录。
        </p>
      </header>
      <form
        noValidate
        className="max-w-xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {(["currentPassword", "newPassword", "confirmPassword"] as const).map((name, i) => (
          <form.Field name={name} key={name}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor={`password-${name}`}>
                  {["当前密码", "新密码", "确认新密码"][i]}
                </FieldLabel>
                <Input
                  id={`password-${name}`}
                  type="password"
                  autoComplete={i === 0 ? "current-password" : "new-password"}
                  value={field.state.value}
                  disabled={busy}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存新密码"}
        </Button>
      </form>
    </main>
  );
}

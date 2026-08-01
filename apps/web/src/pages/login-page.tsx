import { Button } from "@heroui/react/button";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextField } from "@heroui/react/textfield";
import { CircleNotch } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";
import { type FormEvent, useState } from "react";

import { getSafeRedirectPath } from "../routes/safe-redirect";
import {
  loginWebSession,
  WebLoginError,
  type WebSessionDependency,
  webSession,
} from "../services/web-session";
import styles from "./login-page.module.css";

type LoginPageProps = {
  onAuthenticated?: (path: string) => void | Promise<void>;
  redirectPath?: string;
  session?: WebSessionDependency;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage({
  redirectPath = "/",
  session = webSession,
  onAuthenticated = () => undefined,
}: LoginPageProps) {
  const { authApi, authStore: store } = session;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateFields(): FieldErrors {
    const nextErrors: FieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = "请输入邮箱地址";
    } else if (!emailPattern.test(email.trim())) {
      nextErrors.email = "请输入有效的邮箱地址";
    }

    if (!password) {
      nextErrors.password = "请输入密码";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields();
    setFieldErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await loginWebSession(authApi, store, {
        email: email.trim(),
        password,
      });
      await onAuthenticated(getSafeRedirectPath(redirectPath));
    } catch (error) {
      setSubmitError(
        error instanceof WebLoginError && error.kind === "invalid_credentials"
          ? "邮箱或密码不正确，请重试"
          : "服务暂时不可用，请稍后重试",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.loginShell}>
      <header className={styles.brandBar}>
        <span className={styles.brandMark} aria-hidden="true">
          <Wallet size={20} weight="regular" />
        </span>
        <span>Xpense</span>
      </header>

      <section className={styles.loginWorkspace} aria-labelledby="login-title">
        <div className={styles.loginIntro}>
          <p>后台工作区</p>
          <h1 id="login-title">登录到你的账本</h1>
          <p>验证身份后继续管理成员、角色和财务数据。</p>
        </div>

        <div className={styles.formSurface}>
          <Form className={styles.loginForm} onSubmit={handleSubmit} validationBehavior="aria">
            <TextField
              className={styles.field}
              isInvalid={Boolean(fieldErrors.email)}
              name="email"
              value={email}
              onChange={setEmail}
            >
              <Label className={styles.label}>邮箱</Label>
              <Input autoComplete="email" className={styles.input} inputMode="email" type="email" />
              {fieldErrors.email ? (
                <FieldError className={styles.fieldError}>{fieldErrors.email}</FieldError>
              ) : null}
            </TextField>

            <TextField
              className={styles.field}
              isInvalid={Boolean(fieldErrors.password)}
              name="password"
              value={password}
              onChange={setPassword}
            >
              <Label className={styles.label}>密码</Label>
              <Input autoComplete="current-password" className={styles.input} type="password" />
              {fieldErrors.password ? (
                <FieldError className={styles.fieldError}>{fieldErrors.password}</FieldError>
              ) : null}
            </TextField>

            {submitError ? (
              <p className={styles.submitError} role="alert">
                {submitError}
              </p>
            ) : null}

            <Button className={styles.submitButton} isDisabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <CircleNotch className={styles.loadingIcon} size={18} />
                  登录中...
                </>
              ) : (
                "登录"
              )}
            </Button>
          </Form>

          <p className={styles.sessionNote}>
            <ShieldCheck aria-hidden="true" size={18} />
            刷新凭证仅保存在安全 Cookie 中
          </p>
        </div>
      </section>
    </main>
  );
}

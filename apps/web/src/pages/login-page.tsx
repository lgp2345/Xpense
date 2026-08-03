import { LoginForm } from "../features/auth/login-form";
import { LoginShowcase } from "../features/auth/login-showcase";
import { type WebSessionDependency, webSession } from "../services/web-session";
import styles from "./login-page.module.css";

export type LoginPageProps = {
  onAuthenticated?: (path: string) => void | Promise<void>;
  redirectPath?: string;
  session?: WebSessionDependency;
};

export function LoginPage({
  redirectPath = "/",
  session = webSession,
  onAuthenticated = () => undefined,
}: LoginPageProps) {
  return (
    <main className={styles.loginShell}>
      <div className={styles.loginWorkspace}>
        <LoginShowcase />

        <section aria-labelledby="login-title" className={styles.formColumn}>
          <header className={styles.loginIntro}>
            <p>后台工作区</p>
            <h1 id="login-title">登录到你的账本</h1>
            <p>验证身份后继续管理成员、角色和财务数据。</p>
          </header>

          <LoginForm
            onAuthenticated={onAuthenticated}
            redirectPath={redirectPath}
            session={session}
          />
        </section>
      </div>
    </main>
  );
}

import { LoginForm } from "../features/auth/login-form";
import { LoginShowcase } from "../features/auth/login-showcase";
import { type WebSessionDependency, webSession } from "../services/web-session";

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
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(26rem,0.85fr)]">
      <LoginShowcase />

      <section
        aria-labelledby="login-title"
        className="flex items-center justify-center p-6 sm:p-10"
      >
        <div className="w-full max-w-sm">
          <header className="mb-8">
            <p className="text-sm font-medium text-muted-foreground">后台工作区</p>
            <h1 id="login-title" className="mt-2 text-2xl font-semibold tracking-tight">
              登录到你的账本
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              验证身份后继续管理成员、角色和财务数据。
            </p>
          </header>

          <LoginForm
            onAuthenticated={onAuthenticated}
            redirectPath={redirectPath}
            session={session}
          />
        </div>
      </section>
    </main>
  );
}

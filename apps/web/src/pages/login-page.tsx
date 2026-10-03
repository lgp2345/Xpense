import { SunMoon, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-provider";
import { LoginForm } from "../features/auth/login-form";
import styles from "../features/auth/login-landing.module.css";
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
  const { setTheme, theme } = useTheme();

  return (
    <div className={styles.page}>
      <header className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-10 lg:px-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet aria-hidden="true" className="size-5" />
          </span>
          <span className="font-manrope text-xl font-bold tracking-tight">Xpense</span>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="切换主题"
            className="rounded-full border border-border"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <SunMoon aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main>
        <div className={styles.hero}>
          <LoginShowcase />
          <section aria-labelledby="login-title" className={styles.formPanel}>
            <header>
              <h2 id="login-title" className="text-2xl font-semibold tracking-tight">
                登录到你的账本
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                欢迎回来，继续打理你的收支与租务。
              </p>
            </header>
            <LoginForm
              onAuthenticated={onAuthenticated}
              redirectPath={redirectPath}
              session={session}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

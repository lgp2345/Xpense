import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { LoginPage } from "@/pages/login-page";
import { getSafeRedirectPath } from "@/routes/-shared/safe-redirect";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session.authStore.getState().status === "authenticated") {
      throw redirect({ href: getSafeRedirectPath(search.redirect) });
    }
  },
  component: LoginRoutePage,
});

function LoginRoutePage() {
  const { redirect: redirectPath } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <LoginPage
      redirectPath={redirectPath}
      session={session}
      onAuthenticated={(path) => navigate({ href: path, replace: true })}
    />
  );
}

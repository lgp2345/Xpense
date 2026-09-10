import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ForbiddenPage } from "@/pages/forbidden-page";

export const Route = createFileRoute("/_session/forbidden")({
  component: ForbiddenRoutePage,
});

function ForbiddenRoutePage() {
  const navigate = useNavigate();

  return <ForbiddenPage onBack={() => void navigate({ href: "/" })} />;
}

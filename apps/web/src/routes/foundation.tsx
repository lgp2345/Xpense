import { createFileRoute } from "@tanstack/react-router";

import { FoundationPage } from "@/pages/foundation-page";

export const Route = createFileRoute("/foundation")({
  component: FoundationPage,
});

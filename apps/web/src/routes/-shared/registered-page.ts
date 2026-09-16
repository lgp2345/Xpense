import type { RouteKey } from "@xpense/shared";
import type { ReactNode } from "react";

import type { WebSessionDependency } from "@/services/web-session";

export type RegisteredPageRenderInput = {
  session: WebSessionDependency;
};

export type RegisteredPageDescriptor<
  TCacheParams extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = {
  cacheParams: TCacheParams;
  render: (input: RegisteredPageRenderInput) => ReactNode;
  routeKey: RouteKey;
};

export function defineRegisteredPage<const TCacheParams extends Readonly<Record<string, unknown>>>(
  descriptor: RegisteredPageDescriptor<TCacheParams>,
): RegisteredPageDescriptor<TCacheParams> {
  return descriptor;
}

type PreloadableRegisteredPage = {
  preload?: () => Promise<unknown> | undefined;
};

export async function preloadRegisteredRoutePage<TAccess>(
  access: Promise<TAccess>,
  page: PreloadableRegisteredPage,
): Promise<TAccess> {
  const [resolvedAccess] = await Promise.all([access, page.preload?.()]);
  return resolvedAccess;
}

export function RegisteredRouteLeaf(): null {
  return null;
}

import type { RouteKey } from "@xpense/shared";
import type { ReactNode } from "react";

import type { WebSessionDependency } from "@/services/web-session";

export type RegisteredPageRenderInput = {
  session: WebSessionDependency;
};

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type PageCacheParams = Readonly<Record<string, JsonValue>>;

export type RegisteredPageDescriptor<TCacheParams extends PageCacheParams = PageCacheParams> = {
  cacheParams: TCacheParams;
  render: (input: RegisteredPageRenderInput) => ReactNode;
  routeKey: RouteKey;
};

export function defineRegisteredPage<const TCacheParams extends PageCacheParams>(
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

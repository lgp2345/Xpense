import { notFound, redirect } from "@tanstack/react-router";
import type { AuthorizedMenuNode, RouteKey } from "@xpense/shared";

import { ApiError } from "@/services/api-client";

import type { AppRouterContext } from "../__root";

export type RouteGuardLocation = {
  href: string;
  pathname: string;
};

export function requireAuthenticatedRouteAccess(
  context: Pick<AppRouterContext, "session">,
  location: RouteGuardLocation,
): void {
  if (context.session.authStore.getState().status !== "authenticated") {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    });
  }
}

export async function requireRegisteredRouteAccess(
  context: Pick<AppRouterContext, "session">,
  location: RouteGuardLocation,
  routeKey: RouteKey,
): Promise<{
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
}> {
  requireAuthenticatedRouteAccess(context, location);

  const { session } = context;
  if (session.authStore.getState().accessScope === "platform") {
    throw redirect({ to: "/platform/organizations", search: { page: 1, pageSize: 20 } });
  }
  const organizationId = session.authStore.getState().currentOrganization?.id ?? null;
  let menuState = session.menuStore.getState();

  if (
    organizationId &&
    menuState.status !== "error" &&
    (menuState.status !== "ready" || menuState.organizationId !== organizationId)
  ) {
    await menuState.loadMenusForOrganization(organizationId, session.iamApi.getAuthorizedMenus);
    menuState = session.menuStore.getState();
  }

  if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
    return {};
  }

  const registeredMenu = menuState.getAuthorizedRoute(routeKey);

  if (registeredMenu) {
    return { registeredMenu, registeredMenuAuthorization: menuState.byRouteKey };
  }

  try {
    const resolvedRoute = await session.iamApi.resolveMenuRoute(location.pathname);

    if (resolvedRoute.routeKey !== routeKey) {
      throw notFound();
    }

    return {
      registeredMenu: resolvedRoute,
      registeredMenuAuthorization: menuState.byRouteKey,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw redirect({ to: "/forbidden" });
    }
    if (error instanceof ApiError && error.status === 404) {
      throw notFound();
    }
    throw error;
  }
}

export function requirePlatformRouteAccess(
  context: Pick<AppRouterContext, "session">,
  location: RouteGuardLocation,
): void {
  requireAuthenticatedRouteAccess(context, location);
  if (!context.session.authStore.getState().currentUser?.isSuperAdmin)
    throw redirect({ to: "/forbidden" });
}

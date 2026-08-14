import type { AuthorizedMenuNode, RouteKey } from "@xpense/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

export type MenuLoadStatus = "idle" | "loading" | "ready" | "error";

export type MenuStoreState = {
  organizationId: string | null;
  status: MenuLoadStatus;
  tree: AuthorizedMenuNode[];
  byRouteKey: Partial<Record<RouteKey, AuthorizedMenuNode>>;
  error: string | null;
};

export type MenuStoreActions = {
  loadMenusForOrganization: (
    organizationId: string,
    loadMenus: () => Promise<AuthorizedMenuNode[]>,
  ) => Promise<void>;
  clearMenus: () => void;
  getAuthorizedRoute: (routeKey: RouteKey) => AuthorizedMenuNode | undefined;
};

export type MenuStore = MenuStoreState & MenuStoreActions;
export type MenuStoreApi = StoreApi<MenuStore>;

const idleState: MenuStoreState = {
  organizationId: null,
  status: "idle",
  tree: [],
  byRouteKey: {},
  error: null,
};

type ActiveMenuRequest = {
  organizationId: string;
  requestId: number;
  promise: Promise<void>;
};

export function createMenuStore(): MenuStoreApi {
  let nextRequestId = 0;
  let activeRequest: ActiveMenuRequest | undefined;

  return createStore<MenuStore>()((set, get) => ({
    ...idleState,
    loadMenusForOrganization: (organizationId, loadMenus) => {
      if (activeRequest?.organizationId === organizationId) {
        return activeRequest.promise;
      }

      const requestId = ++nextRequestId;
      set({
        organizationId,
        status: "loading",
        tree: [],
        byRouteKey: {},
        error: null,
      });

      let menuRequest: Promise<AuthorizedMenuNode[]>;

      try {
        menuRequest = loadMenus();
      } catch (error) {
        menuRequest = Promise.reject(error);
      }

      const promise = menuRequest.then(
        (tree) => {
          if (requestId !== nextRequestId) {
            return;
          }

          set({
            organizationId,
            status: "ready",
            tree,
            byRouteKey: indexAuthorizedRoutes(tree),
            error: null,
          });
        },
        () => {
          if (requestId !== nextRequestId) {
            return;
          }

          set({
            organizationId,
            status: "error",
            tree: [],
            byRouteKey: {},
            error: "菜单加载失败，请稍后重试。",
          });
        },
      );

      activeRequest = { organizationId, requestId, promise };
      void promise.finally(() => {
        if (activeRequest?.requestId === requestId) {
          activeRequest = undefined;
        }
      });

      return promise;
    },
    clearMenus: () => {
      nextRequestId += 1;
      activeRequest = undefined;
      set({ ...idleState });
    },
    getAuthorizedRoute: (routeKey) => get().byRouteKey[routeKey],
  }));
}

function indexAuthorizedRoutes(
  tree: readonly AuthorizedMenuNode[],
): Partial<Record<RouteKey, AuthorizedMenuNode>> {
  const byRouteKey: Partial<Record<RouteKey, AuthorizedMenuNode>> = {};
  const pending = [...tree];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node) {
      continue;
    }
    if (node.routeKey !== null) {
      byRouteKey[node.routeKey] = node;
    }
    pending.push(...node.children);
  }

  return byRouteKey;
}

export const menuStore = createMenuStore();

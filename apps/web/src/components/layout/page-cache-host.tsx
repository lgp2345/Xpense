import type { AnyRoute, UseNavigateResult } from "@tanstack/react-router";
import type { RouteKey } from "@xpense/shared";
import {
  Activity,
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";

import type { WebSessionDependency } from "@/services/web-session";
import { type PageCacheParams, PageWorkspaceStore, toPageCacheIdentity } from "./page-cache-store";
import { PageTabs } from "./page-tabs";
import {
  loadPageWorkspace,
  type PageWorkspaceScope,
  type PageWorkspaceStorage,
  savePageWorkspace,
} from "./page-workspace-persistence";

type CacheablePageMenu = {
  id: number;
  title: string;
};

const EMPTY_CACHEABLE_MENUS = new Map<RouteKey, CacheablePageMenu>();

export type RegisteredPageInput<TRoute extends AnyRoute> = {
  session: WebSessionDependency;
  params: TRoute["types"]["allParams"];
  search: TRoute["types"]["fullSearchSchema"];
  navigate: UseNavigateResult<TRoute["fullPath"]>;
};

export type PageCacheHostPage = {
  authorizationSource: "local" | "resolved";
  href: string;
  keepAlive: boolean;
  menuId: number;
  params: PageCacheParams;
  render: () => ReactNode;
  routeKey: RouteKey;
  title: string;
};

type PageCacheHostProps = {
  activePage: PageCacheHostPage | null;
  authorizationVersion: object | null;
  cacheableMenuIds: ReadonlySet<number>;
  cacheableMenus?: ReadonlyMap<RouteKey, CacheablePageMenu>;
  fallback?: ReactNode;
  navigate?: (href: string) => Promise<void> | void;
  scopeKey: string | null;
  storage?: PageWorkspaceStorage | null;
  workspaceScope?: PageWorkspaceScope | null;
};

type CachedPage = PageCacheHostPage & {
  authorizationVersion: object;
  identity: string;
};

export function PageCacheHost({
  activePage,
  authorizationVersion,
  cacheableMenuIds,
  cacheableMenus = EMPTY_CACHEABLE_MENUS,
  fallback = null,
  navigate = () => undefined,
  scopeKey,
  storage = null,
  workspaceScope = null,
}: PageCacheHostProps): JSX.Element {
  const authorizationVersionIdsRef = useRef<WeakMap<object, number> | null>(null);
  const nextAuthorizationVersionIdRef = useRef(0);
  const storeRef = useRef<PageWorkspaceStore<CachedPage> | null>(null);
  const scopeRef = useRef(scopeKey);
  const hydratedWorkspaceRef = useRef<string | null>(null);
  const [, rerender] = useReducer((version: number) => version + 1, 0);

  if (storeRef.current === null) {
    storeRef.current = new PageWorkspaceStore(10);
  }
  const authorizationVersionIds =
    authorizationVersionIdsRef.current ?? new WeakMap<object, number>();

  if (authorizationVersionIdsRef.current === null) {
    authorizationVersionIdsRef.current = authorizationVersionIds;
  }

  const store = storeRef.current;

  if (scopeRef.current !== scopeKey) {
    store.clear();
    scopeRef.current = scopeKey;
    hydratedWorkspaceRef.current = null;
  }

  const workspaceIdentity = workspaceScope
    ? `${workspaceScope.userId}:${workspaceScope.organizationId}`
    : null;

  if (
    workspaceIdentity !== null &&
    workspaceScope !== null &&
    hydratedWorkspaceRef.current !== workspaceIdentity &&
    storage !== null &&
    authorizationVersion !== null
  ) {
    const persisted = loadPageWorkspace(storage, workspaceScope);

    if (persisted) {
      store.restore(persisted, (tab) => {
        const menu = cacheableMenus.get(tab.routeKey);
        return menu ? { menuId: menu.id, title: menu.title, value: null } : null;
      });
    }

    hydratedWorkspaceRef.current = workspaceIdentity;
  }

  if (authorizationVersion !== null) {
    store.retain(({ menuId, value }) =>
      value === null || value.authorizationSource === "local"
        ? cacheableMenuIds.has(menuId)
        : value.authorizationVersion === authorizationVersion,
    );

    for (const entry of store.values()) {
      const menu = cacheableMenus.get(entry.routeKey);

      if (menu && (entry.value === null || entry.value.authorizationSource === "local")) {
        store.updateMenu(entry.identity, menu);
      }
    }
  }

  let activeIdentity: string | null = null;

  if (scopeKey !== null && authorizationVersion !== null && activePage?.keepAlive) {
    activeIdentity = toPageCacheIdentity(activePage.routeKey, activePage.params);
    store.upsert({
      cacheParams: activePage.params,
      href: activePage.href,
      menuId: activePage.menuId,
      routeKey: activePage.routeKey,
      title: activePage.title,
      value: { ...activePage, authorizationVersion, identity: activeIdentity },
    });
  }

  const handleActivate = useCallback(
    (identity: string) => {
      const entry = storeRef.current?.get(identity);

      if (entry) {
        void Promise.resolve()
          .then(() => navigate(entry.href))
          .catch(() => undefined);
      }
    },
    [navigate],
  );

  const handleClose = useCallback(
    (identity: string) => {
      const currentStore = storeRef.current;

      if (!currentStore) {
        return;
      }

      if (identity !== activeIdentity) {
        currentStore.remove(identity);
        rerender();
        return;
      }

      const target = currentStore.getCloseTarget(identity);

      if (!target) {
        return;
      }

      void Promise.resolve()
        .then(() => navigate(target.href))
        .then(() => {
          currentStore.remove(identity);
          rerender();
        })
        .catch(() => undefined);
    },
    [activeIdentity, navigate],
  );

  const workspaceUserId = workspaceScope?.userId ?? null;
  const workspaceOrganizationId = workspaceScope?.organizationId ?? null;
  const persistedSnapshot = store.snapshot((entry) => cacheableMenus.has(entry.routeKey));

  useEffect(() => {
    if (
      storage === null ||
      authorizationVersion === null ||
      workspaceUserId === null ||
      workspaceOrganizationId === null
    ) {
      return;
    }

    savePageWorkspace(
      storage,
      { organizationId: workspaceOrganizationId, userId: workspaceUserId },
      persistedSnapshot,
    );
  }, [authorizationVersion, persistedSnapshot, storage, workspaceOrganizationId, workspaceUserId]);

  return (
    <div className="flex min-h-0 h-full flex-col">
      <PageTabs
        activeIdentity={activeIdentity}
        onActivate={handleActivate}
        onClose={handleClose}
        tabs={store.values()}
      />
      <div className="min-h-0 flex-1">
        {store.values().map(({ identity, value }) =>
          value ? (
            <Activity
              key={`${scopeKey}:${toAuthorizationKey(value)}:${identity}`}
              mode={identity === activeIdentity ? "visible" : "hidden"}
            >
              {value.render()}
            </Activity>
          ) : null,
        )}
        {activePage && !activePage.keepAlive ? activePage.render() : null}
        {activePage ? null : fallback}
      </div>
    </div>
  );

  function toAuthorizationKey(page: CachedPage): string {
    if (page.authorizationSource === "local") {
      return "local";
    }

    let versionId = authorizationVersionIds.get(page.authorizationVersion);

    if (versionId === undefined) {
      versionId = nextAuthorizationVersionIdRef.current;
      nextAuthorizationVersionIdRef.current += 1;
      authorizationVersionIds.set(page.authorizationVersion, versionId);
    }

    return `resolved:${versionId}`;
  }
}

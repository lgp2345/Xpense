import type { AnyRoute, UseNavigateResult } from "@tanstack/react-router";
import { Activity, type JSX, type ReactNode, useRef } from "react";

import type { WebSessionDependency } from "@/services/web-session";

import { PageCacheStore, toPageCacheIdentity } from "./page-cache-store";

export type RegisteredPageInput<TRoute extends AnyRoute> = {
  session: WebSessionDependency;
  params: TRoute["types"]["allParams"];
  search: TRoute["types"]["fullSearchSchema"];
  navigate: UseNavigateResult<TRoute["fullPath"]>;
};

export type PageCacheHostPage = {
  authorizationSource: "local" | "resolved";
  keepAlive: boolean;
  menuId: number;
  params: Readonly<Record<string, unknown>>;
  render: () => ReactNode;
};

type PageCacheHostProps = {
  activePage: PageCacheHostPage | null;
  authorizationVersion: object | null;
  cacheableMenuIds: ReadonlySet<number>;
  fallback?: ReactNode;
  scopeKey: string | null;
};

type CachedPage = PageCacheHostPage & {
  authorizationVersion: object;
  identity: string;
};

export function PageCacheHost({
  activePage,
  authorizationVersion,
  cacheableMenuIds,
  fallback = null,
  scopeKey,
}: PageCacheHostProps): JSX.Element {
  const authorizationVersionIdsRef = useRef<WeakMap<object, number> | null>(null);
  const nextAuthorizationVersionIdRef = useRef(0);
  const storeRef = useRef<PageCacheStore<CachedPage> | null>(null);
  const scopeRef = useRef(scopeKey);

  if (storeRef.current === null) {
    storeRef.current = new PageCacheStore(10);
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
  }

  if (authorizationVersion !== null) {
    store.retain(({ menuId, value }) =>
      value.authorizationSource === "local"
        ? cacheableMenuIds.has(menuId)
        : value.authorizationVersion === authorizationVersion,
    );
  }

  let activeIdentity: string | null = null;

  if (scopeKey !== null && authorizationVersion !== null && activePage?.keepAlive) {
    activeIdentity = toPageCacheIdentity(activePage.menuId, activePage.params);
    store.upsert({
      identity: activeIdentity,
      menuId: activePage.menuId,
      value: { ...activePage, authorizationVersion, identity: activeIdentity },
    });
  }

  return (
    <>
      {store.values().map(({ identity, value }) => (
        <Activity
          key={`${scopeKey}:${toAuthorizationKey(value)}:${identity}`}
          mode={identity === activeIdentity ? "visible" : "hidden"}
        >
          {value.render()}
        </Activity>
      ))}
      {activePage && !activePage.keepAlive ? activePage.render() : null}
      {activePage ? null : fallback}
    </>
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

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
  keepAlive: boolean;
  menuId: number;
  params: Readonly<Record<string, unknown>>;
  render: () => ReactNode;
};

type PageCacheHostProps = {
  activePage: PageCacheHostPage | null;
  cacheableMenuIds: ReadonlySet<number>;
  fallback?: ReactNode;
  scopeKey: string | null;
};

type CachedPage = PageCacheHostPage & {
  identity: string;
};

export function PageCacheHost({
  activePage,
  cacheableMenuIds,
  fallback = null,
  scopeKey,
}: PageCacheHostProps): JSX.Element {
  const storeRef = useRef<PageCacheStore<CachedPage> | null>(null);
  const scopeRef = useRef(scopeKey);

  if (storeRef.current === null) {
    storeRef.current = new PageCacheStore(10);
  }

  const store = storeRef.current;

  if (scopeRef.current !== scopeKey) {
    store.clear();
    scopeRef.current = scopeKey;
  }

  store.retain(({ menuId }) => cacheableMenuIds.has(menuId));

  let activeIdentity: string | null = null;

  if (scopeKey !== null && activePage?.keepAlive) {
    activeIdentity = toPageCacheIdentity(activePage.menuId, activePage.params);
    store.upsert({
      identity: activeIdentity,
      menuId: activePage.menuId,
      value: { ...activePage, identity: activeIdentity },
    });
  }

  return (
    <>
      {store.values().map(({ identity, value }) => (
        <Activity
          key={`${scopeKey}:${identity}`}
          mode={identity === activeIdentity ? "visible" : "hidden"}
        >
          {value.render()}
        </Activity>
      ))}
      {activePage && !activePage.keepAlive ? activePage.render() : null}
      {activePage ? null : fallback}
    </>
  );
}

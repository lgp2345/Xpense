import type { RouteKey } from "@xpense/shared";

import type { PageCacheParams } from "@/routes/-shared/registered-page";

export type { JsonValue, PageCacheParams } from "@/routes/-shared/registered-page";

export type PageWorkspaceEntry<T> = {
  cacheParams: PageCacheParams;
  href: string;
  identity: string;
  menuId: number;
  routeKey: RouteKey;
  title: string;
  value: T | null;
};

export type PageWorkspaceInput<T> = Omit<PageWorkspaceEntry<T>, "identity">;

export type PersistedPageTab = Pick<
  PageWorkspaceEntry<never>,
  "cacheParams" | "href" | "routeKey" | "title"
>;

export type PersistedPageWorkspaceV1 = {
  recency: string[];
  tabs: PersistedPageTab[];
  version: 1;
};

export type RestoredPageRuntime<T> = Pick<PageWorkspaceEntry<T>, "menuId" | "title" | "value">;

export class PageWorkspaceStore<T> {
  readonly #capacity: number;
  readonly #entries = new Map<string, PageWorkspaceEntry<T>>();
  readonly #openOrder: string[] = [];
  readonly #recency: string[] = [];

  constructor(capacity = 10) {
    this.#capacity = capacity;
  }

  upsert(input: PageWorkspaceInput<T>): PageWorkspaceEntry<T> {
    const identity = toPageCacheIdentity(input.routeKey, input.cacheParams);
    const entry = { ...input, identity };

    if (!this.#entries.has(identity)) {
      this.#openOrder.push(identity);
    }

    this.#entries.set(identity, entry);
    moveToEnd(this.#recency, identity);

    while (this.#entries.size > this.#capacity) {
      const oldestIdentity = this.#recency[0];

      if (oldestIdentity === undefined) {
        break;
      }

      this.remove(oldestIdentity);
    }

    return entry;
  }

  getCloseTarget(identity: string): PageWorkspaceEntry<T> | null {
    if (this.#openOrder.length <= 1) {
      return null;
    }

    const index = this.#openOrder.indexOf(identity);

    if (index === -1) {
      return null;
    }

    const targetIdentity = this.#openOrder[index + 1] ?? this.#openOrder[index - 1];
    return targetIdentity ? (this.#entries.get(targetIdentity) ?? null) : null;
  }

  get(identity: string): PageWorkspaceEntry<T> | null {
    return this.#entries.get(identity) ?? null;
  }

  updateMenu(identity: string, menu: { id: number; title: string }): void {
    const entry = this.#entries.get(identity);

    if (!entry || (entry.menuId === menu.id && entry.title === menu.title)) {
      return;
    }

    this.#entries.set(identity, { ...entry, menuId: menu.id, title: menu.title });
  }

  remove(identity: string): void {
    if (!this.#entries.delete(identity)) {
      return;
    }

    removeValue(this.#openOrder, identity);
    removeValue(this.#recency, identity);
  }

  retain(predicate: (entry: PageWorkspaceEntry<T>) => boolean): void {
    for (const entry of this.values()) {
      if (!predicate(entry)) {
        this.remove(entry.identity);
      }
    }
  }

  clear(): void {
    if (this.#entries.size === 0) {
      return;
    }

    this.#entries.clear();
    this.#openOrder.length = 0;
    this.#recency.length = 0;
  }

  values(): PageWorkspaceEntry<T>[] {
    return this.#openOrder.flatMap((identity) => {
      const entry = this.#entries.get(identity);
      return entry ? [entry] : [];
    });
  }

  snapshot(
    predicate: (entry: PageWorkspaceEntry<T>) => boolean = () => true,
  ): PersistedPageWorkspaceV1 {
    const tabs = this.values().filter(predicate);
    const identities = new Set(tabs.map(({ identity }) => identity));

    return {
      recency: this.#recency.filter((identity) => identities.has(identity)),
      tabs: tabs.map(({ cacheParams, href, routeKey, title }) => ({
        cacheParams,
        href,
        routeKey,
        title,
      })),
      version: 1,
    };
  }

  restore(
    snapshot: PersistedPageWorkspaceV1,
    resolve: (tab: PersistedPageTab) => RestoredPageRuntime<T> | null,
  ): void {
    this.clear();

    for (const tab of snapshot.tabs) {
      const runtime = resolve(tab);

      if (!runtime) {
        continue;
      }

      const identity = toPageCacheIdentity(tab.routeKey, tab.cacheParams);

      if (this.#entries.has(identity)) {
        continue;
      }

      this.#entries.set(identity, { ...tab, ...runtime, identity });
      this.#openOrder.push(identity);
    }

    for (const identity of snapshot.recency) {
      if (this.#entries.has(identity) && !this.#recency.includes(identity)) {
        this.#recency.push(identity);
      }
    }

    for (const identity of this.#openOrder) {
      if (!this.#recency.includes(identity)) {
        this.#recency.push(identity);
      }
    }

    while (this.#entries.size > this.#capacity) {
      const oldestIdentity = this.#recency[0];

      if (oldestIdentity === undefined) {
        break;
      }

      this.remove(oldestIdentity);
    }
  }
}

export function toPageCacheIdentity(routeKey: RouteKey, params: PageCacheParams): string {
  return `${routeKey}:${stableSerialize(params)}`;
}

function moveToEnd(values: string[], value: string): void {
  removeValue(values, value);
  values.push(value);
}

function removeValue(values: string[], value: string): void {
  const index = values.indexOf(value);

  if (index !== -1) {
    values.splice(index, 1);
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

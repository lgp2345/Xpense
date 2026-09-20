import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";

import type {
  JsonValue,
  PageCacheParams,
  PersistedPageTab,
  PersistedPageWorkspaceV1,
} from "./page-cache-store";

const STORAGE_PREFIX = "xpense:web:page-workspace:v1:";

export type PageWorkspaceScope = {
  organizationId: string;
  userId: string;
};

export type PageWorkspaceStorage = Pick<
  Storage,
  "getItem" | "key" | "length" | "removeItem" | "setItem"
>;

export function getBrowserPageWorkspaceStorage(): PageWorkspaceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadPageWorkspace(
  storage: PageWorkspaceStorage,
  scope: PageWorkspaceScope,
): PersistedPageWorkspaceV1 | null {
  const key = toStorageKey(scope);

  try {
    const raw = storage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (isPersistedWorkspace(parsed)) {
      return parsed;
    }

    storage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

export function savePageWorkspace(
  storage: PageWorkspaceStorage,
  scope: PageWorkspaceScope,
  workspace: PersistedPageWorkspaceV1,
): void {
  try {
    storage.setItem(toStorageKey(scope), JSON.stringify(workspace));
  } catch {
    // Browser storage can be disabled or full. The in-memory workspace remains usable.
  }
}

export function clearPageWorkspacesForUser(storage: PageWorkspaceStorage, userId: string): void {
  const prefix = `${STORAGE_PREFIX}${encodeURIComponent(userId)}:`;

  try {
    const keys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Storage cleanup is best-effort when the browser denies access.
  }
}

function toStorageKey({ organizationId, userId }: PageWorkspaceScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(organizationId)}`;
}

function isPersistedWorkspace(value: unknown): value is PersistedPageWorkspaceV1 {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  return (
    Array.isArray(value.tabs) &&
    value.tabs.every(isPersistedTab) &&
    Array.isArray(value.recency) &&
    value.recency.every((identity) => typeof identity === "string")
  );
}

function isPersistedTab(value: unknown): value is PersistedPageTab {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRouteKey(value.routeKey) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.href === "string" &&
    value.href.startsWith("/") &&
    !value.href.startsWith("//") &&
    isPageCacheParams(value.cacheParams)
  );
}

function isRouteKey(value: unknown): value is RouteKey {
  return typeof value === "string" && value in ROUTE_DEFINITIONS;
}

function isPageCacheParams(value: unknown): value is PageCacheParams {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

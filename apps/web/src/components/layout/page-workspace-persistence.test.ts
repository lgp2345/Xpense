import { describe, expect, it } from "vitest";

import type { PersistedPageWorkspaceV1 } from "./page-cache-store";
import {
  clearPageWorkspacesForUser,
  loadPageWorkspace,
  type PageWorkspaceScope,
  type PageWorkspaceStorage,
  savePageWorkspace,
} from "./page-workspace-persistence";

class MemoryStorage implements PageWorkspaceStorage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const WORKSPACE_TAB = {
  cacheParams: { memberId: "1" },
  href: "/members?page=2#active",
  routeKey: "Members",
  title: "成员管理",
} as const;

const WORKSPACE: PersistedPageWorkspaceV1 = {
  recency: ['Members:{"memberId":"1"}'],
  tabs: [WORKSPACE_TAB],
  version: 1,
};

const USER_ONE_ORG_ONE: PageWorkspaceScope = { organizationId: "org-1", userId: "user-1" };
const USER_ONE_ORG_TWO: PageWorkspaceScope = { organizationId: "org-2", userId: "user-1" };
const USER_TWO_ORG_ONE: PageWorkspaceScope = { organizationId: "org-1", userId: "user-2" };

describe("page workspace persistence", () => {
  it("keeps workspaces isolated by user and organization", () => {
    const storage = new MemoryStorage();
    const secondWorkspace = {
      ...WORKSPACE,
      tabs: [{ ...WORKSPACE_TAB, href: "/members?page=9" }],
    } satisfies PersistedPageWorkspaceV1;

    savePageWorkspace(storage, USER_ONE_ORG_ONE, WORKSPACE);
    savePageWorkspace(storage, USER_ONE_ORG_TWO, secondWorkspace);

    expect(loadPageWorkspace(storage, USER_ONE_ORG_ONE)).toEqual(WORKSPACE);
    expect(loadPageWorkspace(storage, USER_ONE_ORG_TWO)).toEqual(secondWorkspace);
    expect(loadPageWorkspace(storage, USER_TWO_ORG_ONE)).toBeNull();
  });

  it("clears every organization for only the signed-out user", () => {
    const storage = new MemoryStorage();
    savePageWorkspace(storage, USER_ONE_ORG_ONE, WORKSPACE);
    savePageWorkspace(storage, USER_ONE_ORG_TWO, WORKSPACE);
    savePageWorkspace(storage, USER_TWO_ORG_ONE, WORKSPACE);

    clearPageWorkspacesForUser(storage, "user-1");

    expect(loadPageWorkspace(storage, USER_ONE_ORG_ONE)).toBeNull();
    expect(loadPageWorkspace(storage, USER_ONE_ORG_TWO)).toBeNull();
    expect(loadPageWorkspace(storage, USER_TWO_ORG_ONE)).toEqual(WORKSPACE);
  });

  it.each([
    '{"version":2,"tabs":[],"recency":[]}',
    '{"version":1,"tabs":[{"routeKey":"Missing","cacheParams":{},"title":"bad","href":"/bad"}],"recency":[]}',
    '{"version":1,"tabs":[{"routeKey":"Members","cacheParams":{},"title":"bad","href":"https://example.com"}],"recency":[]}',
  ])("discards invalid persisted data", (raw) => {
    const storage = new MemoryStorage();
    storage.setItem("xpense:web:page-workspace:v1:user-1:org-1", raw);

    expect(loadPageWorkspace(storage, USER_ONE_ORG_ONE)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("falls back without throwing when browser storage is unavailable", () => {
    const storage: PageWorkspaceStorage = {
      get length(): number {
        throw new Error("unavailable");
      },
      getItem: () => {
        throw new Error("unavailable");
      },
      key: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(() => savePageWorkspace(storage, USER_ONE_ORG_ONE, WORKSPACE)).not.toThrow();
    expect(loadPageWorkspace(storage, USER_ONE_ORG_ONE)).toBeNull();
    expect(() => clearPageWorkspacesForUser(storage, "user-1")).not.toThrow();
  });
});

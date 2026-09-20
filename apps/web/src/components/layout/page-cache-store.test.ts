import { describe, expect, it } from "vitest";

import { PageWorkspaceStore, toPageCacheIdentity } from "./page-cache-store";

type TestPage = {
  label: string;
};

function page(routeKey: "Members" | "Roles" | "Sessions" | "AuditLogs", menuId: number) {
  return {
    cacheParams: {},
    href: `/${routeKey.toLowerCase()}`,
    menuId,
    routeKey,
    title: routeKey,
    value: { label: routeKey },
  } as const;
}

describe("toPageCacheIdentity", () => {
  it("builds the same identity for equivalent cache params regardless of key order", () => {
    expect(toPageCacheIdentity("Members", { memberId: "member-1", tab: "profile" })).toBe(
      toPageCacheIdentity("Members", { tab: "profile", memberId: "member-1" }),
    );
  });

  it("uses the stable route key instead of a database menu id", () => {
    expect(toPageCacheIdentity("Members", { memberId: "member-1" })).toBe(
      'Members:{"memberId":"member-1"}',
    );
  });
});

describe("PageWorkspaceStore", () => {
  it("keeps display order stable while using visits only for LRU eviction", () => {
    const store = new PageWorkspaceStore<TestPage>(3);

    store.upsert(page("Members", 1));
    store.upsert(page("Roles", 2));
    store.upsert(page("Sessions", 3));
    store.upsert({ ...page("Members", 1), href: "/members?page=2" });
    store.upsert(page("AuditLogs", 4));

    expect(store.values().map(({ routeKey }) => routeKey)).toEqual([
      "Members",
      "Sessions",
      "AuditLogs",
    ]);
    expect(store.values()[0]).toMatchObject({
      href: "/members?page=2",
      value: { label: "Members" },
    });
  });

  it("selects the right neighbor before the left when closing a tab", () => {
    const store = new PageWorkspaceStore<TestPage>();

    store.upsert(page("Members", 1));
    store.upsert(page("Roles", 2));
    store.upsert(page("Sessions", 3));

    expect(store.getCloseTarget(toPageCacheIdentity("Roles", {}))?.routeKey).toBe("Sessions");
    expect(store.getCloseTarget(toPageCacheIdentity("Sessions", {}))?.routeKey).toBe("Roles");
  });

  it("does not provide a close target for the last tab", () => {
    const store = new PageWorkspaceStore<TestPage>();
    store.upsert(page("Members", 1));

    expect(store.getCloseTarget(toPageCacheIdentity("Members", {}))).toBeNull();
  });

  it("refreshes menu metadata without making the tab recently used", () => {
    const store = new PageWorkspaceStore<TestPage>(2);
    store.upsert(page("Members", 1));
    store.upsert(page("Roles", 2));

    store.updateMenu("Members:{}", { id: 101, title: "成员与用户" });
    store.upsert(page("Sessions", 3));

    expect(store.values().map(({ routeKey }) => routeKey)).toEqual(["Roles", "Sessions"]);
  });

  it("removes unauthorized entries and clears the whole workspace", () => {
    const store = new PageWorkspaceStore<TestPage>();
    store.upsert(page("Members", 1));
    store.upsert(page("Roles", 2));

    store.retain(({ menuId }) => menuId === 2);

    expect(store.values().map(({ routeKey }) => routeKey)).toEqual(["Roles"]);

    store.clear();

    expect(store.values()).toEqual([]);
  });

  it("restores only entries accepted by the current authorized menu resolver", () => {
    const source = new PageWorkspaceStore<TestPage>();
    source.upsert(page("Members", 1));
    source.upsert(page("Roles", 2));
    source.upsert({ ...page("Members", 1), href: "/members?page=2" });
    const snapshot = source.snapshot();
    const restored = new PageWorkspaceStore<TestPage>();

    restored.restore(snapshot, (tab) =>
      tab.routeKey === "Members" ? { menuId: 101, title: "成员管理", value: null } : null,
    );

    expect(restored.values()).toEqual([
      expect.objectContaining({
        href: "/members?page=2",
        menuId: 101,
        routeKey: "Members",
        title: "成员管理",
        value: null,
      }),
    ]);
  });

  it("trims an oversized restored workspace by persisted recency without reordering tabs", () => {
    const restored = new PageWorkspaceStore<TestPage>(2);

    restored.restore(
      {
        recency: [
          toPageCacheIdentity("Members", {}),
          toPageCacheIdentity("Roles", {}),
          toPageCacheIdentity("Sessions", {}),
        ],
        tabs: [
          { cacheParams: {}, href: "/members", routeKey: "Members", title: "Members" },
          { cacheParams: {}, href: "/roles", routeKey: "Roles", title: "Roles" },
          { cacheParams: {}, href: "/sessions", routeKey: "Sessions", title: "Sessions" },
        ],
        version: 1,
      },
      (tab) => ({ menuId: tab.routeKey.length, title: tab.title, value: null }),
    );

    expect(restored.values().map(({ routeKey }) => routeKey)).toEqual(["Roles", "Sessions"]);
  });
});

import { describe, expect, it } from "vitest";

import { PageCacheStore, toPageCacheIdentity } from "./page-cache-store";

describe("PageCacheStore", () => {
  it("builds the same identity for equivalent route params regardless of key order", () => {
    expect(toPageCacheIdentity(7, { memberId: "member-1", tab: "profile" })).toBe(
      toPageCacheIdentity(7, { tab: "profile", memberId: "member-1" }),
    );
  });

  it("keeps search changes outside the cache identity", () => {
    expect(toPageCacheIdentity(7, { memberId: "member-1" })).toBe('7:{"memberId":"member-1"}');
  });

  it("retains the ten most recently used entries", () => {
    const store = new PageCacheStore<string>(10);

    for (let menuId = 1; menuId <= 10; menuId += 1) {
      store.upsert({
        identity: toPageCacheIdentity(menuId, {}),
        menuId,
        value: `page-${menuId}`,
      });
    }

    store.upsert({
      identity: toPageCacheIdentity(1, {}),
      menuId: 1,
      value: "page-1-updated",
    });
    store.upsert({
      identity: toPageCacheIdentity(11, {}),
      menuId: 11,
      value: "page-11",
    });

    expect(store.values().map(({ menuId }) => menuId)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 1, 11]);
    expect(store.values().find(({ menuId }) => menuId === 1)?.value).toBe("page-1-updated");
  });

  it("removes entries that are no longer authorized and can clear the whole scope", () => {
    const store = new PageCacheStore<string>();
    store.upsert({ identity: toPageCacheIdentity(1, {}), menuId: 1, value: "members" });
    store.upsert({ identity: toPageCacheIdentity(2, {}), menuId: 2, value: "roles" });

    store.retain(({ menuId }) => menuId === 2);

    expect(store.values().map(({ value }) => value)).toEqual(["roles"]);

    store.clear();

    expect(store.values()).toEqual([]);
  });
});

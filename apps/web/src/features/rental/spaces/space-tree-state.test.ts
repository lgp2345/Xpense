import type {
  RentalSpaceChildrenPage,
  RentalSpaceNode,
  RentalSpaceSearchResult,
} from "@xpense/shared";
import { describe, expect, it } from "vitest";

import {
  collapseSpace,
  createSpaceTreeState,
  mergeChildPage,
  removeSpace,
  replaceChildPage,
  searchAncestorIds,
} from "./space-tree-state";

function node(
  id: string,
  parentId: string | null,
  overrides: Partial<RentalSpaceNode> = {},
): RentalSpaceNode {
  return {
    id,
    propertyId: "property-a",
    parentId,
    name: id,
    code: null,
    type: "room",
    customTypeName: null,
    isRentable: true,
    note: null,
    isActive: true,
    isEffectivelyActive: true,
    sortOrder: 0,
    hasChildren: false,
    leaseStatus: "vacant",
    leaseBlockedReason: null,
    hasUpcomingContract: false,
    ...overrides,
  };
}

function page(
  items: RentalSpaceNode[],
  pageNumber = 1,
  total = items.length,
): RentalSpaceChildrenPage {
  return { items, page: pageNumber, pageSize: 1, total };
}

describe("space tree state", () => {
  it("merges root and later child pages without duplicating prior items", () => {
    const first = mergeChildPage(
      createSpaceTreeState(),
      null,
      page([node("building-1", null)], 1, 2),
    );
    const next = mergeChildPage(first, "building-1", page([node("room-1", "building-1")], 1, 2));
    const merged = mergeChildPage(
      next,
      "building-1",
      page([node("room-1", "building-1"), node("room-2", "building-1")], 2, 2),
    );

    expect(merged.byParent["building-1"]?.items).toEqual(["room-1", "room-2"]);
    expect(merged.byParent.root?.items).toEqual(["building-1"]);
  });

  it("collapses an entire loaded branch and removes an evicted branch from the state", () => {
    const root = mergeChildPage(createSpaceTreeState(), null, page([node("building-1", null)]));
    const floors = mergeChildPage(root, "building-1", page([node("floor-1", "building-1")]));
    const rooms = mergeChildPage(floors, "floor-1", page([node("room-1", "floor-1")]));
    const expanded = { ...rooms, expandedIds: ["building-1", "floor-1"] };

    expect(collapseSpace(expanded, "building-1").expandedIds).toEqual([]);
    const removed = removeSpace(expanded, "building-1");
    expect(removed.nodesById).toEqual({});
    expect(removed.byParent.root?.items).toEqual([]);
    expect(removed.byParent["building-1"]).toBeUndefined();
    expect(removed.byParent["floor-1"]).toBeUndefined();
  });

  it("replaces a refreshed loaded page so deleted and moved nodes no longer render", () => {
    const loaded = mergeChildPage(
      createSpaceTreeState(),
      null,
      page([node("building-1", null), node("building-2", null)], 1, 2),
    );

    const refreshed = replaceChildPage(loaded, null, page([node("building-2", null)]));

    expect(refreshed.byParent.root?.items).toEqual(["building-2"]);
    expect(refreshed.nodesById["building-1"]).toBeUndefined();
  });

  it("returns every ancestor in root-to-leaf order while excluding the focused search target", () => {
    const result: RentalSpaceSearchResult = {
      ...node("room-101", "unit-a"),
      path: [
        { id: "building-a", name: "A 楼" },
        { id: "floor-1", name: "1 层" },
        { id: "unit-a", name: "A 单元" },
        { id: "room-101", name: "101" },
      ],
    };

    expect(searchAncestorIds(result)).toEqual(["building-a", "floor-1", "unit-a"]);
  });
});

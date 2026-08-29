import type {
  RentalSpaceChildrenPage,
  RentalSpaceNode,
  RentalSpaceSearchResult,
} from "@xpense/shared";

export const ROOT_PARENT_KEY = "root";

export type SpaceTreePage = {
  items: string[];
  page: number;
  pageSize: number;
  total: number;
};

export type SpaceTreeState = {
  byParent: Record<string, SpaceTreePage>;
  expandedIds: string[];
  nodesById: Record<string, RentalSpaceNode>;
};

/** 创建仅保存已访问分支的空间树状态，避免首次加载展开整棵树。 */
export function createSpaceTreeState(): SpaceTreeState {
  return { byParent: {}, expandedIds: [], nodesById: {} };
}

/** 将某个父节点的新分页并入状态；同一空间在跨页重叠时只保留一次。 */
export function mergeChildPage(
  state: SpaceTreeState,
  parentId: string | null,
  page: RentalSpaceChildrenPage,
): SpaceTreeState {
  const parentKey = toParentKey(parentId);
  const previous = state.byParent[parentKey];
  const itemIds = [...(previous?.items ?? [])];
  const seen = new Set(itemIds);
  const nodesById = { ...state.nodesById };
  for (const item of page.items) {
    nodesById[item.id] = item;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      itemIds.push(item.id);
    }
  }
  return {
    ...state,
    nodesById,
    byParent: {
      ...state.byParent,
      [parentKey]: { items: itemIds, page: page.page, pageSize: page.pageSize, total: page.total },
    },
  };
}

/** 用服务端最新分页替换已加载分支，并清除不再从根节点可达的旧数据。 */
export function replaceChildPage(
  state: SpaceTreeState,
  parentId: string | null,
  page: RentalSpaceChildrenPage,
): SpaceTreeState {
  const parentKey = toParentKey(parentId);
  const nodesById = { ...state.nodesById };
  for (const item of page.items) nodesById[item.id] = item;
  const byParent = {
    ...state.byParent,
    [parentKey]: {
      items: page.items.map((item) => item.id),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    },
  };
  const reachable = collectReachableIds(byParent);
  const reachableByParent = Object.fromEntries(
    Object.entries(byParent).filter(([key]) => key === ROOT_PARENT_KEY || reachable.has(key)),
  );
  return {
    byParent: reachableByParent,
    expandedIds: state.expandedIds.filter((id) => reachable.has(id)),
    nodesById: Object.fromEntries(Object.entries(nodesById).filter(([id]) => reachable.has(id))),
  };
}

/** 展开一个节点，保持其余已访问分支不变。 */
export function expandSpace(state: SpaceTreeState, spaceId: string): SpaceTreeState {
  return state.expandedIds.includes(spaceId)
    ? state
    : { ...state, expandedIds: [...state.expandedIds, spaceId] };
}

/** 折叠节点及其已展开后代，但保留已加载数据以便再次展开时不重复请求。 */
export function collapseSpace(state: SpaceTreeState, spaceId: string): SpaceTreeState {
  const collapsedIds = collectDescendantIds(state, spaceId);
  return {
    ...state,
    expandedIds: state.expandedIds.filter((id) => !collapsedIds.has(id)),
  };
}

/** 从已访问树中移除节点和全部已加载后代，防止失效节点再次显示。 */
export function removeSpace(state: SpaceTreeState, spaceId: string): SpaceTreeState {
  const removedIds = collectDescendantIds(state, spaceId);
  const nodesById = Object.fromEntries(
    Object.entries(state.nodesById).filter(([id]) => !removedIds.has(id)),
  );
  const byParent = Object.fromEntries(
    Object.entries(state.byParent)
      .filter(([parentId]) => !removedIds.has(parentId))
      .map(([parentId, page]) => [
        parentId,
        { ...page, items: page.items.filter((id) => !removedIds.has(id)) },
      ]),
  );
  return {
    byParent,
    expandedIds: state.expandedIds.filter((id) => !removedIds.has(id)),
    nodesById,
  };
}

/** 搜索路径含目标本身；定位时只需依次展开其祖先。 */
export function searchAncestorIds(result: RentalSpaceSearchResult): string[] {
  return result.path.filter((item) => item.id !== result.id).map((item) => item.id);
}

export function childPage(
  state: SpaceTreeState,
  parentId: string | null,
): SpaceTreePage | undefined {
  return state.byParent[toParentKey(parentId)];
}

export function hasMoreChildren(state: SpaceTreeState, parentId: string | null): boolean {
  const page = childPage(state, parentId);
  return Boolean(page && page.items.length < page.total);
}

function toParentKey(parentId: string | null): string {
  return parentId ?? ROOT_PARENT_KEY;
}

function collectDescendantIds(state: SpaceTreeState, spaceId: string): Set<string> {
  const result = new Set<string>([spaceId]);
  const pending = [spaceId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    if (!parentId) continue;
    for (const childId of state.byParent[parentId]?.items ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        pending.push(childId);
      }
    }
  }
  return result;
}

function collectReachableIds(byParent: Record<string, SpaceTreePage>): Set<string> {
  const reachable = new Set<string>();
  const pending = [...(byParent[ROOT_PARENT_KEY]?.items ?? [])];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(byParent[id]?.items ?? []));
  }
  return reachable;
}

import type { AuthStoreApi } from "../stores/auth-store";

/** 判断登录状态或当前组织是否跨越了财务缓存隔离边界。 */
export function didBookkeepingScopeChange(
  state: ReturnType<AuthStoreApi["getState"]>,
  previousState: ReturnType<AuthStoreApi["getState"]>,
): boolean {
  return (
    state.status !== previousState.status ||
    state.currentOrganization?.id !== previousState.currentOrganization?.id
  );
}

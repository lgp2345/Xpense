import type { AuthStoreApi } from "../../stores/auth-store";

/** 判断登录状态或当前组织是否跨越了租赁缓存隔离边界。 */
export function didRentalScopeChange(
  state: ReturnType<AuthStoreApi["getState"]>,
  previousState: ReturnType<AuthStoreApi["getState"]>,
): boolean {
  return (
    state.status !== previousState.status ||
    state.currentOrganization?.id !== previousState.currentOrganization?.id
  );
}

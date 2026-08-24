import { Dashboard } from "../features/dashboard/dashboard";
import type { BookkeepingApi } from "../services/bookkeeping-api";

/** 将路由会话中的组织与记账 API 传给真实月度总览。 */
export function DashboardPage({
  api,
  organizationId,
}: {
  api: BookkeepingApi;
  organizationId: string;
}) {
  return <Dashboard api={api} organizationId={organizationId} />;
}

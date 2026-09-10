import { createFileRoute } from "@tanstack/react-router";
import { type TransactionType, transactionTypes } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { readSearchDate, readSearchPage, readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { ListTransactionsQuery } from "@/services/bookkeeping-api";
import type { WebSessionDependency } from "@/services/web-session";

const TransactionsPage = lazy(() =>
  import("@/features/bookkeeping/transactions/transactions-page").then((module) => ({
    default: module.TransactionsPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(bookkeeping)/transactions")({
  staticData: { routeKey: "Transactions" },
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Transactions")),
    registeredPage: defineRegisteredPage({
      routeKey: "Transactions",
      cacheParams: params,
      render: ({ session }) => <TransactionsRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateTransactionSearch,
});

export function TransactionsRoutePage({
  search,
  session,
}: {
  search: ListTransactionsQuery;
  session: WebSessionDependency;
}) {
  const navigate = Route.useNavigate();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return renderLazyPage(
    <TransactionsPage
      api={session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true })}
    />,
  );
}

/** 将交易 URL 查询参数收敛为服务端支持的筛选字段。 */
export function validateTransactionSearch(search: Record<string, unknown>): ListTransactionsQuery {
  const result: ListTransactionsQuery = {};
  const ledgerId = readSearchUuid(search.ledgerId);
  const accountId = readSearchUuid(search.accountId);
  const categoryId = readSearchUuid(search.categoryId);
  const type = readTransactionType(search.type);
  const keyword = readTrimmedSearchString(search.keyword);
  const from = readSearchDate(search.from);
  const to = readSearchDate(search.to);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);

  if (ledgerId) result.ledgerId = ledgerId;
  if (accountId) result.accountId = accountId;
  if (categoryId) result.categoryId = categoryId;
  if (type) result.type = type;
  if (keyword) result.keyword = keyword;
  if (!from || !to || from <= to) {
    if (from) result.from = from;
    if (to) result.to = to;
  }
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;

  return result;
}

const uuidPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

function readSearchUuid(value: unknown): string | undefined {
  const normalized = readTrimmedSearchString(value);
  return normalized && uuidPattern.test(normalized) ? normalized : undefined;
}

function readTransactionType(value: unknown): TransactionType | undefined {
  return typeof value === "string" && transactionTypes.some((type) => type === value)
    ? (value as TransactionType)
    : undefined;
}

function readSearchPageSize(value: unknown): number | undefined {
  const pageSize = readSearchPage(value);
  return pageSize !== undefined && pageSize <= 100 ? pageSize : undefined;
}

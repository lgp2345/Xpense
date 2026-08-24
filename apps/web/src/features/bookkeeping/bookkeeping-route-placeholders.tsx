import type { PermissionKey } from "@xpense/shared";

import type { BookkeepingApi, ListTransactionsQuery } from "../../services/bookkeeping-api";

type PlaceholderPageProps = {
  api: BookkeepingApi;
  permissions: readonly PermissionKey[];
};

type TransactionsPlaceholderPageProps = PlaceholderPageProps & {
  search: ListTransactionsQuery;
};

/** Task 12 接入交易工作台前使用的可路由占位页面。 */
export function TransactionsPlaceholderPage({
  api,
  permissions,
  search,
}: TransactionsPlaceholderPageProps) {
  void api;
  void search;
  return (
    <BookkeepingPlaceholder
      canWrite={permissions.includes("transactions:create")}
      title="交易记录"
    />
  );
}

/** 展示统一的短期记账路由占位内容。 */
function BookkeepingPlaceholder({ canWrite, title }: { canWrite: boolean; title: string }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">记账页面正在建设中</p>
        {!canWrite ? <p className="mt-1 text-xs text-muted-foreground">当前为只读权限</p> : null}
      </div>
    </main>
  );
}

import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { BookkeepingApi } from "../../services/bookkeeping-api";
import { bookkeepingQueryOptions } from "../../services/bookkeeping-query";

type DashboardProps = {
  api: BookkeepingApi;
  organizationId: string;
};

/** 展示当前组织本月真实收支、净额和支出分类占比。 */
export function Dashboard({ api, organizationId }: DashboardProps) {
  const month = currentCalendarMonth();
  const statisticsQuery = useQuery(bookkeepingQueryOptions.monthly(api, organizationId, { month }));

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8" id="dashboard-main">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">{month} 月度总览</p>
      </header>
      {statisticsQuery.isPending ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <span className="sr-only">正在加载本月总览...</span>
          </CardContent>
        </Card>
      ) : statisticsQuery.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          加载本月总览失败，请稍后重试。
        </p>
      ) : (
        <>
          <section aria-label="本月核心指标" className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={ArrowUpRight}
              label="本月收入"
              value={formatMoney(statisticsQuery.data.incomeMinor, statisticsQuery.data.currency)}
              tone="income"
            />
            <MetricCard
              icon={ArrowDownRight}
              label="本月支出"
              value={formatMoney(statisticsQuery.data.expenseMinor, statisticsQuery.data.currency)}
              tone="expense"
            />
            <MetricCard
              icon={Scale}
              label="本月净额"
              value={formatMoney(statisticsQuery.data.netMinor, statisticsQuery.data.currency)}
              tone="neutral"
            />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>支出分类占比</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statisticsQuery.data.expenseCategories.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">本月暂无支出。</p>
              ) : (
                statisticsQuery.data.expenseCategories.map((category) => (
                  <div className="space-y-1.5" key={category.categoryId}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span>{category.categoryName}</span>
                      <span className="tabular-nums">{category.percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive"
                        style={{ width: `${Math.min(100, Math.max(0, category.percentage))}%` }}
                      />
                    </div>
                    <p className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatMoney(category.amountMinor, statisticsQuery.data.currency)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

/** 渲染一项月度核心金额。 */
function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  tone: "income" | "expense" | "neutral";
  value: string;
}) {
  const toneClass =
    tone === "income"
      ? "text-emerald-600"
      : tone === "expense"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon aria-hidden="true" className={`size-4 ${toneClass}`} />
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-medium tabular-nums ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

/** 取得浏览器当前公历月的 YYYY-MM 查询值。 */
function currentCalendarMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 使用 bigint 拆分安全整数金额，避免除法导致分位丢失。 */
function formatMoney(amountMinor: number, currency: string): string {
  const amount = BigInt(amountMinor);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100n).toString().padStart(2, "0");
  const symbol = currency === "CNY" ? "¥" : `${currency} `;
  return `${negative ? "-" : ""}${symbol}${whole}.${cents}`;
}

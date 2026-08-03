import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@heroui/react/card";
import { Activity, ChartNoAxesCombined, MousePointerClick, UsersRound } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { analyticsData } from "./dashboard-data";

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const analyticsMetricIcons = [
  MousePointerClick,
  UsersRound,
  Activity,
  ChartNoAxesCombined,
] as const;
const trafficLabel = analyticsData.traffic
  .map(({ day, visits, uniqueVisitors }) => `${day}: 访问 ${visits}，访客 ${uniqueVisitors}`)
  .join("；");

export function Analytics() {
  return (
    <div className="space-y-4">
      <Card className="rounded-[var(--radius-analysis)] border-0 bg-[var(--color-surface-solid)] shadow-[var(--shadow-float)]">
        <CardHeader>
          <CardTitle>访问趋势</CardTitle>
          <CardDescription>本周访问量与独立访客</CardDescription>
        </CardHeader>
        <CardContent>
          <div aria-label={`访问趋势，${trafficLabel}`} role="img">
            <ResponsiveContainer height={300} width="100%">
              <AreaChart data={analyticsData.traffic} margin={{ left: 12, right: 12 }}>
                <XAxis axisLine={false} dataKey="day" fontSize={12} tickLine={false} />
                <YAxis axisLine={false} fontSize={12} tickLine={false} width={40} />
                <Area
                  dataKey="visits"
                  fill="var(--color-income)"
                  fillOpacity={0.15}
                  isAnimationActive={!prefersReducedMotion}
                  stroke="var(--color-income)"
                  type="monotone"
                />
                <Area
                  dataKey="uniqueVisitors"
                  fill="var(--color-budget)"
                  fillOpacity={0.1}
                  isAnimationActive={!prefersReducedMotion}
                  stroke="var(--color-budget)"
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {analyticsData.metrics.map((metric, index) => {
          const Icon = analyticsMetricIcons[index];

          if (!Icon) {
            return null;
          }

          return (
            <Card
              className="rounded-[var(--radius-card)] border-0 bg-[var(--color-surface-solid)] shadow-[var(--shadow-float)]"
              key={metric.label}
            >
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-medium tabular-nums">{metric.value}</p>
                <p className="text-xs text-muted-foreground">{metric.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <AnalyticsList
          description="带来访问量最多的来源"
          items={analyticsData.referrers}
          title="推广来源"
        />
        <AnalyticsList
          description="用户使用应用的设备分布"
          items={analyticsData.devices}
          percentage
          title="访问设备"
        />
      </div>
    </div>
  );
}

type AnalyticsListProps = {
  description: string;
  items: readonly { label: string; value: number }[];
  percentage?: boolean;
  title: string;
};

function AnalyticsList({ description, items, percentage = false, title }: AnalyticsListProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <Card className="col-span-1 rounded-[var(--radius-card)] border-0 bg-[var(--color-surface-solid)] shadow-[var(--shadow-float)] lg:col-span-3 first:lg:col-span-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => {
            const width = `${Math.round((item.value / maxValue) * 100)}%`;

            return (
              <li className="flex items-center gap-3" key={item.label}>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs text-muted-foreground">{item.label}</p>
                  <div className="h-2.5 w-full bg-muted">
                    <div className="h-2.5 bg-[var(--color-income)]" style={{ width }} />
                  </div>
                </div>
                <span className="text-xs font-medium tabular-nums">
                  {item.value}
                  {percentage ? "%" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

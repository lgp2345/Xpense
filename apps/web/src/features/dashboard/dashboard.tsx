import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@heroui/react/card";
import { Tab, TabList, TabPanel, Tabs } from "@heroui/react/tabs";
import { Activity, CreditCard, DollarSign, Users } from "lucide-react";

import { Analytics } from "./analytics";
import { dashboardMetrics } from "./dashboard-data";
import { OverviewChart } from "./overview-chart";
import { RecentSales } from "./recent-sales";

const metricIcons = [DollarSign, Users, CreditCard, Activity] as const;

export function Dashboard() {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8" id="dashboard-main">
      <h1 className="text-2xl font-medium tracking-tight">仪表盘</h1>

      <Tabs className="space-y-4" defaultSelectedKey="overview">
        <TabList
          aria-label="仪表盘视图"
          className="inline-flex rounded-[var(--radius-control)] bg-muted p-1"
        >
          <Tab
            className="rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium"
            id="overview"
          >
            总览
          </Tab>
          <Tab
            className="rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium"
            id="analytics"
          >
            分析
          </Tab>
        </TabList>

        <TabPanel className="space-y-4 outline-none" id="overview">
          <section aria-label="核心指标" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dashboardMetrics.map((metric, index) => {
              const Icon = metricIcons[index];

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
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <Card className="col-span-1 rounded-[var(--radius-analysis)] border-0 bg-[var(--color-surface-solid)] shadow-[var(--shadow-float)] lg:col-span-4">
              <CardHeader>
                <CardTitle>概览</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4">
                <OverviewChart />
              </CardContent>
            </Card>
            <Card className="col-span-1 rounded-[var(--radius-card)] border-0 bg-[var(--color-surface-solid)] shadow-[var(--shadow-float)] lg:col-span-3">
              <CardHeader>
                <CardTitle>近期销售</CardTitle>
                <CardDescription>本月已完成 265 笔销售。</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentSales />
              </CardContent>
            </Card>
          </section>
        </TabPanel>

        <TabPanel className="outline-none" id="analytics">
          <Analytics />
        </TabPanel>
      </Tabs>
    </main>
  );
}

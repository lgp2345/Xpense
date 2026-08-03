import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { overviewData } from "./dashboard-data";

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const overviewLabel = overviewData.map(({ month, total }) => `${month}: ${total}`).join("，");

export function OverviewChart() {
  return (
    <div aria-label={`月度收入趋势，${overviewLabel}`} role="img">
      <ResponsiveContainer height={350} width="100%">
        <BarChart data={overviewData} margin={{ left: 12, right: 12 }}>
          <XAxis axisLine={false} dataKey="month" fontSize={12} tickLine={false} />
          <YAxis
            axisLine={false}
            fontSize={12}
            tickFormatter={(value: number) => `¥${value}`}
            tickLine={false}
            width={56}
          />
          <Bar
            dataKey="total"
            fill="var(--color-income)"
            isAnimationActive={!prefersReducedMotion}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

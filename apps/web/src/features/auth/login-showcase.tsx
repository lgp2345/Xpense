import { ChartLine, Ellipsis, Wallet } from "lucide-react";

const weeklyBars = [38, 52, 44, 68, 58, 78, 64];

export function LoginShowcase() {
  return (
    <aside
      aria-label="产品预览"
      className="hidden flex-col justify-between gap-10 border-r bg-muted/60 p-10 lg:flex"
    >
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Wallet className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Xpense</span>
        </div>

        <nav aria-hidden="true" className="mt-10 space-y-1">
          <span className="block rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            财务洞察
          </span>
          <span className="block px-3 py-2 text-sm text-muted-foreground">交易记录</span>
          <span className="block px-3 py-2 text-sm text-muted-foreground">预算管理</span>
          <span className="block px-3 py-2 text-sm text-muted-foreground">成员与权限</span>
        </nav>

        <p className="mt-10 text-xs text-muted-foreground">个人账本 · 安全工作区</p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">星期四，8月3日</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">财务洞察</h2>
          </div>
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
          >
            L
          </span>
        </div>

        <section
          aria-label="账户结余示例"
          className="rounded-lg bg-primary p-5 text-primary-foreground"
        >
          <p className="text-xs opacity-80">本月可用结余</p>
          <strong className="mt-1 block text-2xl font-semibold tabular-nums">¥28,560.00</strong>
          <span className="mt-2 inline-flex items-center gap-1 text-xs">
            <ChartLine className="size-4" />
            12.8%
          </span>
        </section>

        <section aria-label="现金流趋势示例" className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">现金流趋势</p>
              <strong className="mt-1 block text-lg font-semibold tabular-nums">¥8,240</strong>
            </div>
            <Ellipsis aria-hidden="true" className="size-5 text-muted-foreground" />
          </div>
          <div aria-hidden="true" className="mt-4 flex h-24 items-end gap-2">
            {weeklyBars.map((height) => (
              <span
                className="flex-1 rounded-sm bg-primary/60"
                key={height}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div
            aria-hidden="true"
            className="mt-2 flex justify-between text-[10px] text-muted-foreground"
          >
            <span>周一</span>
            <span>周二</span>
            <span>周三</span>
            <span>周四</span>
            <span>周五</span>
            <span>周六</span>
            <span>今天</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <section className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">本月收入</p>
            <strong className="mt-1 block text-lg font-semibold tabular-nums">¥12,800</strong>
            <span className="mt-1 block text-xs text-muted-foreground">较上月 +8.4%</span>
          </section>
          <section className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">预算使用</p>
            <strong className="mt-1 block text-lg font-semibold tabular-nums">68.7%</strong>
            <span className="mt-1 block text-xs text-muted-foreground">剩余 ¥3,640</span>
          </section>
        </div>
      </div>
    </aside>
  );
}

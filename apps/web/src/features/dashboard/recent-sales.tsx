import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { recentSales } from "./dashboard-data";

export function RecentSales() {
  return (
    <ul aria-label="近期销售明细" className="space-y-6">
      {recentSales.map((sale) => (
        <li className="flex items-center gap-4" key={sale.email}>
          <Avatar className="size-9 bg-[var(--color-canvas-blue)] text-[var(--color-ink)]">
            <AvatarFallback>{sale.initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-none">{sale.name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{sale.email}</p>
            </div>
            <p className="shrink-0 font-medium tabular-nums">{sale.amount}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

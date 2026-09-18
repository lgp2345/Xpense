import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const desktopRows = ["row-1", "row-2", "row-3", "row-4", "row-5"] as const;
const mobileCards = ["card-1", "card-2", "card-3"] as const;

type ListPageSkeletonProps = {
  label: string;
};

/** 保持列表首屏高度稳定，并分别贴近桌面表格与移动卡片的最终结构。 */
export function ListPageSkeleton({ label }: ListPageSkeletonProps) {
  return (
    <Card aria-busy="true" aria-label={label} role="status">
      <CardContent className="p-0">
        <div aria-hidden="true" className="hidden md:block">
          <div className="grid grid-cols-4 gap-6 border-b px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
          {desktopRows.map((row) => (
            <div
              className="grid min-h-12 grid-cols-4 items-center gap-6 border-b px-4 py-3"
              key={row}
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="ml-auto h-8 w-20" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="space-y-3 p-4 md:hidden">
          {mobileCards.map((card) => (
            <div className="space-y-3 rounded-lg border p-4" key={card}>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </CardContent>
    </Card>
  );
}

type ListRefreshIndicatorProps = {
  active: boolean;
  label: string;
};

/** 后台刷新时保留原内容，仅在视口顶部显示不占布局的轻量进度反馈。 */
export function ListRefreshIndicator({ active, label }: ListRefreshIndicatorProps) {
  if (!active) return null;

  return (
    <div
      aria-label={label}
      className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary/70 motion-reduce:animate-none"
      role="status"
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

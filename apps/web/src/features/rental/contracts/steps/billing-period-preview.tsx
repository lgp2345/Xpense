export function BillingPeriodPreview({
  periods,
  anchor,
}: {
  periods: string[];
  anchor: "contract_start" | "calendar_month";
}) {
  return (
    <section
      aria-label="账期预览"
      aria-live="polite"
      className="@container overflow-hidden rounded-md border bg-card text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">账期预览</h3>
        <span className="text-xs text-muted-foreground">
          {anchor === "calendar_month" ? `共 ${periods.length} 期` : "按合同起始日计费"}
        </span>
      </div>
      {periods.length ? (
        <ol
          aria-label="账期列表"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable content must be focusable for keyboard scrolling.
          tabIndex={0}
          className="grid max-h-70 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto overscroll-contain p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 @3xl:grid-cols-2"
        >
          {periods.map((period, index) => (
            <li
              key={period}
              className="flex min-w-0 items-baseline gap-3 rounded-sm px-1 py-2 text-sm first:bg-muted/50 last:bg-muted/50"
            >
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {anchor === "calendar_month" ? `第 ${index + 1} 期` : "计费规则"}
              </span>
              <span className="min-w-0 tabular-nums leading-6">{period}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          请填写有效的租期与付款周期以预览账期。
        </p>
      )}
      <p className="border-t bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
        仅供预览，最终账期由服务端计算。
      </p>
    </section>
  );
}

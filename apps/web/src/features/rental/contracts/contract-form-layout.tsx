import { Check, FileText, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const steps = [
  { label: "房产与空间", description: "确定房产及本次出租的空间" },
  { label: "承租方", description: "添加承租方并指定主付款人" },
  { label: "条款", description: "设置租期、租金与付款安排" },
  { label: "复核", description: "核对合同资料并确认创建" },
] as const;

export function ContractFormLayout({
  step,
  isDraft,
  children,
}: {
  step: number;
  isDraft: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">新建合同</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {isDraft
              ? "继续填写已有草稿，确认前会再次检查空间可用性。"
              : "按步骤填写合同资料，复核后创建合同。提交前的内容仅保留在当前页面。"}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <FileText aria-hidden="true" className="size-3.5" />
          {isDraft ? "继续草稿" : "尚未提交"}
        </span>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside aria-label="填写流程" className="min-w-0 lg:sticky lg:top-6">
          <p className="mb-4 hidden text-xs font-medium text-muted-foreground lg:block">
            合同创建流程
          </p>
          <ol aria-label="合同创建步骤" className="grid grid-cols-4 lg:grid-cols-1">
            {steps.map(({ label, description }, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className="relative min-w-0 lg:pb-7 lg:last:pb-0"
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-4 left-1/2 h-px w-full lg:top-8 lg:left-4 lg:h-full lg:w-px",
                      index < step ? "bg-primary/40" : "bg-border",
                    )}
                  />
                ) : null}
                <div className="relative flex flex-col items-center gap-2 lg:flex-row lg:items-start lg:gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                      index === step
                        ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10"
                        : index < step
                          ? "border-primary bg-background text-primary"
                          : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {index < step ? (
                      <>
                        <Check aria-hidden="true" className="size-4" />
                        <span className="sr-only">已完成</span>
                      </>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="min-w-0 text-center lg:pt-1 lg:text-left">
                    <p
                      className={cn(
                        "text-xs sm:text-sm",
                        index === step ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </p>
                    <p className="mt-1 hidden text-xs leading-5 text-muted-foreground lg:block">
                      {description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 hidden border-t pt-5 lg:block">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Info aria-hidden="true" className="size-3.5 text-muted-foreground" />
              填写提示
            </div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {isDraft
                ? "每次继续时保存当前步骤。确认前，请核对租期与空间可用性。"
                : "完成复核后统一提交。离开页面前，请留意尚未提交的内容。"}
            </p>
          </div>
        </aside>
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </>
  );
}

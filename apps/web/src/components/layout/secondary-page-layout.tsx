import { ArrowLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type SecondaryPageBreadcrumb = {
  key: string;
  label: ReactNode;
};

export function SecondaryPageLayout({
  breadcrumbs,
  title,
  status,
  description,
  actions,
  onBack,
  children,
}: {
  breadcrumbs: readonly SecondaryPageBreadcrumb[];
  title: string;
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto space-y-6 w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="border-b border-border space-y-5 pb-6">
        <Breadcrumb>
          <BreadcrumbList className="gap-x-2 gap-y-1 sm:gap-x-2">
            {breadcrumbs.map((item, index) => (
              <Fragment key={item.key}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="min-w-0 break-words">
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage className="font-medium min-w-0 break-words">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    item.label
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 min-w-0 gap-3 items-start">
            {onBack ? (
              <button
                type="button"
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="返回上一页"
                onClick={onBack}
              >
                <ArrowLeft aria-hidden="true" className="size-6" />
              </button>
            ) : null}
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap min-h-9 gap-x-3 gap-y-2 items-center">
                <h1 className="font-bold tracking-tight min-w-0 text-2xl break-words">{title}</h1>
                {status}
              </div>
              {description ? (
                <div className="text-sm text-muted-foreground">{description}</div>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}

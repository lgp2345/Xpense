import { ChevronDown, TextSearch } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FieldGroup } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function FilterPanel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 min-w-0 flex-1 justify-between px-0"
                  aria-label="打开筛选"
                >
                  <span>筛选条件</span>
                  <TextSearch aria-hidden="true" className="size-4" />
                </Button>
              }
            />
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        </div>
        <SheetContent keepMounted className="w-full max-w-sm gap-0" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b pr-12">
            <SheetTitle>筛选条件</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 [&_[data-slot=field-group]]:grid-cols-1">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3 min-w-0">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="flex-1 h-8 min-w-0 px-0 justify-between"
              aria-label={open ? "收起筛选" : "展开筛选"}
            >
              <span>筛选条件</span>
              <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
            </Button>
          }
        />
        {actions ? <div className="flex gap-2 items-center">{actions}</div> : null}
      </div>
      <CollapsibleContent keepMounted hidden={!open} className="border rounded-lg min-w-0 p-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FilterFields({ className, ...props }: ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup
      className={cn(
        "grid min-w-0 gap-3 *:min-w-0 sm:grid-cols-2 lg:grid-cols-4 [&_[data-slot=select-trigger]]:text-base md:[&_[data-slot=select-trigger]]:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function FilterActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap w-full col-span-full gap-2 items-end justify-end">
      {children}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function FilterPanel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3 min-w-0">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-8 min-w-0 flex-1 justify-between px-0"
              aria-label={open ? "收起筛选" : "展开筛选"}
            >
              <span>筛选条件</span>
              <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
            </Button>
          }
        />
        {actions ? <div className="flex gap-2 items-center">{actions}</div> : null}
      </div>
      <CollapsibleContent keepMounted hidden={!open} className="min-w-0 rounded-lg border p-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FilterFields({ className, ...props }: ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup
      className={cn("grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
      {...props}
    />
  );
}

export function FilterActions({ children }: { children: ReactNode }) {
  return (
    <div className="col-span-full flex w-full flex-wrap items-end justify-end gap-2">
      {children}
    </div>
  );
}

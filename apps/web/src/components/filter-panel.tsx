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
        <span className="font-medium text-sm">筛选条件</span>
        <div className="flex gap-2 items-center">
          {actions}
          <CollapsibleTrigger
            render={
              <Button type="button" size="sm" variant="outline">
                {open ? "收起筛选" : "展开筛选"}
                <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
              </Button>
            }
          />
        </div>
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

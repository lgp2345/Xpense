import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function FilterPanel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">筛选条件</span>
        <div className="flex items-center gap-2">
          {actions}
          <CollapsibleTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              {open ? "收起筛选" : "展开筛选"}
              <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent forceMount hidden={!open}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

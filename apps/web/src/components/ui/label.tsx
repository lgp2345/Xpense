import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ref, ...props }: React.ComponentProps<"label">) {
  return useRender({
    defaultTagName: "label",
    ref,
    props: {
      "data-slot": "label",
      ...props,
      className: cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      ),
    },
  });
}

export { Label };

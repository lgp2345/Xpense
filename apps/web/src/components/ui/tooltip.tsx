import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipDescriptionContext = React.createContext<string | undefined>(undefined);

function TooltipProvider({
  delay = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const descriptionId = React.useId();
  return (
    <TooltipDescriptionContext.Provider value={descriptionId}>
      <TooltipProvider>
        <TooltipPrimitive.Root {...props} />
      </TooltipProvider>
    </TooltipDescriptionContext.Provider>
  );
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const descriptionId = React.useContext(TooltipDescriptionContext);
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      aria-describedby={
        [props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined
      }
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  align = "center",
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<React.ComponentProps<typeof TooltipPrimitive.Positioner>, "side" | "align" | "sideOffset">) {
  const descriptionId = React.useContext(TooltipDescriptionContext);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <TooltipPrimitive.Popup
          id={descriptionId}
          role="tooltip"
          data-slot="tooltip-content"
          className={cn(
            "w-fit origin-(--transform-origin) rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground transition-[opacity,transform] data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-[2px] bg-primary data-[side=top]:-bottom-1 data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
